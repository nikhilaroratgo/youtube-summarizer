"""
YouTube Video Summarizer
Usage: python main.py <youtube_url> [--style brief|detailed|bullets] [--whisper] [--save]
"""

import logging
import os
import sys
import click
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
from rich.console import Console
from rich.panel import Panel
from rich.markdown import Markdown
from rich.spinner import Spinner
from rich import print as rprint

from transcriber import get_transcript
from summarizer import summarize_transcript

console = Console()


@click.command()
@click.argument("url")
@click.option(
    "--style",
    type=click.Choice(["brief", "detailed", "bullets"]),
    default="detailed",
    show_default=True,
    help="Summary style",
)
@click.option(
    "--whisper",
    is_flag=True,
    default=False,
    help="Force Whisper transcription (skip YouTube captions)",
)
@click.option(
    "--save-transcript",
    is_flag=True,
    default=False,
    help="Also save the transcript to a file",
)
@click.option(
    "--transcript-only",
    is_flag=True,
    default=False,
    help="Only extract and print the transcript, skip summarization",
)
def main(url: str, style: str, whisper: bool, save_transcript: bool, transcript_only: bool):
    """Transcribe and summarize a YouTube video."""

    if not os.environ.get("ANTHROPIC_API_KEY") and not transcript_only:
        console.print(
            "[red]Error:[/red] ANTHROPIC_API_KEY environment variable not set.\n"
            "Set it with: export ANTHROPIC_API_KEY=your_key_here"
        )
        sys.exit(1)

    console.print(f"\n[bold cyan]YouTube Summarizer[/bold cyan]")
    console.print(f"URL: [link]{url}[/link]\n")

    # Step 1: Get transcript
    with console.status("[bold yellow]Extracting transcript...[/bold yellow]"):
        try:
            transcript, method = get_transcript(url, force_whisper=whisper)
        except Exception as e:
            console.print(f"[red]Failed to get transcript:[/red] {e}")
            sys.exit(1)

    method_label = {
        "youtube_captions": "YouTube captions",
        "whisper": "Whisper (audio transcription)",
    }.get(method, method)

    console.print(f"[green]Transcript extracted[/green] via {method_label}")
    console.print(f"Length: {len(transcript):,} characters / ~{len(transcript.split()):,} words\n")

    # Always show the full transcript
    console.print(Panel(
        transcript,
        title="[bold]Transcript[/bold]",
        border_style="blue",
        padding=(1, 2),
    ))

    if transcript_only:
        if save_transcript:
            _save_transcript(url, transcript)
        return

    # Step 2: Summarize
    with console.status(f"[bold yellow]Summarizing ({style} style)...[/bold yellow]"):
        try:
            summary, usage = summarize_transcript(transcript, style=style)
        except Exception as e:
            console.print(f"[red]Failed to summarize:[/red] {e}")
            sys.exit(1)

    # Display results
    console.print(Panel(
        Markdown(summary),
        title=f"[bold]Summary ({style})[/bold]",
        border_style="green",
        padding=(1, 2),
    ))

    summary_path = _save_summary(url, summary, usage)
    console.print(f"[dim]Summary saved to {summary_path}[/dim]")

    if save_transcript:
        _save_transcript(url, transcript)


def _save_summary(url: str, summary: str, usage: dict) -> str:
    """Save summary to output/<video_id>_summary.txt. Returns the file path."""
    from transcriber import extract_video_id
    video_id = extract_video_id(url)
    os.makedirs("output", exist_ok=True)
    path = f"output/{video_id}_summary.txt"
    with open(path, "w", encoding="utf-8") as f:
        f.write(url + "\n")
        f.write(
            f"Tokens: input={usage['input_tokens']}, "
            f"output={usage['output_tokens']}, "
            f"total={usage['total_tokens']}\n\n"
        )
        f.write(summary)
    return path


def _save_transcript(url: str, transcript: str) -> str:
    """Save transcript to output/<video_id>_transcript.txt. Returns the file path."""
    from transcriber import extract_video_id
    video_id = extract_video_id(url)
    os.makedirs("output", exist_ok=True)
    path = f"output/{video_id}_transcript.txt"
    with open(path, "w", encoding="utf-8") as f:
        f.write(url + "\n\n")
        f.write(transcript)
    console.print(f"[dim]Transcript saved to {path}[/dim]")
    return path


if __name__ == "__main__":
    main()
