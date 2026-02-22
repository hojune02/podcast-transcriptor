# Notes for PodScribe

## Files & Programs Explained

### `supabase/functions/generate-summary`

This is a function that runs on Supabase after it receives a POST request from Modal.com's `transcribe.py`. It receives the `transcript_id` in a json format from Modal.com.

It then uses the fetched `transcript_id` to access the transcript from Supabase's `transcripts` table, looks at all of its segments, and truncates it for the first 12k tokens (approximately 48k characters). This truncated transcript is sent as content along with a pre-designed prompt for generating a summary. The received summary is then written to DB.