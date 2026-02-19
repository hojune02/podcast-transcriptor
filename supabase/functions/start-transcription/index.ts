import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TRANSCRIPTIONS_PER_DAY = 20; // rate limit per day

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth: get the calling user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { episode_id } = await req.json();
    if (!episode_id) {
      return new Response(JSON.stringify({ error: 'episode_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting: check how many jobs created today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('transcription_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', today.toISOString());

    if ((count ?? 0) >= TRANSCRIPTIONS_PER_DAY) {
      return new Response(
        JSON.stringify({ error: `Daily limit of ${TRANSCRIPTIONS_PER_DAY} transcriptions reached. Try again tomorrow.` }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if a job is already running for this episode
    const { data: existingJob } = await supabase
      .from('transcription_jobs')
      .select('id, status')
      .eq('episode_id', episode_id)
      .eq('user_id', user.id)
      .in('status', ['queued', 'processing'])
      .maybeSingle();

    if (existingJob) {
      return new Response(JSON.stringify(existingJob), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get episode audio URL
    const { data: episode, error: epError } = await supabase
      .from('episodes')
      .select('audio_url, title')
      .eq('id', episode_id)
      .single();

    if (epError || !episode) {
      return new Response(JSON.stringify({ error: 'Episode not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create transcription job
    const { data: job, error: jobError } = await supabase
      .from('transcription_jobs')
      .insert({
        user_id: user.id,
        episode_id,
        status: 'queued',
        progress: 0,
      })
      .select()
      .single();

    if (jobError) throw jobError;

    // Trigger Modal.com transcription worker
    const MODAL_WEBHOOK_URL = Deno.env.get('MODAL_WEBHOOK_URL');
    if (MODAL_WEBHOOK_URL) {
      // Fire and forget - don't await, let Modal work async
      fetch(MODAL_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          episode_id,
          audio_url: episode.audio_url,
          user_id: user.id,
        }),
      }).catch((err) => console.error('Modal webhook error:', err));
    } else {
      console.warn('MODAL_WEBHOOK_URL not set — transcription worker not triggered');
    }

    return new Response(JSON.stringify(job), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
