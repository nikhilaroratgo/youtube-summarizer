"""
YouTube Video Summarizer
Usage: python main.py <youtube_url> [--style brief|detailed|bullets] [--whisper] [--save]
"""

import os
import sys
import click
from dotenv import load_dotenv

load_dotenv()
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
    "--save",
    is_flag=True,
    default=False,
    help="Save transcript and summary to files",
)
@click.option(
    "--transcript-only",
    is_flag=True,
    default=False,
    help="Only extract and print the transcript, skip summarization",
)
def main(url: str, style: str, whisper: bool, save: bool, transcript_only: bool):
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

    if transcript_only:
        console.print(Panel(transcript[:3000] + ("..." if len(transcript) > 3000 else ""),
                            title="Transcript (preview)", border_style="blue"))
        if save:
            _save_files(url, transcript, None)
        return

    # Step 2: Summarize
    with console.status(f"[bold yellow]Summarizing ({style} style)...[/bold yellow]"):
        try:
            summary = summarize_transcript(transcript, style=style)
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

    if save:
        _save_files(url, transcript, summary)


def _save_files(url: str, transcript: str, summary: str | None):
    """Save transcript and summary to text files."""
    from transcriber import extract_video_id
    video_id = extract_video_id(url)
    os.makedirs("output", exist_ok=True)

    transcript_path = f"output/{video_id}_transcript.txt"
    with open(transcript_path, "w", encoding="utf-8") as f:
        f.write(f"Source: {url}\n\n")
        f.write(transcript)
    console.print(f"[dim]Transcript saved to {transcript_path}[/dim]")

    if summary:
        summary_path = f"output/{video_id}_summary.txt"
        with open(summary_path, "w", encoding="utf-8") as f:
            f.write(f"Source: {url}\n\n")
            f.write(summary)
        console.print(f"[dim]Summary saved to {summary_path}[/dim]")


if __name__ == "__main__":
    main()
