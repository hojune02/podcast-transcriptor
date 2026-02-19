export interface Podcast {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  image_url: string | null;
  rss_feed_url: string | null;
  spotify_url: string | null;
  apple_url: string | null;
  created_at: string;
}

export interface Episode {
  id: string;
  podcast_id: string;
  title: string;
  description: string | null;
  audio_url: string;
  duration_seconds: number | null;
  published_at: string | null;
  created_at: string;
  podcast?: Podcast;
}

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface TranscriptionJob {
  id: string;
  user_id: string;
  episode_id: string;
  status: JobStatus;
  progress: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  episode?: Episode;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    score: number;
    speaker?: string;
  }>;
}

export interface Chapter {
  title: string;
  timestamp: number;
  summary: string;
}

export interface Transcript {
  id: string;
  job_id: string;
  episode_id: string;
  user_id: string;
  segments: TranscriptSegment[] | null;
  summary: string | null;
  chapters: Chapter[] | null;
  key_topics: string[] | null;
  language: string | null;
  duration_seconds: number | null;
  word_count: number | null;
  created_at: string;
  episode?: Episode;
}

// Podcast Index API response shapes
export interface PodcastIndexResult {
  id: number;
  title: string;
  author: string;
  description: string;
  image: string;
  url: string;
  link: string;
}

export interface PodcastIndexEpisode {
  id: number;
  title: string;
  description: string;
  enclosureUrl: string;
  duration: number;
  datePublished: number;
}
