"""
Handles transcript extraction from YouTube videos.
Strategy 1: YouTube's built-in captions (fast, no download)
Strategy 2: Download audio + Whisper transcription (fallback)
"""

import logging
import os
import tempfile
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled
from urllib.parse import urlparse, parse_qs

logger = logging.getLogger(__name__)


def extract_video_id(url: str) -> str:
    """Extract YouTube video ID from various URL formats."""
    parsed = urlparse(url)
    if parsed.hostname in ("youtu.be",):
        return parsed.path.lstrip("/").split("?")[0]
    if parsed.hostname in ("www.youtube.com", "youtube.com", "m.youtube.com"):
        if parsed.path == "/watch":
            return parse_qs(parsed.query).get("v", [None])[0]
        if parsed.path.startswith(("/embed/", "/v/", "/shorts/")):
            return parsed.path.split("/")[2]
    raise ValueError(f"Could not extract video ID from URL: {url}")


def get_transcript_from_captions(video_id: str) -> tuple[str, str]:
    """
    Try to get transcript from YouTube captions.
    Returns (transcript_text, method) or raises an exception.
    """
    logger.info("Fetching available transcripts for video: %s", video_id)
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

        # Prefer manually created English transcripts first
        transcript = None
        try:
            transcript = transcript_list.find_manually_created_transcript(["en", "en-US", "en-GB"])
            logger.info("Found manually created English transcript")
        except Exception:
            pass

        # Fall back to auto-generated English
        if not transcript:
            try:
                transcript = transcript_list.find_generated_transcript(["en", "en-US", "en-GB"])
                logger.info("Found auto-generated English transcript")
            except Exception:
                pass

        # Fall back to any transcript and translate to English
        if not transcript:
            transcript = next(iter(transcript_list))
            logger.info("No English transcript found; translating %s to English", transcript.language_code)
            transcript = transcript.translate("en")

        logger.info("Fetching transcript data...")
        data = transcript.fetch()
        full_text = " ".join(entry["text"] for entry in data)
        logger.info("Transcript fetched: %d characters, ~%d words", len(full_text), len(full_text.split()))
        return full_text, "youtube_captions"

    except (NoTranscriptFound, TranscriptsDisabled) as e:
        raise RuntimeError(f"No captions available: {e}")


def _check_ffmpeg() -> None:
    """Raise a clear error if ffmpeg is not installed."""
    import shutil
    if shutil.which("ffmpeg") is None:
        raise RuntimeError(
            "ffmpeg is required for audio transcription but was not found.\n"
            "Install it and try again:\n"
            "  macOS:  brew install ffmpeg\n"
            "  Ubuntu: sudo apt install ffmpeg"
        )


def get_transcript_via_whisper(url: str) -> tuple[str, str]:
    """
    Download audio and transcribe with Whisper.
    Returns (transcript_text, method).
    """
    import whisper
    import yt_dlp

    _check_ffmpeg()

    logger.info("Downloading audio with yt-dlp...")
    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, "audio.%(ext)s")

        # No postprocessors — skip ffmpeg conversion, download raw audio
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": audio_path,
            "quiet": True,
            "no_warnings": True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        # Find the downloaded audio file (webm, m4a, opus, etc.)
        files = os.listdir(tmpdir)
        if not files:
            raise RuntimeError("No audio file downloaded")
        audio_file = os.path.join(tmpdir, files[0])
        logger.info("Audio downloaded: %s", os.path.basename(audio_file))

        logger.info("Loading Whisper 'base' model...")
        model = whisper.load_model("base")
        logger.info("Transcribing audio with Whisper...")
        result = model.transcribe(audio_file)
        transcript = result["text"]
        logger.info("Whisper transcription complete: %d characters, ~%d words",
                    len(transcript), len(transcript.split()))
        return transcript, "whisper"


def get_transcript(url: str, force_whisper: bool = False) -> tuple[str, str]:
    """
    Get transcript using best available method.
    Returns (transcript_text, method_used).
    """
    video_id = extract_video_id(url)
    logger.info("Extracted video ID: %s", video_id)

    if not force_whisper:
        logger.info("Trying YouTube captions first...")
        try:
            return get_transcript_from_captions(video_id)
        except Exception as e:
            logger.warning("Captions unavailable (%s); falling back to Whisper", e)

    logger.info("Using Whisper for transcription")
    return get_transcript_via_whisper(url)
