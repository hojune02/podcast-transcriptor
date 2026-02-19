-- PodScribe Initial Schema
-- Run: supabase db push

-- ─── Podcasts ─────────────────────────────────────────────────────────────────
CREATE TABLE podcasts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  author      TEXT,
  description TEXT,
  image_url   TEXT,
  rss_feed_url TEXT UNIQUE,
  spotify_url TEXT,
  apple_url   TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── Episodes ─────────────────────────────────────────────────────────────────
CREATE TABLE episodes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_id       UUID REFERENCES podcasts(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  audio_url        TEXT NOT NULL,
  duration_seconds INTEGER,
  published_at     TIMESTAMP WITH TIME ZONE,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_episodes_podcast_id ON episodes(podcast_id);

-- ─── Transcription Jobs ───────────────────────────────────────────────────────
CREATE TABLE transcription_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  episode_id    UUID REFERENCES episodes(id) ON DELETE CASCADE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  progress      INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at  TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_jobs_user_id ON transcription_jobs(user_id);
CREATE INDEX idx_jobs_episode_id ON transcription_jobs(episode_id);
CREATE INDEX idx_jobs_status ON transcription_jobs(status);

-- ─── Transcripts ──────────────────────────────────────────────────────────────
CREATE TABLE transcripts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID REFERENCES transcription_jobs(id) ON DELETE CASCADE,
  episode_id       UUID REFERENCES episodes(id),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- WhisperX output: array of segments with word-level timestamps
  segments         JSONB,

  -- AI-generated content
  summary          TEXT,
  chapters         JSONB,   -- [{title, timestamp, summary}]
  key_topics       TEXT[],

  -- Metadata
  language         TEXT,
  duration_seconds INTEGER,
  word_count       INTEGER,

  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_transcripts_user_id ON transcripts(user_id);
CREATE INDEX idx_transcripts_episode_id ON transcripts(episode_id);
CREATE INDEX idx_transcripts_job_id ON transcripts(job_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE podcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcription_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;

-- Podcasts and episodes are publicly readable (shared catalog)
CREATE POLICY "Podcasts are publicly readable"
  ON podcasts FOR SELECT USING (true);

CREATE POLICY "Anyone can insert podcasts"
  ON podcasts FOR INSERT WITH CHECK (true);

CREATE POLICY "Episodes are publicly readable"
  ON episodes FOR SELECT USING (true);

CREATE POLICY "Anyone can insert episodes"
  ON episodes FOR INSERT WITH CHECK (true);

-- Jobs: users see only their own
CREATE POLICY "Users can view own jobs"
  ON transcription_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own jobs"
  ON transcription_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can update jobs"
  ON transcription_jobs FOR UPDATE
  USING (true);

-- Transcripts: users see only their own
CREATE POLICY "Users can view own transcripts"
  ON transcripts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert transcripts"
  ON transcripts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update transcripts"
  ON transcripts FOR UPDATE
  USING (true);
