# PodScribe — Technical Interview Preparation Guide

This document prepares you for a Silicon Valley startup technical interview where you are
asked about PodScribe. It is written for **you** — a CS student who built this project and
knows the code. Every section below is structured around real questions interviewers ask,
with talking-point answers you should internalize and deliver in your own words.

> **How to use this guide:** Read each Q&A pair. Don't memorize — understand. Your goal is
> to be able to give a 60-90 second answer to any question, then go deeper if asked.

---

## Table of Contents

1. [The Elevator Pitch](#1-the-elevator-pitch)
2. [System Design Questions](#2-system-design-questions)
3. [Tech Stack Choice Questions](#3-tech-stack-choice-questions)
4. [Architecture & Design Decision Questions](#4-architecture--design-decision-questions)
5. [Database Questions](#5-database-questions)
6. [API & Integration Questions](#6-api--integration-questions)
7. [Security Questions](#7-security-questions)
8. [Debugging & Problem-Solving Stories](#8-debugging--problem-solving-stories)
9. [Scalability & Performance Questions](#9-scalability--performance-questions)
10. [Behavioral Questions Tied to This Project](#10-behavioral-questions-tied-to-this-project)
11. [Questions to Ask the Interviewer](#11-questions-to-ask-the-interviewer)

---

## 1. The Elevator Pitch

**"Tell me about this project."**

> "PodScribe is a mobile app I built that transcribes any podcast episode using AI. You
> search for a podcast, pick an episode, tap Transcribe — and within 2-5 minutes you get
> a full text transcript with word-level timestamps, an AI-generated summary, chapter
> markers, and key topics. It works especially well for non-English content like Mandarin
> Chinese podcasts, which most existing tools handle poorly.
>
> The stack is Expo/React Native for the mobile app, Supabase for the backend and auth,
> Modal.com for serverless GPU compute, WhisperX for the transcription model, and Groq's
> Llama 3.1 70B for summarization. The whole pipeline is fully async — the user taps a
> button, gets immediate feedback, and the heavy GPU work happens in the background."

**What makes this answer good:**
- Leads with the user problem, not the tech
- Names the tech stack in one breath
- Mentions a specific niche (Mandarin) which shows you thought about a real use case
- Ends with a design highlight (async pipeline) that shows engineering maturity

---

## 2. System Design Questions

### "Walk me through the architecture."

Draw or describe this flow:

```
Phone App → Supabase Edge Function → Modal Webhook → GPU Container → Supabase DB
                                                                  → generate-summary Edge Function → Groq API
```

**Talking points:**
- There are four independent services: mobile app, Supabase (backend), Modal (GPU), Groq (LLM)
- The services communicate via HTTP — the app never talks to Modal or Groq directly
- All secrets stay server-side; the mobile app only holds a public anon key
- The transcription is asynchronous: the user gets immediate feedback, the GPU work is backgrounded
- The app polls every 3 seconds to check job status — simple, no WebSocket complexity needed for this scale

---

### "How does the transcription pipeline work end to end?"

Walk through each stage:

1. **User taps Transcribe** → app calls `start-transcription` Supabase Edge Function
2. **Edge Function** validates auth, checks rate limit, creates a `transcription_jobs` row (status: `queued`), fires POST to Modal webhook and returns the job row immediately without waiting
3. **Modal webhook** receives the payload, calls `transcribe.spawn.aio()` — this tells Modal "start a GPU job" but returns immediately, so the webhook responds in <1 second
4. **GPU container** cold-starts (30-60s if not warm), downloads the audio with `wget`, runs WhisperX large-v3 in three stages: transcription → word alignment → diarization, writes result to Supabase `transcripts` table, marks job `completed`
5. **GPU container** (after saving transcript) fires a POST to `generate-summary` — fire-and-forget
6. **generate-summary Edge Function** sends transcript text to Groq/Llama 3.1 70B, gets back structured JSON, updates `transcripts` row with summary/chapters/key_topics
7. **App** was polling job status every 3s → detects `completed` → loads transcript → shows it

**Key insight the interviewer wants to hear:** The job and transcript are decoupled. The app polls the job table; once the job is done, it fetches the transcript. The summary is generated separately and appears whenever the app next reads the transcript — the user experience doesn't block on it.

---

### "How would you scale this to 1 million users?"

This is a common growth question. Be honest about what the current design doesn't handle, then show you can think through the solutions.

**Current bottlenecks:**
- **Modal cold starts** (30-60s) — bad UX for burst traffic
- **Polling (3s interval × N users)** — 1M users polling every 3s = 333K req/s to Supabase
- **Rate limit is per-user, enforced in app logic** — not distributed, could be bypassed
- **Groq free tier**: 500K tokens/day — exhausted quickly at scale
- **Supabase free tier DB** — would need Pro plan (~$25/mo) and eventually read replicas

**Scaling solutions:**
- Replace polling with **Supabase Realtime** (WebSocket subscriptions) — the DB pushes updates when job status changes, eliminating all polling load
- Pre-warm Modal containers by keeping them alive (Modal supports `min_containers=1`)
- Add a proper **queue** (Redis/SQS) between Supabase and Modal to handle burst traffic, prevent lost jobs
- Move rate limiting to the **database** (PostgreSQL row-level, using a daily counter table) for correctness under concurrency
- Add **CDN caching** for RSS feeds — most episode lists don't change minute-to-minute
- Shard transcripts by user_id for DB read performance

---

### "Why polling instead of WebSockets/Server-Sent Events?"

**Answer:**
> "For this scale and use case, polling is the right trade-off. The transcription takes 2-5
> minutes, so a 3-second poll interval adds at most 3 seconds of lag — completely
> imperceptible to the user. WebSockets add connection management complexity and require
> sticky sessions or a pub/sub broker. At thousands of concurrent users I'd switch to
> Supabase Realtime which gives me WebSocket subscriptions without me managing the
> infrastructure. I made the simpler choice first and designed it so it's easy to replace."

The key is you can articulate **when you'd change it** — you didn't just pick polling by default.

---

### "What happens if Modal's webhook goes down or the job fails?"

**Current state:**
- The `start-transcription` Edge Function uses fire-and-forget (`.catch()` swallows the error)
- If Modal is down, the job stays `queued` forever
- There's an `error_message` column in `transcription_jobs` for failures, but no automatic retry

**What you'd add to productionize:**
- A **dead letter queue** — jobs stuck in `queued` for >10 minutes get retried or marked failed
- **Idempotency** on the Modal webhook — if the same `job_id` is sent twice (on retry), it should not create duplicate transcripts (check if `transcripts WHERE job_id = ?` already exists)
- **Webhook signature verification** — validate that the POST to Modal is actually from Supabase and not a spoofed request

---

## 3. Tech Stack Choice Questions

### "Why Expo/React Native instead of native iOS/Android development?"

**Answer:**
> "I chose React Native because the value proposition of this app is identical on iOS and
> Android — same UI, same data, same logic. Writing it twice in Swift and Kotlin would double
> the implementation time with no product benefit. Expo on top of React Native eliminates
> build configuration overhead — I get file-based routing, OTA updates, and a native audio
> player out of the box.
>
> The trade-off is you hit a ceiling with very platform-specific features like custom camera
> processing or deep OS integrations. But for a data-fetching, audio-playback app, React
> Native is the right call."

**Follow-up: "What are the downsides of React Native?"**
- JavaScript bridge overhead vs truly native (though JSI largely addresses this in modern RN)
- Debugging is harder — two runtimes (JS + native) to reason about
- Some third-party libraries have inconsistent quality across iOS/Android
- App size is larger than native

---

### "Why Supabase instead of Firebase?"

**Answer:**
> "Two reasons: SQL and open source. Firebase uses a NoSQL document model, which would make
> complex queries like 'get all transcription jobs for this user where status = processing,
> ordered by created_at' awkward. With PostgreSQL I write plain SQL and it's expressive
> and efficient.
>
> The second reason is Row Level Security. PostgreSQL RLS lets me enforce data isolation as
> a database-level guarantee — not application logic I could accidentally bypass. Firebase's
> security rules are similar in concept but more limited. Supabase is also open source, so
> I could self-host if costs become a concern."

**Follow-up: "When would you choose Firebase over Supabase?"**
- Offline-first apps with complex sync (Firestore has better offline support)
- Apps needing Firebase's push notification ecosystem deeply integrated
- Teams already deep in the Google Cloud ecosystem

---

### "Why Modal.com instead of AWS Lambda or a dedicated GPU server?"

**Answer:**
> "WhisperX large-v3 requires a GPU with at least 10GB VRAM. AWS Lambda doesn't offer GPUs.
> A dedicated GPU server (e.g. AWS p3.xlarge with a V100) costs $3/hour and I'd be paying
> even when idle, which for a personal project is prohibitive.
>
> Modal is purpose-built for ML workloads: it handles container builds, GPU provisioning,
> and billing per-second. A 1-hour podcast episode takes about 5-10 minutes of GPU time,
> which costs ~$0.02-0.03 at $0.19/hr. For a low-volume personal project, that's nearly
> free.
>
> The trade-off is cold starts. When no container is warm, the first request has 30-60
> seconds of latency before transcription even begins. For a production service I'd keep
> containers pre-warmed."

**Follow-up: "What about AWS SageMaker or Replicate?"**
- SageMaker: More control but much more configuration overhead; better for production ML deployments at scale
- Replicate: Similar to Modal but more opinionated about model serving; WhisperX isn't a pre-packaged model there
- Modal wins here because I'm deploying my own custom Python code, not just a model endpoint

---

### "Why WhisperX over the OpenAI Whisper API?"

**Answer:**
> "Three reasons: cost, control, and word-level timestamps.
>
> OpenAI's Whisper API charges ~$0.006/minute. A 1-hour episode = $0.36 per transcription.
> WhisperX running on my own GPU costs ~$0.02-0.03 per episode — roughly 10-15x cheaper at
> scale.
>
> Word-level timestamps are the key feature. OpenAI's API only returns segment-level
> timestamps. WhisperX's alignment stage attaches timestamps to individual words — that's
> what enables the 'transcript highlights the word you're currently hearing' feature, which
> is the premium UX differentiator.
>
> Finally, I run the model myself, so I can tune batch size, model size, and have no
> dependency on OpenAI's API availability or pricing changes."

---

### "Why Groq for summarization instead of OpenAI GPT-4 or running a local model?"

**Answer:**
> "Groq's LPU hardware runs Llama 3.1 70B at 500+ tokens/second — roughly 10-15x faster
> than a GPU running the same model. For summarizing a full transcript and getting a response
> in under 10 seconds, that speed matters for UX.
>
> Llama 3.1 70B is open-source and multilingual, which matters for Chinese podcast content.
> GPT-4 would work fine too but is significantly more expensive and closed-source.
>
> Running a local model on the GPU during transcription would save a round trip but would
> require keeping the model in GPU memory simultaneously with WhisperX, which would exceed
> the A10G's 24GB VRAM. Decoupling summary generation into a separate Edge Function is
> cleaner."

---

### "Why TanStack Query AND Zustand? Isn't that redundant?"

**Answer:**
> "They serve different purposes. TanStack Query manages server state — data that lives in
> the backend and needs to be fetched, cached, synchronized, and eventually invalidated. It
> handles loading states, error states, polling, and cache invalidation automatically.
>
> Zustand manages client state — data that only exists in the UI, like the currently playing
> episode, playback position, and whether audio is playing. This data never gets saved to
> the server; it's ephemeral UI state shared between components.
>
> The rule of thumb: if data comes from an API call or needs to be persisted, it's in
> TanStack Query. If it's pure UI state that needs to be shared between components, it's
> in Zustand."

---

### "Why Deno for Edge Functions instead of Node.js?"

This is about Supabase's choice, but you should be able to explain it:

> "Supabase chose Deno for Edge Functions because Deno has a stricter security model —
> scripts can't access the filesystem or network without explicit permission. It also has
> first-class TypeScript support without a build step, and built-in Web APIs (fetch, crypto)
> without polyfills. The Web Crypto API specifically is why HMAC-SHA1 for Podcast Index
> authentication was straightforward — I used the native `crypto.subtle` API."

---

## 4. Architecture & Design Decision Questions

### "Why is the Podcast Index API call made server-side in an Edge Function instead of directly from the app?"

**Answer:**
> "API key security. Podcast Index requires HMAC-SHA1 authentication using an API key and
> secret. If those credentials were in the mobile app bundle, any user could extract the
> binary and find the keys — common with tools like jadx or Hopper Disassembler. Moving the
> call server-side keeps the secrets out of the client entirely.
>
> As a bonus, it also lets me cache results and add rate limiting centrally."

---

### "Why store podcast episodes in your own database instead of always fetching from the RSS feed?"

**Answer:**
> "Two reasons: performance and cross-user deduplication. RSS XML parsing is slow — the feed
> for a popular podcast can be megabytes of XML. By upserting episodes into Supabase after
> the first fetch, subsequent users who browse the same podcast get results from a fast
> PostgreSQL query instead of downloading and parsing XML again.
>
> It also means I have a stable `episode_id` UUID I can use as a foreign key in
> `transcription_jobs` and `transcripts` — which wouldn't be possible if I were just passing
> around ephemeral RSS data."

---

### "Why fire-and-forget when calling the Modal webhook from the Edge Function?"

**Answer:**
> "Supabase Edge Functions have an execution time limit. If I awaited the Modal webhook
> response and Modal was slow to respond (cold start + job queuing), the Edge Function
> would timeout before it could return the job ID to the app.
>
> Fire-and-forget means: I send the POST to Modal, immediately return the job row to the
> app, and the app starts polling. The job ID is already in the database, so polling will
> find it. The trade-off is I can't detect if the Modal webhook itself failed — for
> production I'd add a background job to detect and retry stuck `queued` jobs."

---

### "Why do you have both a `transcription_jobs` table and a `transcripts` table?"

**Answer:**
> "They capture different states in the lifecycle. A job represents in-progress work —
> something that might fail, has a progress percentage, and belongs to a specific user who
> initiated it. A transcript represents the completed artifact — the actual output, which
> could theoretically be shared or re-used.
>
> This separation also means the app can show a progress screen while the job is running,
> without needing to create an empty transcript row prematurely. It's the difference
> between tracking a task and storing its result."

---

### "Why pre-download the WhisperX model into the Docker image at build time?"

**Answer:**
> "Cold start performance. If I downloaded the model at runtime, every new GPU container
> would spend 3-5 minutes downloading 3GB of model weights before transcription could even
> start. By baking the model download into the Docker image with a `run_commands` build
> step, the model is pre-cached in the image layer. Container cold start goes from 5+ minutes
> down to 30-60 seconds.
>
> The trade-off is image size — the container image is ~10GB. Modal handles this fine since
> the image is only built once and cached in their registry."

---

### "Why UUIDs instead of auto-increment integer IDs?"

**Answer:**
> "Three reasons. First, UUIDs can be generated anywhere — the app can generate a UUID for a
> new resource before the DB insert, which enables optimistic UI. Second, they don't leak
> information: sequential integer IDs tell attackers how many records exist ('there are
> 10,000 users because the last user ID is 10000'). Third, they're globally unique across
> tables and systems — useful if you ever merge databases or shard data.
>
> The downside is index size and sort performance — UUID indexes are larger than integer
> indexes and UUIDs don't sort chronologically. For a startup-scale app, this doesn't
> matter."

---

## 5. Database Questions

### "Explain your database schema."

Walk through the four tables and their relationships:

```
podcasts (1) ──< episodes (many)
                    │
                    ├──< transcription_jobs (one per user per episode)
                    │           │
                    │           └──> transcripts (one per completed job)
                    │
                    └──> transcripts (direct FK for faster lookups)
```

**Key points:**
- Podcasts and episodes are a shared public catalog (no `user_id`) — multiple users can transcribe the same episode
- Jobs and transcripts are user-scoped (have `user_id`) — RLS ensures users only see their own
- `transcripts` has both `job_id` and `episode_id` FKs — `episode_id` for quick "does a transcript exist for this episode?" lookups; `job_id` for tracing a transcript back to the job that created it

---

### "Why JSONB for the `segments` column instead of a separate `words` table?"

**Answer:**
> "Each segment has a nested `words` array with start/end times and confidence scores. The
> data is only ever read or written atomically — I never need to query 'give me all words
> spoken between 30s and 60s across all transcripts.' So the overhead of normalizing this
> into relational tables (a `segments` table and a `words` table with foreign keys) would
> add schema complexity with no query benefit.
>
> JSONB is fast to read, supports GIN indexing for JSON field queries if needed, and stores
> the full nested structure natively. The trade-off is you can't efficiently query inside
> the JSON without a GIN index. For this use case, JSONB is the right call."

---

### "Explain Row Level Security and how you used it."

**Answer:**
> "RLS is a PostgreSQL feature that attaches security policies to tables. Every query —
> regardless of who runs it — is filtered by these policies before returning results. It
> enforces data isolation at the database level, not the application level.
>
> In PodScribe:
> - `podcasts` and `episodes`: `USING (true)` — anyone can read them
> - `transcription_jobs`: `USING (auth.uid() = user_id)` — you only see your own jobs
> - `transcripts`: same — you only see your own transcripts
> - Service role operations (Modal writing transcripts, Edge Functions updating jobs) bypass
>   RLS because they use the `service_role` key, which is a PostgreSQL superuser
>
> The practical impact: even if a bug in my app code accidentally sent a query without a
> user filter, the database would still only return that user's data."

---

### "What's the difference between the `anon` key and the `service_role` key?"

**Answer:**
> "The `anon` key is the public client key — it's safe to ship in the mobile app. It respects
> all RLS policies, so users can only access what the policies allow. It can't bypass RLS.
>
> The `service_role` key is a superuser key — it bypasses all RLS policies and can read and
> write everything. It's only used server-side: in Modal's Python code and in Edge Functions
> that need to write records for any user. It must never be in the mobile app, because anyone
> with this key has unrestricted access to all data."

---

## 6. API & Integration Questions

### "How does Podcast Index authentication work?"

**Answer:**
> "Podcast Index uses HMAC-SHA1 request signing — the same pattern as AWS Signature v2 or
> older Stripe API versions. For each request, you compute:
>
> `signature = HMAC-SHA1(apiKey + apiSecret + currentUnixTimestamp)`
>
> Then send the API key, timestamp, and signature in the `X-Auth-Key`, `X-Auth-Date`, and
> `Authorization` headers. The server re-computes the expected signature and rejects the
> request if it doesn't match or if the timestamp is too old (replay attack prevention).
>
> I implemented this in the Deno Edge Function using the Web Crypto API's `subtle.sign()`
> with the 'HMAC' algorithm."

---

### "How does your RSS parsing work? Why not use a library?"

**Answer:**
> "I parse RSS XML with regex in the Edge Function rather than a library, because the Deno
> runtime environment limits what npm packages are available, and the XML structure of
> podcast RSS feeds is predictable enough that targeted regex works reliably.
>
> I extract `<item>` blocks and within each, pull out the `<enclosure url="...">` for the
> audio file, `<title>`, `<description>`, `<itunes:duration>`, and `<pubDate>`. It handles
> the 99% case well. For robust production use, a proper XML parser would be better — but
> for this project, it's 30 lines instead of a library dependency."

---

### "How does the Groq/Llama integration work? How do you make sure the model returns valid JSON?"

**Answer:**
> "I use a structured system prompt that instructs the model: 'Return only valid JSON. No
> markdown, no explanation.' The prompt specifies the exact JSON schema with field names and
> types. This is called zero-shot structured output prompting.
>
> LLMs don't always comply perfectly, so I have a fallback: if `JSON.parse()` fails, I use
> a regex to extract the JSON object from inside a markdown code block (```json ... ```)
> which models sometimes emit despite being told not to.
>
> For production use I'd either use Groq's JSON mode parameter (`response_format:
> {type: 'json_object'}`) which forces valid JSON output at the model level, or use a tool-
> calling API which structures outputs natively."

---

## 7. Security Questions

### "What are the security risks in your app and how did you mitigate them?"

Walk through each attack surface:

**1. API key exposure in the mobile app**
- Risk: Keys extracted from the app binary
- Mitigation: Only public `anon` key is in the app. All secret keys (Podcast Index, Groq, service role) are server-side only

**2. Unauthorized access to other users' data**
- Risk: A user crafting requests to read another user's transcripts
- Mitigation: Row Level Security at the database layer — not just application-level filters

**3. Rate limit bypass**
- Risk: A user calling `start-transcription` in a tight loop to rack up GPU costs
- Mitigation: Server-side rate limit (20/day) enforced in the Edge Function, which users can't bypass (vs. a client-side limit they could). For production: move to a server-side counter with a Redis or DB atomic increment

**4. Unauthenticated access to Edge Functions**
- Risk: Someone calling `start-transcription` without a valid user session
- Mitigation: Edge Function verifies the JWT from the `Authorization` header using `supabase.auth.getUser()` — returns 401 if missing or invalid

**5. Injection attacks (SQL, prompt injection)**
- SQL: Supabase JS client uses parameterized queries — no raw string interpolation into SQL
- Prompt injection: Transcript text is placed in the user role of the prompt, not the system role. A malicious podcast couldn't override my summarization instructions

---

### "The `start-transcription` Edge Function sends a request to Modal. How do you know it's not spoofed?"

**Honest answer:**
> "Currently, the Modal webhook endpoint is a public URL with no secret verification.
> Anyone who discovers the URL could send arbitrary payloads to it. In production I would:
> 1. Add a shared secret header (e.g. `X-Internal-Secret`) that the Edge Function sends
>    and the Modal webhook validates
> 2. Or restrict the Modal webhook to only accept requests from Supabase's IP ranges"

This is a good answer because it shows you know the limitation and can articulate the fix.

---

## 8. Debugging & Problem-Solving Stories

These are your strongest interview moments. Each story should follow the **STAR format** (Situation, Task, Action, Result).

---

### Bug 1: "Tell me about a bug that was hard to find."

**The field name mismatch (`feedUrl` vs `url`)**

> "After deploying the podcast search feature, users could search and see podcast results,
> but clicking any podcast showed zero episodes. The UI showed an empty list with no error.
>
> I checked the Edge Function logs and the API was returning data fine. Then I went to the
> TypeScript type definition I had written for the Podcast Index API response — I had defined
> a field called `feedUrl`. But when I console-logged the actual API response, the field
> was named `url`.
>
> So the app was accessing `podcast.feedUrl` which was `undefined`, passing `undefined` as
> the RSS feed URL to the episodes fetcher, which returned nothing. No crash, no error —
> just silently broken behavior.
>
> The fix was a one-line change: rename `feedUrl` to `url` in the type definition. But it
> took me 30 minutes of log tracing to find because the failure happened silently three
> function calls downstream from the bad data.
>
> The lesson: TypeScript helps but it can't catch runtime shape mismatches from external APIs.
> I should validate API response shapes explicitly, ideally with a schema validation library
> like Zod."

---

### Bug 2: "Tell me about a time you debugged a distributed system issue."

**The missing `user_id` in the Modal webhook payload**

> "After getting search and episodes working, I tested transcription. Jobs were created in
> the database with status `queued` and stayed there forever — never changing to `processing`.
> There were no errors in the Edge Function logs.
>
> The challenge: the failure was happening asynchronously. `start-transcription` uses fire-
> and-forget to call the Modal webhook — it sends the request, ignores the response, and
> returns the job immediately. So the Edge Function logs showed success, but Modal was
> actually receiving the request, rejecting it, and I never saw the rejection.
>
> I added temporary logging to Modal's webhook to print the incoming request body. The
> payload was missing `user_id` — the Modal webhook validated that all four required fields
> were present (job_id, episode_id, audio_url, user_id) and returned a 400 error.
>
> Once I added `user_id: user.id` to the webhook payload in the Edge Function, the pipeline
> worked end to end.
>
> The lesson: fire-and-forget is convenient but it makes debugging much harder. In production
> I'd log the Modal response to a database table even if I don't await it in the critical path."

---

### Bug 3: "Tell me about a dependency or environment issue you hit."

**The `transcribe.py` module not found in the Modal container**

> "After fixing the payload issue, transcription jobs started being picked up by Modal but
> immediately failed with `ModuleNotFoundError: No module named 'transcribe'`. My
> `transcribe.py` was in the project directory locally, but Modal runs code inside a Docker-
> like container that only has what you explicitly install.
>
> I'd installed all the pip packages, but hadn't included my own Python file in the container
> image. The fix was adding `.add_local_file('transcribe.py', '/root/transcribe.py', copy=True)`
> to the image build chain.
>
> The `copy=True` parameter was a second subtlety — Modal's image build works in layers, and
> if you add a local file without `copy=True`, you can't run build commands after it (the
> model pre-caching `run_commands` came after). `copy=True` bakes the file into the image
> layer properly.
>
> This reinforced my understanding of containerization: the container only knows what you
> explicitly give it. 'Works on my machine' is a classic container trap."

---

### Bug 4: "Tell me about a Python/async bug you encountered."

**The tuple return and async/sync mixing in FastAPI**

> "The Modal webhook function returned `({"error": "Missing fields"}, 400)` — a Python
> tuple — thinking FastAPI would automatically unpack it into a response with status code
> 400. It caused a `ResponseValidationError` because FastAPI expected a dict return, not a
> tuple.
>
> In the same function, I was using `transcribe.spawn()` (the synchronous version) inside
> an `async def` webhook handler. Modal's runtime detects this and raises
> `AsyncUsageWarning` — it's the modal equivalent of calling a blocking function inside
> an async context.
>
> Two fixes: return `JSONResponse({...}, status_code=400)` explicitly, and use
> `await transcribe.spawn.aio()` for the async version.
>
> Takeaway: frameworks have strict contracts. When you get a `ResponseValidationError` or
> runtime warning, read it carefully — it's usually telling you exactly what contract you
> violated."

---

## 9. Scalability & Performance Questions

### "What's the bottleneck in your system today?"

> "GPU cold start latency. When no Modal container is warm (no recent transcription
> activity), a new transcription request has to wait 30-60 seconds for the container to
> start before WhisperX even begins loading. WhisperX loading is another 10-20 seconds.
> So the first transcription after a period of inactivity has a 1-2 minute delay before
> any progress shows.
>
> The fix is Modal's `keep_warm` option, which keeps a minimum number of containers alive.
> For a production service I'd keep 1-2 warm containers during peak hours, which costs
> roughly $0.19/hr even when idle."

---

### "How much does it cost to run this?"

Know the numbers:

| Component | Cost |
|-----------|------|
| Supabase | Free tier (up to 500MB DB, 5M Edge Function calls/month) |
| Modal A10G GPU | ~$0.19/hr, billed per second. A 1-hr podcast episode ≈ 5-10 min of GPU time ≈ $0.016-0.032 per transcription |
| Groq API | Free tier: 14,400 requests/day, 500K tokens/day |
| Podcast Index | Free |

**Total for 100 transcriptions/month ≈ $1.60-$3.20 in GPU costs. Practically free for personal use.**

---

### "How would you optimize for lower latency?"

- **Pre-warm GPU containers**: Keep 1 container warm → cold start eliminated for burst traffic
- **Smaller WhisperX model**: Use `medium` instead of `large-v3` — 3x faster, slightly less accurate
- **Audio pre-processing**: Downsample audio to 16kHz mono before sending to WhisperX (saves ~30% transcription time)
- **Parallel alignment and diarization**: WhisperX stages are sequential today; alignment and diarization could potentially be parallelized on multi-GPU setups
- **CDN for audio**: Download from a Cloudflare CDN-cached copy of the audio instead of origin server

---

### "How would you handle a 10x spike in transcription requests?"

> "Today's architecture would have two failure modes:
>
> 1. `start-transcription` Edge Function would get hammered — but since it's serverless,
>    Supabase scales Edge Functions horizontally automatically.
>
> 2. Modal would queue up GPU containers — Modal auto-scales GPU containers, but there's
>    a limit on how fast they can provision. During a spike, new containers take ~30-60s
>    to start. If 100 jobs arrive simultaneously, they'd all be queued but start staggered.
>
> The correct solution is to add an explicit **job queue** (SQS, RabbitMQ, or Redis pub/sub)
> between `start-transcription` and Modal. Jobs enter the queue; a worker pool of Modal
> containers pulls from the queue at a controlled rate. This prevents thundering herd and
> gives you back-pressure visibility."

---

## 10. Behavioral Questions Tied to This Project

### "What was the hardest part of building this?"

> "The hardest part was debugging the distributed async pipeline — specifically tracing why
> transcription jobs were being created but never processed. The failure was happening in a
> fire-and-forget call chain: my Edge Function called Modal, Modal rejected the request, but
> that rejection was swallowed by `.catch()` and I never saw it. I had to instrument each
> hop manually to find where the failure occurred. It taught me that async fire-and-forget
> patterns, while simple to implement, are difficult to debug in production without explicit
> observability at each step."

---

### "What would you do differently if you started over?"

> "I'd add observability from day one. Right now, if a transcription fails midway through
> the GPU job, the only record is an `error_message` string in the database. I'd want:
>
> 1. Structured logging from every service to a centralized log store (e.g. Datadog, Grafana)
> 2. Job retry logic with exponential backoff instead of letting failed jobs die silently
> 3. Integration tests that mock each service boundary, so I could catch the `feedUrl` vs
>    `url` type mismatch automatically
>
> I also underestimated how much time container environment issues would take. I'd spend
> more time upfront reading Modal's documentation on image layering before writing code."

---

### "This project uses several paid/external services. How would you de-risk vendor lock-in?"

> "The architecture is actually fairly vendor-agnostic by design:
>
> - Modal can be replaced by any serverless GPU provider (Replicate, RunPod, AWS SageMaker)
>   because the transcription logic is standard Python. The only Modal-specific code is the
>   `@app.function` decorator and `spawn.aio()`
> - Supabase can be self-hosted on a VPS since it's open source (PostgREST + GoTrue +
>   PostgreSQL)
> - Groq can be replaced by any OpenAI-compatible API endpoint — I'd just change the base URL
>   and model name in `generate-summary`
> - The only part with high lock-in is the mobile app's use of Expo-specific APIs (Expo AV,
>   Expo Router), but even those could be replaced with React Native core equivalents"

---

### "How would you monetize this?"

This shows product thinking — interviewers at startups love this question.

> "A few natural models:
>
> 1. **Freemium**: Free tier with 3 transcriptions/month, paid plans ($5-10/mo) for more.
>    The cost per transcription is ~$0.02-0.03, so margins are healthy above ~$3/user/month.
>
> 2. **B2B**: Podcast production companies could use this for show notes, transcripts, and
>    accessibility captions. Enterprise contracts with custom integrations.
>
> 3. **API**: Expose a transcription API for podcast apps to integrate directly, charged per
>    minute of audio.
>
> The most defensible angle is multilingual support — WhisperX handles Mandarin, Spanish,
> Arabic, etc. Most existing tools (Descript, Otter.ai) focus on English."

---

## 11. Questions to Ask the Interviewer

Always ask questions — it shows genuine interest and makes the conversation two-way.

**About the tech stack:**
- "What does your backend infrastructure look like? Do you use managed services or run your own Kubernetes cluster?"
- "How do you handle ML model inference at your scale? Do you use dedicated GPU infrastructure or serverless?"

**About the engineering culture:**
- "How does the team handle incidents? What does your on-call rotation look like?"
- "What's the ratio of new feature work to maintenance and technical debt work?"

**About the role:**
- "What would the first 30 days look like for someone in this role?"
- "What's the biggest technical challenge the team is facing right now?"

**About growth:**
- "How do engineers at this company typically grow? Is there a distinction between IC (individual contributor) and management tracks?"

---

## Appendix: Quick Reference — Key Numbers to Know

| Metric | Value |
|--------|-------|
| WhisperX model size | large-v3, ~1.5B parameters |
| GPU used | NVIDIA A10G, 24GB VRAM |
| GPU cost | ~$0.19/hr |
| Cost per 1-hr podcast transcription | ~$0.02-0.03 |
| Cold start latency | 30-60 seconds |
| Transcription speed | ~3-5x real-time (1hr podcast in ~15-20min actual GPU compute) |
| Groq inference speed | 500+ tokens/second |
| Rate limit | 20 transcriptions/day per user |
| Polling interval | 3 seconds (job status), 5 seconds (library list) |
| Summary text truncation | 48,000 characters (~12K tokens) |
| Max episodes fetched per RSS feed | 50 |
| Supabase Edge Function count | 3 (fetch-podcast, start-transcription, generate-summary) |
| Database tables | 4 (podcasts, episodes, transcription_jobs, transcripts) |

---

## Appendix: Tech Stack Quick-Reference Card

| Layer | Technology | Why chosen |
|-------|-----------|------------|
| Mobile app | Expo / React Native | Cross-platform iOS+Android from one codebase |
| Navigation | Expo Router v4 | File-based routing, same mental model as Next.js |
| Styling | NativeWind v4 (Tailwind) | Rapid UI development with utility classes |
| Server state | TanStack Query v5 | Caching, polling, loading/error states built in |
| Client state | Zustand | Minimal, no boilerplate, global shared state |
| Audio | Expo AV | Native audio playback with seek and position events |
| Database | Supabase (PostgreSQL) | SQL, RLS, open source, managed hosting |
| Auth | Supabase Auth (JWT) | Email/password, JWT, persisted via AsyncStorage |
| Edge Functions | Supabase + Deno | Server-side logic, secrets management, near-user execution |
| GPU compute | Modal.com | Serverless GPU, per-second billing, ML-focused |
| Transcription | WhisperX large-v3 | Word-level timestamps, multilingual, cheaper than OpenAI API |
| Summarization | Groq + Llama 3.1 70B | Fast LPU inference, open source model, multilingual |
| Podcast search | Podcast Index API | Free, 4M+ podcasts, HMAC-SHA1 auth |
| Language | TypeScript (app), Python (Modal), TypeScript/Deno (Edge Functions) | Type safety, ecosystem fit per layer |
