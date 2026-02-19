# PodScribe — Complete Project Explanation

This document explains every part of the PodScribe project: what it does, how it works,
what every technology is, and why it was chosen. It is written for someone who has never
written a line of code. Technical details are also included after each plain-language
explanation, so a developer can use this document too.

---

## Table of Contents

1. [What Does PodScribe Do?](#1-what-does-podscribe-do)
2. [The Big Picture — Architecture Overview](#2-the-big-picture--architecture-overview)
3. [The Technology Stack — Plain Language](#3-the-technology-stack--plain-language)
4. [The Mobile App (Expo / React Native)](#4-the-mobile-app-expo--react-native)
5. [The Database and Backend (Supabase)](#5-the-database-and-backend-supabase)
6. [The AI Transcription Engine (Modal + WhisperX)](#6-the-ai-transcription-engine-modal--whisperx)
7. [The AI Summary Generator (Groq + Llama 3)](#7-the-ai-summary-generator-groq--llama-3)
8. [The Podcast Directory (Podcast Index API)](#8-the-podcast-directory-podcast-index-api)
9. [Every File Explained](#9-every-file-explained)
10. [The Database Schema Explained](#10-the-database-schema-explained)
11. [The Complete Data Flow — Step by Step](#11-the-complete-data-flow--step-by-step)
12. [Security Model](#12-security-model)
13. [Cost and Scaling Notes](#13-cost-and-scaling-notes)

---

## 1. What Does PodScribe Do?

PodScribe is a mobile application for iOS and Android. Its purpose is simple: you find a
podcast episode, tap a button, and within a few minutes you get a full text transcript of
that episode, complete with an AI-generated summary, chapter markers, and key topics.

Think of it like YouTube's auto-generated captions, but for any podcast you can find,
with far higher accuracy — especially for non-English languages like Mandarin Chinese.

**The core user journey:**

1. Open the app on your phone.
2. Sign up or log in with your email and password.
3. Search for any podcast by name (e.g. "声东击西", a popular Chinese podcast).
4. Browse the list of recent episodes.
5. Tap "Transcribe" on any episode.
6. Wait a few minutes while AI processes the audio.
7. Read the full transcript with word-level timestamps, or listen to the episode while
   the transcript highlights the word currently being spoken.
8. Read the AI-generated 3-sentence summary, chapter breakdown, and key topics.

---

## 2. The Big Picture — Architecture Overview

Modern apps are rarely one single program. PodScribe is split into several independent
services that each do one job. Here is a high-level diagram:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Your Phone                                   │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │                  Expo Mobile App (React Native)              │  │
│   │  • Shows the UI (buttons, text, lists)                       │  │
│   │  • Handles login / logout                                    │  │
│   │  • Plays audio episodes                                      │  │
│   │  • Displays transcripts                                      │  │
│   └────────────┬────────────────────┬────────────────────────────┘  │
└────────────────│────────────────────│───────────────────────────────┘
                 │ reads/writes data  │ searches podcasts
                 ▼                    ▼
┌───────────────────────────┐  ┌──────────────────────────────────────┐
│       Supabase            │  │        Podcast Index API             │
│                           │  │  (podcast search directory)          │
│  ┌─────────────────────┐  │  │  • Free, public API                  │
│  │  PostgreSQL Database│  │  │  • 4 million+ podcasts indexed       │
│  │  • users            │  │  │  • Returns RSS feed URLs             │
│  │  • podcasts         │  │  └──────────────────────────────────────┘
│  │  • episodes         │  │
│  │  • jobs             │  │
│  │  • transcripts      │  │
│  └─────────────────────┘  │
│                           │
│  ┌─────────────────────┐  │
│  │  Edge Functions     │  │   triggers
│  │  (server-side code) │──┼──────────────────────────────────────────┐
│  │  • fetch-podcast    │  │                                          │
│  │  • start-transcr.  │  │                                          │
│  │  • generate-summary│  │                                          │
│  └─────────────────────┘  │                                          │
│                           │                                          │
│  ┌─────────────────────┐  │                                          │
│  │  Authentication     │  │                                          │
│  │  (login / signup)   │  │                                          │
│  └─────────────────────┘  │                                          │
└───────────────────────────┘                                          │
                                                                       │
┌──────────────────────────────────────────────────────────────────────┘
│
▼
┌───────────────────────────────────────────────────────────────────────┐
│                       Modal.com (Cloud GPU)                           │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  webhook endpoint (receives job from Supabase)                │   │
│  └──────────────────────────────┬────────────────────────────────┘   │
│                                 │ spawns GPU job                     │
│  ┌──────────────────────────────▼────────────────────────────────┐   │
│  │  transcribe function (runs on NVIDIA A10G GPU)                │   │
│  │  1. Downloads podcast audio file                              │   │
│  │  2. Runs WhisperX (AI speech-to-text, large-v3 model)         │   │
│  │  3. Aligns words to exact timestamps                          │   │
│  │  4. Saves transcript to Supabase                              │   │
│  │  5. Triggers generate-summary edge function                   │   │
│  └───────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
          │
          │ calls Groq API
          ▼
┌───────────────────────────────┐
│  Groq API (Llama 3.1 70B)     │
│  • Reads transcript text      │
│  • Returns JSON with:         │
│    - 3-sentence summary       │
│    - chapter list             │
│    - key topics               │
└───────────────────────────────┘
```

---

## 3. The Technology Stack — Plain Language

Before diving into each part, here is a plain-language explanation of every major
technology used in this project.

---

### Expo and React Native

**What is it, for a non-coder?**

When you build a phone app, you normally have to write it twice: once for iPhone (in
Apple's programming language Swift) and once for Android (in Google's programming
language Kotlin/Java). React Native is a technology made by Facebook (Meta) that lets
you write your app **once** and it runs on both platforms. Expo is a toolkit built on
top of React Native that handles all the complicated setup for you, so you can start
building immediately.

**The analogy:** If React Native is like a universal remote that works with both Samsung
and LG TVs, Expo is like the universal remote already pre-programmed with your specific
TV model — you don't need to configure anything.

**Technical details:**

React Native compiles JavaScript/TypeScript code into native mobile components. It uses
a "bridge" (or in newer versions, JSI — JavaScript Interface) to communicate between
JavaScript and native platform APIs. Expo adds a managed workflow with over-the-air
updates, a standard library of device APIs, and a build service (EAS).

This project uses:
- **Expo SDK 54** — the runtime environment
- **Expo Router v4** — file-based navigation (similar to Next.js for the web)
- **TypeScript** — JavaScript with type checking to catch bugs early
- **NativeWind v4** — Tailwind CSS utility classes adapted for React Native (styles
  the visual appearance)
- **TanStack Query (React Query v5)** — manages fetching, caching, and refreshing data
  from the server
- **Zustand** — lightweight global state management (shared data between screens)
- **Expo AV** — plays audio files from URLs

---

### Supabase

**What is it, for a non-coder?**

Every app needs somewhere to store data — user accounts, saved content, preferences.
This storage is called a "backend" or "database." Traditionally, building a backend
required a separate team of engineers. Supabase is a service that gives you a complete,
production-ready backend with almost no configuration. It provides:

- A **database** (think of it as a very powerful Excel spreadsheet that can hold
  millions of rows and be queried instantly)
- **User authentication** (login, signup, password reset — all handled for you)
- **Edge Functions** (small programs that run on Supabase's servers, not your phone)
- **Row Level Security** (a way to ensure users can only see their own data)

**The analogy:** If your app were a restaurant, Supabase is the kitchen, storage room,
and cash register combined — you just need to design the menu and serve the customers.

**Technical details:**

Supabase is an open-source Firebase alternative built on PostgreSQL. It provides:
- A managed PostgreSQL database with a REST API auto-generated from your schema
- Authentication backed by GoTrue (supports email/password, OAuth, magic links)
- Edge Functions running on Deno (a JavaScript/TypeScript runtime) deployed to
  Cloudflare's global edge network
- Real-time subscriptions via WebSockets
- Row Level Security (RLS) policies written in SQL that enforce per-user data isolation
  at the database level

The client library (`@supabase/supabase-js`) is used in the app with AsyncStorage for
session persistence across app restarts.

---

### Modal.com

**What is it, for a non-coder?**

Running AI speech-to-text on a large audio file is extremely computationally expensive.
A normal computer would take hours. To make it fast (2-5 minutes per episode), you need
a **GPU** — a specialized chip originally designed for video games but now used heavily
for AI. Renting a GPU server full-time would be expensive ($200+/month). Modal.com is a
service that lets you run code on a GPU for only the seconds you actually need it, then
stop — so you pay fractions of a cent per transcription instead.

**The analogy:** Modal is like a taxi. You don't own a car (GPU server). You call a taxi
when you need one, pay for just that ride, and the taxi goes away when you're done.
Owning a car (dedicated GPU server) would be far more expensive if you only use it
occasionally.

**Technical details:**

Modal is a serverless compute platform specialized for ML workloads. Key features used:
- **Container images**: A reproducible Docker-like environment is built once and cached.
  The image includes CUDA, PyTorch, WhisperX, and all dependencies.
- **GPU functions**: `@app.function(gpu="A10G")` provisions an NVIDIA A10G (24GB VRAM)
  on-demand. Cold starts take ~30s; warm containers respond immediately.
- **Webhook endpoint**: `@modal.fastapi_endpoint` exposes an HTTP endpoint that receives
  the job payload and calls `transcribe.spawn()` asynchronously, returning immediately.
- **Secrets**: API keys are stored as Modal secrets, injected as environment variables
  at runtime, never embedded in code.
- **`.add_local_file()`**: The `transcribe.py` file is baked into the container image at
  deploy time so it's importable inside the GPU container.

---

### WhisperX

**What is it, for a non-coder?**

OpenAI (the company behind ChatGPT) released a free AI model called Whisper that can
transcribe speech in 99 languages. WhisperX is an improved version made by researchers
at the University of Edinburgh that adds two important features: exact word-level
timestamps (you know precisely when each word was spoken) and speaker diarization
(identifying who is speaking when, e.g. "Speaker 1: ... Speaker 2: ...").

**Technical details:**

WhisperX operates in three pipeline stages:
1. **Transcription**: Uses `faster-whisper` (a CTranslate2-optimized version of OpenAI
   Whisper) with the `large-v3` model (1.5 billion parameters). Batch size 16 is used
   for GPU throughput. Output: segments with text and rough timestamps.
2. **Alignment**: Uses language-specific forced alignment models (from `torchaudio` and
   `pyannote`) to produce word-level timestamps accurate to ~20ms.
3. **Diarization** (optional, requires HuggingFace token): Uses `pyannote.audio 3.1.1`
   to assign speaker labels to each word segment.

The model is pre-downloaded into the Docker image (`run_commands`) at build time to
avoid cold-start delays on each transcription run.

---

### Groq API (Llama 3)

**What is it, for a non-coder?**

After transcription, the app generates a summary, chapters, and key topics automatically.
This is done by sending the transcript text to Groq, a company that runs Meta's open-
source AI language model Llama 3.1 (70 billion parameter version) at extremely fast
speeds. The AI reads the transcript and writes a short summary in seconds.

**The analogy:** If you gave a very well-read assistant your full podcast transcript and
asked them to "please write a 3-sentence summary, a chapter list, and the main topics
discussed," Groq/Llama is that assistant — except it does it in 3-5 seconds.

**Technical details:**

Groq uses custom-designed LPU (Language Processing Unit) chips that can run large
language model inference at 500+ tokens/second, compared to ~30 tokens/second on a
typical A100 GPU. The free tier allows substantial usage for development.

The `generate-summary` Edge Function sends a structured prompt asking the model to
return a JSON object with `summary`, `chapters`, and `key_topics` fields. The response
is parsed and stored back in the `transcripts` table, where the mobile app reads it.

The model used is `llama-3.1-70b-versatile` which supports multilingual input — it can
summarize Chinese, English, Spanish, or any other language in the transcript.

---

### Podcast Index API

**What is it, for a non-coder?**

There are millions of podcasts in the world. To let users search for any podcast by
name, PodScribe uses the Podcast Index API — a free, open directory of 4+ million
podcasts maintained by the creators of the "Podcasting 2.0" movement. When you type
"声东击西" in the search bar, the app asks Podcast Index: "Do you know a podcast with
this name?" and it returns the RSS feed URL for that podcast.

An RSS feed is a standard format that every podcast uses to publish its episodes. Once
PodScribe has the RSS feed URL, it can download the list of episodes directly.

**Technical details:**

Authentication to Podcast Index uses HMAC-SHA1. The client combines the API key,
secret, and current Unix timestamp, hashes it with SHA-1, and sends the hash in the
`Authorization` header. This prevents replay attacks since the timestamp is verified
server-side to be recent.

The `fetch-podcast` Edge Function handles both actions:
- `search`: Calls `GET /api/1.0/search/byterm?q={query}&max=10`
- `episodes`: Fetches and parses the RSS XML directly, extracting episode metadata
  (title, audio URL, duration, publish date) from `<item>` elements, specifically the
  `<enclosure url="...">` tag for the audio file URL.

---

## 4. The Mobile App (Expo / React Native)

### File Structure

```
app/                     ← screens (pages)
  _layout.tsx            ← root layout: auth gate, navigation setup
  (auth)/
    _layout.tsx          ← auth screens layout
    login.tsx            ← login screen
    signup.tsx           ← sign-up screen
  (tabs)/
    _layout.tsx          ← bottom tab bar layout
    index.tsx            ← Search screen (home)
    library.tsx          ← Library screen
    profile.tsx          ← Profile screen
  transcript/
    [id].tsx             ← Transcript viewer (dynamic route)

components/              ← reusable UI pieces
  SearchBar.tsx          ← text input with search/clear buttons
  PodcastCard.tsx        ← card showing podcast title/image/description
  EpisodeCard.tsx        ← card showing episode with Transcribe button
  AudioPlayer.tsx        ← play/pause/seek audio player
  TranscriptViewer.tsx   ← scrolling transcript with word highlighting

lib/                     ← shared logic
  supabase.ts            ← Supabase client setup
  api.ts                 ← all API call functions
  types.ts               ← TypeScript type definitions

store/
  useStore.ts            ← global app state (Zustand)
```

### Navigation (Expo Router)

Expo Router uses a "file-based routing" system. The name and location of a file in the
`app/` directory determines its URL/route. This is similar to how a website works:
`app/login.tsx` is the `/login` page.

- `(auth)` and `(tabs)` are "route groups" — the parentheses mean they don't appear in
  the URL. `(auth)` groups the login/signup screens; `(tabs)` groups the main app
  screens behind a bottom tab bar.
- `[id].tsx` is a "dynamic route" — the square brackets mean the `id` part comes from
  the URL. `/transcript/abc-123` would pass `id = "abc-123"` to this screen.

### Authentication Gate (`app/_layout.tsx`)

This is the "bouncer" of the app. Every time the app starts, it checks:
"Is the user logged in?" If not, it redirects to the login screen. If they are logged
in and try to go back to login, it redirects them to the main app.

The key challenge here is timing: the navigation system and the session check both
happen asynchronously (not instantly). The `useRootNavigationState` hook ensures we
don't try to navigate before the navigation system is ready, preventing a crash.

### Global State (Zustand Store)

The Zustand store holds data that needs to be shared between multiple screens:

- `session`: The logged-in user's authentication token. Every screen can read this.
- `currentEpisode`, `playbackPosition`, `isPlaying`: The currently playing audio
  episode and its position. The AudioPlayer writes these; the TranscriptViewer reads
  them to highlight the current word.
- `selectedPodcast`: The podcast the user tapped on in search, needed by the episode
  list screen.

Think of the Zustand store as a shared whiteboard in the middle of the app — any
screen can read from it or write to it.

### Server State (TanStack Query)

TanStack Query handles all communication with the server. It provides:
- **Caching**: Results are remembered for 5 minutes so you don't re-fetch the same data
- **Loading states**: Knows when a request is in progress
- **Error states**: Catches failures automatically
- **Refetch intervals**: The Library screen polls the server every 5 seconds to check
  if a transcription job is done

The separation between Zustand (for UI/client state) and TanStack Query (for server
data) is a key architectural pattern: Zustand holds what the user is currently doing;
TanStack Query holds the data from the server.

---

## 5. The Database and Backend (Supabase)

### The Four Tables

Think of a database as a collection of spreadsheets. PodScribe has four:

**1. `podcasts`**
Stores information about each podcast (not individual episodes).

| Column | What it is |
|--------|-----------|
| `id` | A unique ID (like a social security number for the podcast) |
| `title` | The podcast's name |
| `author` | Who makes it |
| `description` | What it's about |
| `image_url` | URL to the podcast's cover art |
| `rss_feed_url` | The RSS feed URL (unique — no duplicate podcasts) |

**2. `episodes`**
Each row is one episode of a podcast.

| Column | What it is |
|--------|-----------|
| `id` | Unique ID for this episode |
| `podcast_id` | Points to which podcast this belongs to |
| `title` | Episode title |
| `audio_url` | Direct URL to the MP3/audio file |
| `duration_seconds` | How long it is in seconds |
| `published_at` | When it was released |

**3. `transcription_jobs`**
Tracks the progress of a transcription request.

| Column | What it is |
|--------|-----------|
| `id` | Unique job ID |
| `user_id` | Who requested it |
| `episode_id` | Which episode to transcribe |
| `status` | `queued`, `processing`, `completed`, or `failed` |
| `progress` | 0-100 percentage |
| `error_message` | If it failed, what went wrong |

**4. `transcripts`**
The final output: the full transcript and AI analysis.

| Column | What it is |
|--------|-----------|
| `id` | Unique transcript ID |
| `episode_id` | Which episode this is for |
| `user_id` | Who owns this transcript |
| `segments` | JSON: array of text segments each with start/end timestamps |
| `summary` | AI-generated 3-sentence summary |
| `chapters` | AI-generated chapter list |
| `key_topics` | AI-generated topic tags |
| `language` | Detected language code (e.g. "zh" for Chinese) |
| `word_count` | Total words transcribed |

### Row Level Security (RLS)

Row Level Security is a powerful database feature that enforces privacy rules directly
in the database layer. Even if a bug in the app code accidentally tried to show you
someone else's transcripts, the database would refuse the request.

The rules are:
- **Podcasts and episodes**: Anyone can read or add them (shared public catalog)
- **Jobs**: You can only see your own transcription jobs
- **Transcripts**: You can only see your own transcripts
- **Service role** (used by Modal and Edge Functions): Can write/update everything,
  bypassing user restrictions. This is like a master key given only to the server.

### Edge Functions

Edge Functions are small programs that run on Supabase's servers, not on the user's
phone. There are three:

**`fetch-podcast`**

Called when the user searches for a podcast or taps on one to see episodes.

- `action: "search"`: Queries the Podcast Index API with HMAC-SHA1 auth, returns a
  list of matching podcasts.
- `action: "episodes"`: Downloads and parses the podcast's RSS XML feed, extracts the
  last 50 episodes, upserts them into the `episodes` table, and returns them.

Why run this on the server instead of directly from the phone? Because Podcast Index
requires API keys that must be kept secret. If they were in the phone app, anyone could
extract them and abuse the API. Server-side functions keep secrets safe.

**`start-transcription`**

Called when the user taps the "Transcribe" button on an episode. It:
1. Verifies the user is logged in
2. Checks if they've exceeded the daily rate limit (20 transcriptions/day)
3. Checks if this episode is already being transcribed
4. Creates a new `transcription_jobs` row with status `queued`
5. Calls the Modal.com webhook URL with the job details (fire-and-forget — doesn't wait
   for transcription to finish)
6. Returns the job row to the app immediately so it can navigate to the progress screen

**`generate-summary`**

Called by the Modal worker after transcription finishes. It:
1. Reads the transcript's `segments` from the database
2. Joins all segment texts into one long string (capped at 48,000 characters)
3. Sends this text to the Groq API with a structured prompt asking for a JSON response
4. Parses the JSON response
5. Updates the `transcripts` row with `summary`, `chapters`, and `key_topics`

---

## 6. The AI Transcription Engine (Modal + WhisperX)

### `modal-worker/main.py` — The Orchestrator

This file defines two things:

**The container image** (`transcription_image`): A reproducible, immutable environment
containing every dependency the transcription needs:
- Debian Linux base OS
- ffmpeg: A tool for processing audio/video files (converting formats, extracting audio)
- PyTorch 2.1.0 with CUDA: The deep learning framework that runs WhisperX on the GPU
- pyannote.audio: Speaker diarization library
- faster-whisper + whisperx: The transcription engine
- supabase: Python client to save results to the database
- `transcribe.py`: The actual transcription logic, baked in at build time

**The two endpoints**:

1. `transcribe()` — a GPU function. When called, it runs on an NVIDIA A10G GPU. It
   imports `run_transcription` from `transcribe.py` and calls it. If anything fails,
   it marks the job as `failed` in the database before re-raising the exception.

2. `webhook()` — a lightweight HTTP endpoint that receives POST requests from the
   `start-transcription` Supabase Edge Function. It extracts the job details and calls
   `transcribe.spawn()` (asynchronously — returns immediately without waiting for the
   GPU job to finish), then responds with `{"status": "queued"}`.

### `modal-worker/transcribe.py` — The Pipeline

This file contains the actual transcription logic in `run_transcription()`:

**Step 1: Download the audio** (`download_audio`)
Uses `wget` to download the podcast audio file to a temporary directory. Follows HTTP
redirects, has a 120-second timeout.

**Step 2: Get duration**
Uses `torchaudio.info()` to quickly read the audio file metadata (without loading the
full audio into memory) to get the total duration in seconds.

**Step 3: Transcription pipeline** (`transcribe_audio`)
- Updates the job to `status: processing, progress: 10%`
- Loads the WhisperX `large-v3` model (already cached in the image)
- Runs `model.transcribe()` with batch_size=16 for throughput
- Deletes the model from GPU memory (important — frees ~3GB)
- Updates progress to 40%
- Loads a language-specific alignment model
- Runs `whisperx.align()` to attach word-level timestamps to each word
- Updates progress to 70%
- If a HuggingFace token is available, runs speaker diarization
- Updates progress to 90%

**Step 4: Save to database** (`save_transcript`)
Inserts a new row into the `transcripts` table with all the segments data (a JSONB
array where each element contains `text`, `start`, `end`, and `words` arrays).

**Step 5: Mark job complete**
Updates `transcription_jobs` to `status: completed, progress: 100, completed_at: now`.

**Step 6: Trigger summary** (`trigger_summary`)
Calls the `generate-summary` Supabase Edge Function via HTTP POST, passing the
`transcript_id`. This is fire-and-forget — the transcription is complete regardless of
whether the summary generation succeeds.

---

## 7. The AI Summary Generator (Groq + Llama 3)

### `supabase/functions/generate-summary/index.ts`

This Deno Edge Function is called after transcription completes. It communicates with
the Groq API using OpenAI-compatible API format (the same request shape as OpenAI's
GPT API, but routed to Groq's faster infrastructure).

**The prompt strategy:**
The system message instructs the model to act as a "podcast summarization assistant"
and return only valid JSON (no extra text, no markdown). The user message is the
transcript text, truncated to 48,000 characters (~12,000 tokens, safely within Llama
3.1's 128K context window).

**The response format:**
```json
{
  "summary": "A 3-sentence summary of the episode.",
  "chapters": [
    { "title": "Introduction", "timestamp": 0, "summary": "Host introduces guests." },
    { "title": "Main topic", "timestamp": 120, "summary": "Discussion begins." }
  ],
  "key_topics": ["social media", "platform governance", "misinformation"]
}
```

The function includes fallback JSON parsing: if the model wraps the JSON in a markdown
code block (```json ... ```), a regex extracts the JSON from inside the block.

---

## 8. The Podcast Directory (Podcast Index API)

### How Podcast Search Works

When you type "声东击西" in the search bar and tap search, this is what happens:

1. The app calls `searchPodcasts("声东击西")` in `lib/api.ts`
2. This calls `supabase.functions.invoke('fetch-podcast', { body: { action: 'search', query: '声东击西' } })`
3. The Supabase Edge Function makes an authenticated request to
   `https://api.podcastindex.org/api/1.0/search/byterm?q=声东击西&max=10`
4. Authentication: The function computes HMAC-SHA1 of `apiKey + secret + timestamp`
   using the Web Crypto API built into Deno
5. The Podcast Index returns an array of matching podcasts, each with fields like
   `id`, `title`, `author`, `description`, `image`, `url` (RSS feed URL)
6. The Edge Function returns `{ results: [...] }` to the app
7. The app renders each result as a `PodcastCard` component

### How Episodes Are Loaded

When you tap a podcast to see its episodes:

1. The app calls `fetchPodcastEpisodes(podcast.url)` with the RSS feed URL
2. The Edge Function downloads the RSS XML: a text file in a standard format
3. It parses the XML using regex to find all `<item>` elements (each is one episode)
4. For each item, it extracts the `<enclosure url="...">` attribute (the audio file),
   `<title>`, `<description>`, `<itunes:duration>`, and `<pubDate>`
5. It upserts the podcast into the `podcasts` table and the episodes into `episodes`
6. It returns the episodes sorted by publish date (newest first)

---

## 9. Every File Explained

### App Files

**`app/_layout.tsx`** — Root layout
Sets up the entire app. Creates the navigation stack (the system for going between
screens), wraps everything in `QueryClientProvider` (so TanStack Query works
everywhere), and runs the `AuthGate` component. AuthGate watches the login state and
redirects users to login if they're not authenticated.

**`app/(auth)/login.tsx`** and **`app/(auth)/signup.tsx`**
Standard login and signup forms. They call `signIn()` or `signUp()` from `lib/api.ts`,
handle loading states (show a spinner while waiting), and display error messages if
the login fails (e.g. wrong password). On success, the AuthGate automatically detects
the new session and redirects to the main app.

**`app/(tabs)/_layout.tsx`**
Defines the bottom tab bar with three tabs: Search (🔍), Library (📚), Profile (👤).
Styles the tab bar with a dark theme. Each tab name corresponds to a file in
`app/(tabs)/`.

**`app/(tabs)/index.tsx`** — Search Screen (Home)
The main screen. Has two "view states":
- `search`: Shows a search bar and the list of podcast results
- `episodes`: Shows episodes of the selected podcast

When a user taps "Transcribe" on an episode, it first checks if a transcript already
exists for that episode — if so, it navigates directly to the transcript viewer instead
of starting a new transcription.

**`app/(tabs)/library.tsx`** — Library Screen
Shows the user's transcription history. Active jobs (queued/processing) appear at the
top with a progress bar. Completed transcripts appear below. Both lists refresh every
5 seconds automatically. Pull-down gesture also refreshes the transcripts list.

**`app/(tabs)/profile.tsx`** — Profile Screen
Shows the user's email address, their total transcript and job counts, and a "Sign Out"
button that asks for confirmation before signing out.

**`app/transcript/[id].tsx`** — Transcript Viewer
The most complex screen. It handles two cases:
1. **Job view** (`?isJob=true`): The transcription is still running. Shows a progress bar
   that updates every 3 seconds. When the job completes, automatically loads the
   transcript.
2. **Transcript view** (no `?isJob`): The transcript is complete. Shows three tabs:
   - **Transcript**: The full text, word by word, with the current word highlighted as
     audio plays
   - **Chapters**: Chapter list from the AI, tap any chapter to jump to that position
   - **Summary**: The 3-sentence AI summary and key topics

At the bottom, the `AudioPlayer` is always visible so you can listen while reading.

### Component Files

**`components/SearchBar.tsx`**
A text input field with a search button and a clear (×) button. When the user types
and taps search or presses Enter, it calls the `onSubmit` callback. The clear button
appears only when there's text.

**`components/PodcastCard.tsx`**
A tappable card showing a podcast's cover image, title, author, and description. It
can display both `PodcastIndexResult` objects (from search) and `Podcast` objects (from
the database) because it has a type guard function (`isPodcastIndexResult`) that detects
which type it has and reads the correct field names.

**`components/EpisodeCard.tsx`**
A card showing an episode's title, publish date, and duration. The button changes:
- "Transcribe" if no transcript exists
- "Transcribing X%" with a progress bar if a job is running
- "View Transcript" if the transcript is ready

**`components/AudioPlayer.tsx`**
An audio player built on Expo AV. Has play/pause toggle, skip back 15 seconds, skip
forward 15 seconds, a seek bar (tap/drag to jump in the audio), and time display.
When playback position changes, it writes to the Zustand store so `TranscriptViewer`
can highlight the current word.

**`components/TranscriptViewer.tsx`**
A scrollable list of transcript segments. Each segment shows the speaker label (if
speaker diarization ran) and the text. The currently-active segment (based on
`playbackPosition` from the Zustand store) is highlighted and automatically scrolled
into view. Tap any segment to seek the audio to that point. Exports a `ChapterList`
component used by the chapters tab.

### Library Files

**`lib/supabase.ts`**
Creates and exports the Supabase client. Critically, it configures `AsyncStorage` for
session persistence — this means your login is remembered even after closing the app.
Without this, you'd need to log in every time you opened the app.

**`lib/api.ts`**
All the functions that make network requests are centralized here. This is good practice
("single source of truth") — if an API endpoint changes, you only change it in one file.
Functions: `searchPodcasts`, `fetchPodcastEpisodes`, `startTranscription`, `getJob`,
`getTranscript`, `getTranscriptByEpisode`, `getUserTranscripts`, `getUserJobs`,
`signIn`, `signUp`, `signOut`, `formatDuration`, `formatTimestamp`.

**`lib/types.ts`**
TypeScript type definitions. These act like contracts that define exactly what shape
a `Podcast`, `Episode`, `TranscriptionJob`, or `Transcript` object must have. If any
code tries to access a field that doesn't exist, TypeScript shows an error before the
code even runs.

### Configuration Files

**`babel.config.js`**
Tells the JavaScript bundler how to transform the code. The `nativewind/babel` preset
allows Tailwind class strings (`className="text-white"`) to be compiled into React
Native style objects at build time.

**`metro.config.js`**
Metro is the JavaScript bundler for React Native (like webpack for the web). This config
adds NativeWind support and links the `global.css` file as the source of truth for
Tailwind styles.

**`tailwind.config.js`**
Tailwind CSS configuration: which directories to scan for class names, custom colors
(primary indigo, secondary purple, accent amber), and the `nativewind/preset` which
adapts Tailwind's web defaults to work on mobile (e.g. removing web-only properties).

**`global.css`**
Three lines that activate Tailwind CSS: `@tailwind base`, `@tailwind components`,
`@tailwind utilities`. This file is the entry point for all styling.

**`nativewind-env.d.ts`**
Tells TypeScript that the `className` prop is valid on React Native components (by
default, React Native components don't have `className`). Without this, TypeScript
would show errors on every styled component.

---

## 10. The Database Schema Explained

### Foreign Keys and Relationships

The tables are connected via "foreign keys" — a column that points to a row in another
table. Think of it like the index at the back of a book: instead of copying all the
podcast details into every episode row, each episode just stores a `podcast_id` that
says "look up podcast #XYZ for the full details."

```
podcasts (1)
    └── episodes (many — one podcast has many episodes)
             └── transcription_jobs (many — one episode can be transcribed by many users)
             │         └── transcripts (one — one completed job produces one transcript)
             └── transcripts (direct link too, for faster lookups)
```

### UUIDs

Every row's ID is a UUID (Universally Unique Identifier) — a 128-bit random number like
`3f6c4a8b-2e91-47d3-b5f0-1a9c8e2f5d74`. UUIDs are used instead of simple numbers
(1, 2, 3...) because:
- They can be generated anywhere (phone, server) without coordination
- They don't expose how many records exist (a user can't guess another user's ID)
- They're globally unique across all tables and all systems

### JSONB Columns

`segments` and `chapters` are stored as `JSONB` (binary JSON). This allows storing
complex nested data structures directly in the database without splitting them into
many tables. For example, `segments` might contain:
```json
[
  { "text": "大家好", "start": 8.02, "end": 8.68, "speaker": "SPEAKER_00",
    "words": [
      { "word": "大", "start": 8.02, "end": 8.24, "score": 0.97 },
      ...
    ]
  }
]
```

---

## 11. The Complete Data Flow — Step by Step

Here is the complete lifecycle of a transcription request, tracing every step from
the user tapping a button to seeing the final transcript.

**Step 0: User searches and selects an episode (5-10 seconds)**
1. User types "声东击西" and taps Search
2. App → `supabase.functions.invoke('fetch-podcast', {action:'search', query})` →
   Edge Function → Podcast Index API → returns 10 podcast results
3. User taps on "声东击西"
4. App → `supabase.functions.invoke('fetch-podcast', {action:'episodes', feedUrl})` →
   Edge Function downloads RSS XML, parses episodes, upserts to DB → returns episodes
5. User sees 50 recent episodes

**Step 1: User taps "Transcribe" (< 1 second)**
1. App first checks DB: `SELECT * FROM transcripts WHERE episode_id = ? AND user_id = ?`
2. If no transcript exists, calls `supabase.functions.invoke('start-transcription')`
3. Edge Function verifies auth, checks rate limit, creates job row in DB
4. Edge Function sends POST to Modal webhook (fire-and-forget, doesn't await)
5. Edge Function returns job object immediately
6. App navigates to `/transcript/{job.id}?isJob=true` and shows progress screen

**Step 2: Modal receives the webhook and queues the GPU job (< 1 second)**
1. Modal webhook receives `{ job_id, episode_id, audio_url, user_id }`
2. Calls `await transcribe.spawn.aio(...)` — this reserves a GPU slot and returns
   immediately without waiting for the transcription to finish
3. Returns `{"status": "queued", "job_id": "..."}` to Supabase Edge Function

**Step 3: GPU container starts and transcribes (2-5 minutes)**
1. Modal cold-starts an A10G GPU container (30-60 seconds if not warm)
2. Container runs `run_transcription()` from `transcribe.py`
3. Updates job status to `processing` and progress to 5%
4. Downloads audio with `wget` to `/tmp/audio.mp3`
5. Loads WhisperX large-v3 (pre-cached in image, loads fast)
6. Transcribes → updates to 40%
7. Aligns words to timestamps → updates to 70%
8. (Optionally) diarizes speakers → updates to 90%
9. Inserts row into `transcripts` with all segment data
10. Updates job to `completed`, progress 100%

**Step 4: App detects completion (within 3-5 seconds)**
1. App polls `GET transcription_jobs WHERE id = ?` every 3 seconds
2. When status changes to `completed`, the job query stops polling
3. The transcript query fires: `GET transcripts WHERE id = {job.id}`
4. Transcript data loads and the progress screen becomes the transcript viewer

**Step 5: Summary generated (30-60 seconds after completion)**
1. Modal calls `generate-summary` Edge Function with `transcript_id`
2. Edge Function reads all segments, joins text, truncates to 48k chars
3. Calls Groq API with Llama 3.1 70B prompt
4. Parses JSON response
5. Updates `transcripts` row with `summary`, `chapters`, `key_topics`
6. Next time the app reads the transcript (or refreshes), summary appears

---

## 12. Security Model

### Secrets Management

The app contains no secrets. All API keys are stored in:
- **Supabase Edge Functions**: Injected as environment variables via the Supabase
  secrets system (`supabase secrets set KEY=value`)
- **Modal containers**: Injected via `modal.Secret.from_name("podscribe-secrets")`
- **The `.env` file**: Only on the developer's local machine, never committed to git

The only values in the app itself are the **public** Supabase URL and anon key. The
anon key is designed to be public — it only allows actions that are explicitly permitted
by RLS policies (which is: read public podcast data, and read/write your own data).

### Who Can Access What

| Actor | Can read | Can write |
|-------|---------|-----------|
| Anonymous user (not logged in) | Podcasts, Episodes | Nothing |
| Logged-in user | Their own jobs & transcripts | Their own jobs; Podcasts, Episodes |
| Service role (Modal, Edge Functions) | Everything | Everything |

### Authentication Flow

Login uses JWT (JSON Web Tokens). When you log in, Supabase returns a signed token that
proves your identity. This token is stored in the phone's secure storage (AsyncStorage)
and included in every request. The token expires after 1 hour, but automatically
refreshes if the app is open. Even if someone intercepted the token, it would expire
quickly and they'd only see their own data due to RLS.

---

## 13. Cost and Scaling Notes

### Current Costs (at typical usage)

| Service | Cost |
|---------|------|
| Supabase | Free tier (up to 500MB database, 2GB storage, 5M Edge Function calls/month) |
| Modal.com | ~$0.19/hour on A10G GPU, billed per-second. A 1-hour podcast = ~$0.05-0.10 |
| Groq API | Free tier: 14,400 requests/day, 500K tokens/day |
| Podcast Index | Free (requires attribution) |

### Bottlenecks

- **WhisperX large-v3** is the main cost driver. A 1-hour episode takes about 5-10
  minutes of GPU time at ~$0.19/hr = approximately $0.016-0.032 per hour of audio.
- **Modal cold starts** add 30-60 seconds the first time a GPU container is used. After
  that, containers stay warm for a while (reused for subsequent requests).
- **Supabase Edge Function limits**: The `start-transcription` function uses a
  fire-and-forget `fetch()` call. Supabase Edge Functions have a 150ms execution budget
  in some contexts — the fire-and-forget pattern ensures the function returns before the
  long Modal call completes.

### Rate Limits

The app enforces a 20 transcriptions/day per user limit to control costs. This is
checked in the `start-transcription` Edge Function by counting jobs created today.

---

## Appendix: Glossary

| Term | Plain-language definition |
|------|--------------------------|
| API | "Application Programming Interface" — a way for two programs to talk to each other. Like a waiter who takes your order (request) to the kitchen (server) and brings back food (response). |
| REST API | A specific style of API that uses standard web URLs and HTTP methods (GET, POST, etc.) |
| JSON | "JavaScript Object Notation" — a text format for data. Looks like `{"key": "value"}`. Universally understood by computers. |
| UUID | A very long random ID that's practically guaranteed to be unique globally |
| JSONB | JSON stored in a database in a binary format for fast searching |
| JWT | "JSON Web Token" — a signed digital pass that proves who you are |
| RLS | "Row Level Security" — database rules that hide certain rows from certain users |
| GPU | A chip specialized for parallel math operations; essential for running AI models fast |
| HMAC-SHA1 | A cryptographic technique for proving a request is authentic without sending the secret password directly |
| RSS | "Really Simple Syndication" — a standard XML format that podcasts use to publish episode lists |
| Edge Function | A small program that runs on a server close to the user, returning results fast |
| Deno | A JavaScript/TypeScript runtime (like Node.js but more secure) used for Supabase Edge Functions |
| CUDA | NVIDIA's programming platform for running code on GPU chips |
| PyTorch | The most popular deep learning framework, used by WhisperX |
| Webhook | A URL that receives a notification (HTTP POST) when something happens — like a doorbell for code |
| Cold start | The delay when a serverless function or container starts up from scratch for the first time |
| Fire-and-forget | Sending a request without waiting for the response — used for triggering Modal so the Edge Function can return quickly |
| Upsert | "Insert or Update" — add a new row if it doesn't exist, update it if it does |
| Migration | A SQL script that makes changes to the database schema (creating tables, adding columns, etc.) |
