"""
Handles transcript extraction from YouTube videos.
Strategy 1: YouTube's built-in captions (fast, no download)
Strategy 2: Download audio + Whisper transcription (fallback)
"""

import os
import tempfile
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled
from urllib.parse import urlparse, parse_qs


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
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

        # Prefer manually created English transcripts first
        transcript = None
        try:
            transcript = transcript_list.find_manually_created_transcript(["en", "en-US", "en-GB"])
        except Exception:
            pass

        # Fall back to auto-generated English
        if not transcript:
            try:
                transcript = transcript_list.find_generated_transcript(["en", "en-US", "en-GB"])
            except Exception:
                pass

        # Fall back to any transcript and translate to English
        if not transcript:
            transcript = next(iter(transcript_list))
            transcript = transcript.translate("en")

        data = transcript.fetch()
        full_text = " ".join(entry["text"] for entry in data)
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

        model = whisper.load_model("base")
        result = model.transcribe(audio_file)
        return result["text"], "whisper"


def get_transcript(url: str, force_whisper: bool = False) -> tuple[str, str]:
    """
    Get transcript using best available method.
    Returns (transcript_text, method_used).
    """
    video_id = extract_video_id(url)

    if not force_whisper:
        try:
            return get_transcript_from_captions(video_id)
        except Exception:
            pass  # Fall through to Whisper

    return get_transcript_via_whisper(url)
