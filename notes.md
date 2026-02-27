# Notes for PodScribe

## Tech Stacks & Relevant Files

### Expo

Expo is a framework built on top of React Native, allowing for iOS, Android, and web app from a single Javascript & Typescript code base.

Expo adds a build system, a library ecosystem, file-based routing, and dev tooling on top of React Native.

Expo uses file-based routing, where the directory structure is the routing shown on the apps. The parentheses around certain names indicate that they are routing groups; they don't add a path segment.

`_layout.tsx` wraps how its sibiling screens. This is used in `app/_layout.tsx` to introduce Stack for transitioning between different screens. Those screens push and pop like navigating on a browser.

### Modal.com

Modal.com is a cloud GPU platform for running Python functions on remotely available GPUs. Decorating functions with `@app.function()` allows for using the GPU resources remotely.

#### modal-worker/main.py

`main.py` firstly specifies the image (container) to be used for running transcription. It downloads all the necessary packages and save the container, so that every time a request for transcription comes, it spins up the container.

Secrets such as SUPABASE_URL or SUPABASE_SERVICE_KEY are derived using `modal.Secret.from_name`.

`transcribe` function calls `run_transcription` using the transcription image and secrets, along with an A10 GPU. It simply calls the function, recording any error that occurs during execution to the Supabse database.

`webhook` is used for receiving transcription requests from Supabase's `start_transcription` edge function. It uses the basic debian image with `fastapi` installed, which is used for opening up the endpoint. This receives a POST request, parses the JSON body into audio_url, job_id, and so on.

#### modal-worker/transcribe.py

This program is run under the transcription image built in `main.py`, under the environment provided as `secrets` (this includes SUPABASE_URL, SUPABASE_SERVICE_KEY).

This program runs `update_jobs` function to update the status of the current transcription work on the Supabase database (`transcription_jobs` table). Then, it downloads the audio for the requested episode using `download_audio`.

`transcribe_audio` function uses WhisperX, an OpenAI-trained model for transcribing and giving timestamps to podcasts. It transcribes and aligns word timestamps,

`trigger_summary` is then called to send out a POST request with the transcript_id and authorisation from SUPABASE_SERVICE_KEY.

### Supabase

This project uses Supabase as backend, since it requires a relational data management with complex queries. The data stored on the backend such as `users`, `transcript_jobs`, `transcripts` are all related to one another, since we need to distinguish which user has access to which transcripts. To extract data from them, we need to be able to form a complex and systematic queries for the exact information.

Supabase also provides RLS (Row Level Security) with anon key, so that even when the anon key is made public, the user can only access their own transcripts. This promotes per-user isolation within the system.

Supabase uses JWT token for authentication.

Furthermore, Supabase runs edge functions in a serverless manner (on-demand). This ensures that no server-side action waits for user request indefinitely. There is no memory between calls, hence the job requests are stored in the database, instead of memory.

#### `supabase/functions/generate-summary`

This is a function that runs on Supabase after it receives a POST request from Modal.com's `transcribe.py`. It receives the `transcript_id` in a json format from Modal.com.

It then uses the fetched `transcript_id` to access the transcript from Supabase's `transcripts` table, looks at all of its segments, and truncates it for the first 12k tokens (approximately 48k characters). This truncated transcript is sent as content along with a pre-designed prompt for generating a summary. The received summary is then written to DB.

#### `supabase/functions/fetch-podcast`

`fetch-podcast` handles user actions including `search` and `episodes` in their requests.

`handleSearch` computes SHA-1 HMAC for authenticating into Podcast Index, then performs a query using the API. The result of the query is then returned as a response.

`handleEpisodes` fetch and parse the RSS feed for a podcast. The parsed information is then upserted (updated if it already exists, inserted if it is new) to the database. It then returns episodes for the selected podcast from the Supabase database `episodes`.

#### `supabase/functions/start_transcription`

When a request is made to this endpoint, this edge function firstly sends out corsHeader for allowing cross origin resource sharing.

Then, the authHeader is examined from the request for the user's JWT. `userSupabase` is created based on the Supabase ANON key, and from this the user information is extracted using `userSupabase.auth.getUser()`. If this user is verified, then we move onto next checks.

The function then conducts rate limiting and duplicate job check by finding the number of requests made by the user in the given timeframe and the duplicate job existence, using `supabase` with `user_id = {user.id}`.

After passing these checks, the function loads the audio url for the requested podcast episode using `episode_id` from the user's request. Then, it creates a new entry for `transcription_job`, and call modal.com webhook using `Deno.env`. The request sent to modal.com includes job_id,episode_id, audio_url, and user_id.
