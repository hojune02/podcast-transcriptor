"""
PodScribe Modal.com transcription worker.

Deploy:   modal deploy main.py
Dev mode: modal serve main.py
Logs:     modal app logs podscribe-transcription
"""

import os
import modal

app = modal.App("podscribe-transcription")

# ─── Container image ──────────────────────────────────────────────────────────
# Build once, cached between deploys unless dependencies change

transcription_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "ffmpeg",              # audio processing
        "wget",                # audio download
        "git",
        "pkg-config",          # required to build PyAV from source
        "libavformat-dev",     # PyAV C headers
        "libavcodec-dev",
        "libavdevice-dev",
        "libavutil-dev",
        "libswscale-dev",
        "libswresample-dev",
        "libavfilter-dev",
    )
    .pip_install(
        "numpy<2",          # pyannote.audio 3.1.1 uses np.NaN (removed in NumPy 2.0)
        "torch==2.1.0",
        "torchaudio==2.1.0",
        "pyannote.audio==3.1.1",
        # whisperx without a pin → gets latest release which supports faster-whisper>=0.10.0
        # faster-whisper without a pin → resolves to >=0.10.0 which requires av==11.* (builds fine)
        "faster-whisper",
        "whisperx",
        "supabase==2.7.4",
        "requests==2.31.0",
    )
    # Copy transcribe.py into the image so it's importable at runtime
    .add_local_file("transcribe.py", "/root/transcribe.py", copy=True)
    # Pre-download the WhisperX large-v3 model into the image
    .run_commands(
        "python -c \"import whisperx; whisperx.load_model('large-v3', 'cpu', compute_type='float32')\"",
    )
)

# ─── Secrets ──────────────────────────────────────────────────────────────────
# Create with: modal secret create podscribe-secrets SUPABASE_URL=... etc.
secrets = [modal.Secret.from_name("podscribe-secrets")]


# ─── Transcription function ───────────────────────────────────────────────────

@app.function(
    image=transcription_image,
    gpu="A10G",       # ~$0.19/hr on Modal; handles large-v3 comfortably
    timeout=3600,     # 1 hour max
    secrets=secrets,
    retries=1,
)
def transcribe(job_id: str, episode_id: str, audio_url: str, user_id: str) -> dict:
    """
    GPU-accelerated WhisperX transcription.
    Called by the webhook endpoint below.
    """
    from transcribe import run_transcription

    try:
        return run_transcription(
            job_id=job_id,
            episode_id=episode_id,
            audio_url=audio_url,
            user_id=user_id,
        )
    except Exception as e:
        # Mark job as failed in Supabase
        from supabase import create_client
        supabase = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_KEY"],
        )
        supabase.table("transcription_jobs").update({
            "status": "failed",
            "error_message": str(e),
        }).eq("id", job_id).execute()
        raise


# ─── Web endpoint (webhook from Supabase Edge Function) ───────────────────────

@app.function(
    image=modal.Image.debian_slim(python_version="3.11").pip_install("fastapi==0.109.0"),
    secrets=secrets,
)
@modal.fastapi_endpoint(method="POST")
async def webhook(body: dict) -> dict:
    """
    Receives POST from start-transcription Edge Function.
    Spawns the GPU transcription job asynchronously.

    Expected body: { job_id, episode_id, audio_url, user_id }
    """
    from fastapi.responses import JSONResponse

    job_id = body.get("job_id")
    episode_id = body.get("episode_id")
    audio_url = body.get("audio_url")
    user_id = body.get("user_id")

    if not all([job_id, episode_id, audio_url, user_id]):
        return JSONResponse({"error": "Missing required fields"}, status_code=400)

    # Spawn transcription (non-blocking — returns immediately)
    await transcribe.spawn.aio(
        job_id=job_id,
        episode_id=episode_id,
        audio_url=audio_url,
        user_id=user_id,
    )

    return {"status": "queued", "job_id": job_id}


# ─── Local testing ────────────────────────────────────────────────────────────

@app.local_entrypoint()
def main(
    job_id: str = "test-job-id",
    episode_id: str = "test-episode-id",
    audio_url: str = "",
    user_id: str = "test-user-id",
) -> None:
    """
    Test locally with:
    modal run main.py --audio-url https://example.com/podcast.mp3 --job-id xyz --episode-id abc --user-id uid
    """
    if not audio_url:
        print("Usage: modal run main.py --audio-url URL --job-id ID --episode-id ID --user-id ID")
        return

    result = transcribe.remote(
        job_id=job_id,
        episode_id=episode_id,
        audio_url=audio_url,
        user_id=user_id,
    )
    print("Result:", result)
