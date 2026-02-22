# PodScribe

AI-powered podcast transcription app built with Expo, Supabase, Modal.com, and Groq.

## Stack

| Layer | Technology |
|-------|-----------|
| Mobile | Expo SDK 54, Expo Router, NativeWind, TypeScript |
| State | Zustand (client), TanStack Query (server) |
| Auth + DB | Supabase (PostgreSQL + Auth + Edge Functions) |
| Transcription | Modal.com + WhisperX (GPU) |
| AI Summaries | Groq API (Llama 3.1 70B) |
| Podcast data | Podcast Index API |

## Project Structure

```
podcast-transcriptor/        ← Expo mobile app (this directory)
├── app/
│   ├── (auth)/              ← Login / Signup screens
│   ├── (tabs)/              ← Search, Library, Profile tabs
│   └── transcript/[id].tsx  ← Transcript viewer with audio player
├── components/              ← Reusable UI components
├── lib/                     ← Supabase client, API helpers, types
├── store/                   ← Zustand global state
│
├── supabase/
│   ├── migrations/          ← PostgreSQL schema
│   └── functions/           ← Deno Edge Functions
│       ├── fetch-podcast/   ← RSS parsing + Podcast Index search
│       ├── start-transcription/  ← Creates job, triggers Modal
│       └── generate-summary/    ← Groq AI summary + chapters
│
└── modal-worker/            ← Python WhisperX transcription worker
    ├── main.py              ← Modal app + webhook endpoint
    └── transcribe.py        ← WhisperX pipeline
```

## Setup

### 1. Get API Keys

| Service | URL | Notes |
|---------|-----|-------|
| Supabase | https://supabase.com | Free tier works |
| Podcast Index | https://api.podcastindex.org | Free |
| Groq | https://console.groq.com | Free tier: 14,400 req/day |
| Modal.com | https://modal.com | Free $30/month credit |

### 2. Supabase setup

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase login
supabase link --project-ref YOUR_PROJECT_ID

# Run migrations
supabase db push

# Set Edge Function secrets
supabase secrets set PODCAST_INDEX_API_KEY=xxx
supabase secrets set PODCAST_INDEX_API_SECRET=xxx
supabase secrets set GROQ_API_KEY=xxx
supabase secrets set MODAL_WEBHOOK_URL=https://your-app.modal.run/webhook

# Deploy Edge Functions
supabase functions deploy fetch-podcast
supabase functions deploy start-transcription
supabase functions deploy generate-summary
```

### 3. Modal.com setup

```bash
pip install modal
modal setup   # authenticate

# Create secrets (used by the transcription function)
modal secret create podscribe-secrets \
  SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  SUPABASE_SERVICE_KEY=your_service_role_key \
  HUGGINGFACE_TOKEN=hf_xxx

# Deploy (get the webhook URL from the output)
cd modal-worker
modal deploy main.py
# → Deployed. Webhook URL: https://your-org--podscribe-transcription-webhook.modal.run
```

Copy the webhook URL into Supabase secrets as `MODAL_WEBHOOK_URL`.

### 4. Mobile app setup

```bash
# Copy env template
cp .env.example .env

# Edit .env with your Supabase URL and anon key
# EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
# EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

npm install
npx expo start
```

Scan the QR code with Expo Go (iOS/Android) or press `i` for iOS simulator.

## Development Workflow

```bash
# Run mobile app
npx expo start

# Test Edge Functions locally
supabase functions serve

# Test Modal worker locally (CPU, no GPU)
cd modal-worker
modal run main.py --audio-url https://example.com/short.mp3 --job-id test --episode-id test --user-id test

# Deploy Modal to production
modal deploy main.py
```

## Feature Checklist

- [x] Email/password authentication
- [x] Podcast search (Podcast Index API)
- [x] Browse podcast episodes via RSS
- [x] Start transcription job
- [x] Real-time job progress polling
- [x] Full transcript with speaker labels
- [x] Audio playback with position tracking
- [x] AI summary (Groq / Llama 3.1)
- [x] Chapter markers with timestamps
- [x] Library of saved transcripts
- [ ] Word-level tap-to-seek (enhancement)
- [ ] Export transcript as text/PDF
- [ ] Apple Sign-In
- [ ] Offline cache

## Architecture: How Transcription Works

```
1. User taps "Transcribe" on episode
       ↓
2. start-transcription Edge Function
   - Checks rate limit (3/day)
   - Creates transcription_jobs row (status: queued)
   - POSTs to Modal webhook (fire & forget)
       ↓
3. Modal webhook (fast HTTP endpoint)
   - Spawns transcribe() as background GPU function
   - Returns immediately with { job_id }
       ↓
4. Modal transcribe() (GPU, async)
   - Downloads audio
   - WhisperX large-v3 → segments + word timestamps
   - PyAnnote diarization → speaker labels
   - Saves to transcripts table
   - Updates job status: completed
   - Calls generate-summary Edge Function
       ↓
5. generate-summary Edge Function
   - Sends transcript to Groq (Llama 3.1 70B)
   - Parses summary + chapters + topics
   - Updates transcripts row
       ↓
6. App polls transcription_jobs every 3s
   - On "completed" → loads transcript
   - Shows transcript + audio player + summary
```
