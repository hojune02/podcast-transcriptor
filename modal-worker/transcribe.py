"""
WhisperX transcription pipeline for PodScribe.
Called by main.py as a Modal function.
"""

import os
import subprocess
import tempfile
import json
from typing import Any

import whisperx
from supabase import create_client, Client


def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def update_job(supabase: Client, job_id: str, **kwargs: Any) -> None:
    supabase.table("transcription_jobs").update(kwargs).eq("id", job_id).execute()


def download_audio(url: str, dest: str) -> None:
    """Download audio file, following redirects."""
    result = subprocess.run(
        ["wget", "-q", "-O", dest, "--timeout=120", url],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Download failed: {result.stderr}")


def transcribe_audio(audio_path: str, job_id: str, supabase: Client) -> dict:
    """
    Run full WhisperX pipeline:
    1. Transcribe with large-v3
    2. Align word-level timestamps
    3. Diarize speakers
    """
    device = "cuda"
    compute_type = "float16"

    update_job(supabase, job_id, status="processing", progress=10)

    # Step 1: Transcribe
    model = whisperx.load_model("large-v3", device, compute_type=compute_type)
    audio = whisperx.load_audio(audio_path)
    result = model.transcribe(audio, batch_size=16)
    del model  # free GPU memory

    update_job(supabase, job_id, progress=40)

    # Step 2: Align for word-level timestamps
    model_a, metadata = whisperx.load_align_model(
        language_code=result["language"],
        device=device,
    )
    result = whisperx.align(
        result["segments"],
        model_a,
        metadata,
        audio,
        device,
        return_char_alignments=False,
    )
    del model_a

    update_job(supabase, job_id, progress=70)

    # Step 3: Speaker diarization (requires HuggingFace token for pyannote)
    hf_token = os.environ.get("HUGGINGFACE_TOKEN")
    if hf_token:
        try:
            diarize_model = whisperx.DiarizationPipeline(
                use_auth_token=hf_token,
                device=device,
            )
            diarize_segments = diarize_model(audio)
            result = whisperx.assign_word_speakers(diarize_segments, result)
        except Exception as e:
            print(f"Diarization failed (continuing without): {e}")

    update_job(supabase, job_id, progress=90)

    return result


def save_transcript(
    supabase: Client,
    job_id: str,
    episode_id: str,
    user_id: str,
    result: dict,
    audio_duration: float,
) -> str:
    """Save transcript to Supabase, return transcript ID."""
    segments = result.get("segments", [])
    word_count = sum(len(seg.get("text", "").split()) for seg in segments)

    response = (
        supabase.table("transcripts")
        .insert({
            "job_id": job_id,
            "episode_id": episode_id,
            "user_id": user_id,
            "segments": segments,
            "language": result.get("language"),
            "duration_seconds": int(audio_duration),
            "word_count": word_count,
        })
        .execute()
    )
    return response.data[0]["id"]


def trigger_summary(supabase_url: str, transcript_id: str) -> None:
    """Call the generate-summary Edge Function (fire and forget)."""
    import httpx
    url = f"{supabase_url}/functions/v1/generate-summary"
    try:
        httpx.post(
            url,
            json={"transcript_id": transcript_id},
            headers={"Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_KEY']}"},
            timeout=10,
        )
    except Exception as e:
        print(f"Summary trigger failed (non-fatal): {e}")


def run_transcription(job_id: str, episode_id: str, audio_url: str, user_id: str) -> dict:
    """Main entry point called by Modal function."""
    supabase = get_supabase()

    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, "audio.mp3")

        # Download audio
        update_job(supabase, job_id, status="processing", progress=5)
        download_audio(audio_url, audio_path)

        # Get audio duration
        import torchaudio
        info = torchaudio.info(audio_path)
        duration_seconds = info.num_frames / info.sample_rate

        # Run transcription pipeline
        result = transcribe_audio(audio_path, job_id, supabase)

        # Save to DB
        transcript_id = save_transcript(
            supabase, job_id, episode_id, user_id, result, duration_seconds
        )

        # Mark job complete
        from datetime import datetime, timezone
        update_job(
            supabase,
            job_id,
            status="completed",
            progress=100,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )

        # Trigger async summary generation
        trigger_summary(os.environ["SUPABASE_URL"], transcript_id)

        return {"status": "success", "transcript_id": transcript_id}
