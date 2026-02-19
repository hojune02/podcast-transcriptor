import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Called by Modal worker after transcription completes, passing transcript_id
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { transcript_id } = await req.json();
    if (!transcript_id) {
      return new Response(JSON.stringify({ error: 'transcript_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the transcript segments
    const { data: transcript, error: fetchError } = await supabase
      .from('transcripts')
      .select('segments, episode_id')
      .eq('id', transcript_id)
      .single();

    if (fetchError || !transcript) {
      return new Response(JSON.stringify({ error: 'Transcript not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const segments = transcript.segments as Array<{ text: string; start: number }> ?? [];
    if (segments.length === 0) {
      return new Response(JSON.stringify({ error: 'No segments to summarize' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build plain text (truncated to ~12k tokens ≈ 48k chars for Groq context)
    const fullText = segments.map((s) => s.text).join(' ');
    const truncatedText = fullText.slice(0, 48000);

    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;

    // Generate summary + chapters
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `You are a podcast summarization assistant. Given a transcript, return a JSON object with:
- "summary": a concise 3-sentence summary of the episode
- "chapters": an array of up to 8 chapter objects, each with { "title": string, "timestamp": number (seconds), "summary": string (1 sentence) }
- "key_topics": an array of 3-6 short topic strings

Return only valid JSON. No markdown, no explanation.`,
          },
          {
            role: 'user',
            content: truncatedText,
          },
        ],
      }),
    });

    if (!groqResponse.ok) {
      const groqErr = await groqResponse.text();
      throw new Error(`Groq API error: ${groqErr}`);
    }

    const groqData = await groqResponse.json();
    const rawContent = groqData.choices?.[0]?.message?.content ?? '{}';

    let parsed: { summary?: string; chapters?: unknown[]; key_topics?: string[] } = {};
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      // Try to extract JSON from potential markdown wrapping
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    }

    // Update transcript with AI content
    const { error: updateError } = await supabase
      .from('transcripts')
      .update({
        summary: parsed.summary ?? null,
        chapters: parsed.chapters ?? null,
        key_topics: parsed.key_topics ?? null,
      })
      .eq('id', transcript_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ success: true, summary: parsed.summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
