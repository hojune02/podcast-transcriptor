import { supabase } from './supabase';
import type { Podcast, Episode, Transcript, TranscriptionJob, PodcastIndexResult } from './types';

// ─── Podcast search via Edge Function ────────────────────────────────────────

export async function searchPodcasts(query: string): Promise<PodcastIndexResult[]> {
  const { data, error } = await supabase.functions.invoke('fetch-podcast', {
    body: { action: 'search', query },
  });
  if (error) throw error;
  return data.results ?? [];
}

export async function fetchPodcastEpisodes(feedUrl: string): Promise<{ podcast: Podcast; episodes: Episode[] }> {
  const { data, error } = await supabase.functions.invoke('fetch-podcast', {
    body: { action: 'episodes', feedUrl },
  });
  if (error) throw error;
  return data;
}

// ─── Transcription ────────────────────────────────────────────────────────────

export async function startTranscription(episodeId: string): Promise<TranscriptionJob> {
  const { data, error } = await supabase.functions.invoke('start-transcription', {
    body: { episode_id: episodeId },
  });
  if (error) throw error;
  return data;
}

export async function getJob(jobId: string): Promise<TranscriptionJob> {
  const { data, error } = await supabase
    .from('transcription_jobs')
    .select('*, episode:episodes(*, podcast:podcasts(*))')
    .eq('id', jobId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Transcripts ──────────────────────────────────────────────────────────────

export async function getTranscript(id: string): Promise<Transcript> {
  const { data, error } = await supabase
    .from('transcripts')
    .select('*, episode:episodes(*, podcast:podcasts(*))')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function getTranscriptByEpisode(episodeId: string): Promise<Transcript | null> {
  const { data, error } = await supabase
    .from('transcripts')
    .select('*, episode:episodes(*, podcast:podcasts(*))')
    .eq('episode_id', episodeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getUserTranscripts(): Promise<Transcript[]> {
  const { data, error } = await supabase
    .from('transcripts')
    .select('*, episode:episodes(title, duration_seconds, podcast:podcasts(title, image_url))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getUserJobs(): Promise<TranscriptionJob[]> {
  const { data, error } = await supabase
    .from('transcription_jobs')
    .select('*, episode:episodes(title, podcast:podcasts(title, image_url))')
    .in('status', ['queued', 'processing'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatTimestamp(seconds: number): string {
  return formatDuration(seconds);
}
