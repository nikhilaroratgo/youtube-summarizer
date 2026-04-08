"""
Summarizes transcripts using Claude API.
"""

import logging
import anthropic

from typing import TypedDict

logger = logging.getLogger(__name__)


class TokenUsage(TypedDict):
    input_tokens: int
    output_tokens: int
    total_tokens: int


AVAILABLE_MODELS = [
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "claude-haiku-4-5-20251001",
]
DEFAULT_MODEL = "claude-sonnet-4-6"


def summarize_transcript(
    transcript: str,
    style: str = "detailed",
    model: str = DEFAULT_MODEL,
) -> tuple[str, TokenUsage, list[str]]:
    """Summarize a transcript using Claude and extract relevant hashtags.

    Args:
        transcript: The full transcript text.
        style: Summary style — "brief" (3-5 sentences), "detailed" (full summary),
            or "bullets" (key points grouped by subheading).
        model: Claude model ID to use for summarization.

    Returns:
        A tuple of (summary_text, token_usage, hashtags) where token_usage contains
        input_tokens, output_tokens, and total_tokens counts, and hashtags is a list
        of relevant hashtag strings (e.g. ["#technology", "#python"]).

    Raises:
        anthropic.APIError: If the Claude API request fails.
    """
    client = anthropic.Anthropic()

    style_instructions = {
        "brief": "Write a 3-5 sentence summary of the key points.",
        "detailed": (
            "Write a comprehensive summary with:\n"
            "1. **Main Topic**: What is this video about?\n"
            "2. **Key Points**: The most important ideas discussed\n"
            "3. **Details & Examples**: Notable details, examples, or data mentioned\n"
            "4. **Conclusions**: Any conclusions, recommendations, or takeaways\n"
        ),
        "bullets": (
            "Extract the key points as a bulleted list. "
            "Group related points under subheadings if appropriate."
        ),
    }

    instruction = style_instructions.get(style, style_instructions["detailed"])

    # Handle very long transcripts by chunking
    max_chars = 180_000  # ~45k tokens, safe limit for claude-sonnet
    if len(transcript) > max_chars:
        logger.warning(
            "Transcript too long (%d chars); truncating to %d chars",
            len(transcript),
            max_chars,
        )
        transcript = transcript[:max_chars] + "\n\n[Transcript truncated due to length]"

    logger.info(
        "Sending %d chars to Claude (model=%s, style=%s)",
        len(transcript),
        model,
        style,
    )
    message = client.messages.create(
        model=model,
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Here is a transcript from a YouTube video:\n\n"
                    f"<transcript>\n{transcript}\n</transcript>\n\n"
                    f"{instruction}\n\n"
                    f"After the summary, on a final line starting with exactly 'HASHTAGS:' "
                    f"list 3–6 relevant hashtags separated by spaces. "
                    f"Example: HASHTAGS: #technology #python #tutorial"
                ),
            }
        ],
    )

    raw = message.content[0].text

    # Split HASHTAGS line from summary body
    lines = raw.splitlines()
    hashtag_line = next(
        (l for l in reversed(lines) if l.strip().startswith("HASHTAGS:")), ""
    )
    summary_lines = [l for l in lines if not l.strip().startswith("HASHTAGS:")]
    summary = "\n".join(summary_lines).strip()

    hashtags: list[str] = []
    if hashtag_line:
        tag_part = hashtag_line.strip()[len("HASHTAGS:"):].strip()
        hashtags = [t for t in tag_part.split() if t.startswith("#")]

    usage: TokenUsage = {
        "input_tokens": message.usage.input_tokens,
        "output_tokens": message.usage.output_tokens,
        "total_tokens": message.usage.input_tokens + message.usage.output_tokens,
    }
    logger.info(
        "Summary received: %d chars, %d hashtags (input_tokens=%d, output_tokens=%d, total=%d)",
        len(summary),
        len(hashtags),
        usage["input_tokens"],
        usage["output_tokens"],
        usage["total_tokens"],
    )
    return summary, usage, hashtags
