# Notes for PodScribe

## Files & Programs Explained

## supabase

This project uses Supabase as backend, since it requires a relational data management with complex queries. The data stored on the backend such as `users`, `transcript_jobs`, `transcripts` are all related to one another, since we need to distinguish which user has access to which transcripts. To extract data from them, we need to be able to form a complex and systematic queries for the exact information.

Supabase also provides RLS (Row Level Security) with anon key, so that even when the anon key is made public, the user can only access their own transcripts. This promotes per-user isolation within the system.

Supabase uses JWT token for authentication.

Furthermore, Supabase runs edge functions in a serverless manner (on-demand). This ensures that no server-side action waits for user request indefinitely.

### `supabase/functions/generate-summary`

This is a function that runs on Supabase after it receives a POST request from Modal.com's `transcribe.py`. It receives the `transcript_id` in a json format from Modal.com.

It then uses the fetched `transcript_id` to access the transcript from Supabase's `transcripts` table, looks at all of its segments, and truncates it for the first 12k tokens (approximately 48k characters). This truncated transcript is sent as content along with a pre-designed prompt for generating a summary. The received summary is then written to DB.

### `supabase/functions/fetch-podcast`

`fetch-podcast` handles user actions including `search` and `episodes` in their requests.

`handleSearch` computes SHA-1 HMAC for authenticating into Podcast Index, then performs a query using the API. The result of the query is then returned as a response.

`handleEpisodes` fetch and parse the RSS feed for a podcast. The parsed information is then upserted (updated if it already exists, inserted if it is new) to the database. It then returns episodes for the selected podcast from the Supabase database `episodes`.

### `supabase/functions/start_transcription`

When a request is made to this endpoint, this edge function firstly sends out corsHeader for allowing cross origin resource sharing.

Then, the authHeader is examined from the request for the user's JWT. `userSupabase` is created based on the Supabase ANON key, and from this the user information is extracted using `userSupabase.auth.getUser()`. If this user is verified, then we move onto next checks.

The function then conducts rate limiting and duplicate job check by finding the number of requests made by the user in the given timeframe and the duplicate job existence, using `supabase` with `user_id = {user.id}`.

After passing these checks, the function loads the audio url for the requested podcast episode using `episode_id` from the user's request. Then, it creates a new entry for `transcription_job`, and call modal.com webhook using `Deno.env`.
