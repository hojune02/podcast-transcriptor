import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchRequest {
  action: 'search';
  query: string;
}

interface EpisodesRequest {
  action: 'episodes';
  feedUrl: string;
}

type RequestBody = SearchRequest | EpisodesRequest;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body: RequestBody = await req.json();

    if (body.action === 'search') {
      return await handleSearch(body.query);
    } else if (body.action === 'episodes') {
      return await handleEpisodes(body.feedUrl, supabase);
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleSearch(query: string) {
  const PODCAST_INDEX_KEY = Deno.env.get('PODCAST_INDEX_API_KEY')!;
  const PODCAST_INDEX_SECRET = Deno.env.get('PODCAST_INDEX_API_SECRET')!;

  // Podcast Index requires HMAC-SHA1 auth
  const epoch = Math.floor(Date.now() / 1000);
  const authString = PODCAST_INDEX_KEY + PODCAST_INDEX_SECRET + epoch;
  const hashBuffer = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(authString)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  // Detect if query looks like a URL (Spotify or Apple Podcasts)
  let searchUrl: string;
  if (query.includes('spotify.com') || query.includes('podcasts.apple.com')) {
    // For URLs, try to extract podcast name or use as-is in a search
    const sanitized = query.replace(/https?:\/\/[^/]+\//, '').replace(/[/-]/g, ' ').trim();
    searchUrl = `https://api.podcastindex.org/api/1.0/search/byterm?q=${encodeURIComponent(sanitized)}&max=10`;
  } else {
    searchUrl = `https://api.podcastindex.org/api/1.0/search/byterm?q=${encodeURIComponent(query)}&max=10`;
  }

  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'PodScribe/1.0',
      'X-Auth-Key': PODCAST_INDEX_KEY,
      'X-Auth-Date': String(epoch),
      'Authorization': hashHex,
    },
  });

  const data = await response.json();
  return new Response(
    JSON.stringify({ results: data.feeds ?? [] }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleEpisodes(feedUrl: string, supabase: ReturnType<typeof createClient>) {
  // Fetch and parse the RSS feed
  const rssResponse = await fetch(feedUrl);
  const rssText = await rssResponse.text();

  const podcast = parseRssPodcast(rssText, feedUrl);
  const episodes = parseRssEpisodes(rssText);

  // Upsert podcast
  const { data: podcastRow, error: podcastError } = await supabase
    .from('podcasts')
    .upsert(
      { ...podcast, rss_feed_url: feedUrl },
      { onConflict: 'rss_feed_url', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (podcastError) throw podcastError;

  // Upsert episodes (use title + podcast_id as logical key)
  const episodeRows = episodes.map((ep) => ({
    ...ep,
    podcast_id: podcastRow.id,
  }));

  const { data: episodeData, error: episodeError } = await supabase
    .from('episodes')
    .upsert(episodeRows, { onConflict: 'id', ignoreDuplicates: true })
    .select();

  if (episodeError) {
    // Fallback: just insert what we can
    console.error('Episode upsert error:', episodeError);
  }

  // Return episodes from DB for this podcast (most recent first)
  const { data: dbEpisodes } = await supabase
    .from('episodes')
    .select('*')
    .eq('podcast_id', podcastRow.id)
    .order('published_at', { ascending: false })
    .limit(50);

  return new Response(
    JSON.stringify({ podcast: podcastRow, episodes: dbEpisodes ?? [] }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function getTagContent(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
}

function getAttrValue(xml: string, tag: string, attr: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i'));
  return match ? match[1] : '';
}

function parseRssPodcast(xml: string, feedUrl: string) {
  // Extract the channel block (before first <item>)
  const channelMatch = xml.match(/<channel>([\s\S]*?)<item>/i);
  const channel = channelMatch ? channelMatch[1] : xml;

  return {
    title: getTagContent(channel, 'title') || 'Unknown Podcast',
    author: getTagContent(channel, 'itunes:author') || getTagContent(channel, 'author'),
    description: getTagContent(channel, 'description'),
    image_url: getAttrValue(channel, 'itunes:image', 'href') || getTagContent(channel, 'url'),
  };
}

function parseRssEpisodes(xml: string) {
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const episodes: Array<{
    title: string;
    description: string | null;
    audio_url: string;
    duration_seconds: number | null;
    published_at: string | null;
  }> = [];

  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const audioUrl = getAttrValue(item, 'enclosure', 'url');
    if (!audioUrl) continue;

    const title = getTagContent(item, 'title') || 'Untitled';
    const description = getTagContent(item, 'description') || getTagContent(item, 'itunes:summary') || null;
    const durationStr = getTagContent(item, 'itunes:duration');
    const pubDateStr = getTagContent(item, 'pubDate');

    // Parse duration: can be "1:23:45" or "5025" (seconds)
    let durationSeconds: number | null = null;
    if (durationStr) {
      if (durationStr.includes(':')) {
        const parts = durationStr.split(':').map(Number);
        if (parts.length === 3) durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        else if (parts.length === 2) durationSeconds = parts[0] * 60 + parts[1];
      } else {
        durationSeconds = parseInt(durationStr, 10) || null;
      }
    }

    const publishedAt = pubDateStr ? new Date(pubDateStr).toISOString() : null;

    episodes.push({
      title,
      description,
      audio_url: audioUrl,
      duration_seconds: durationSeconds,
      published_at: publishedAt,
    });

    if (episodes.length >= 50) break;
  }

  return episodes;
}
