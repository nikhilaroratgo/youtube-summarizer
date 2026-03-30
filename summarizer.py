"""
Summarizes transcripts using Claude API.
"""

import anthropic


def summarize_transcript(transcript: str, style: str = "detailed") -> str:
    """
    Summarize a transcript using Claude.

    Args:
        transcript: The full transcript text
        style: "brief" (3-5 bullets), "detailed" (full summary), or "bullets" (key points)
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
        transcript = transcript[:max_chars] + "\n\n[Transcript truncated due to length]"

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Here is a transcript from a YouTube video:\n\n"
                    f"<transcript>\n{transcript}\n</transcript>\n\n"
                    f"{instruction}"
                ),
            }
        ],
    )

    return message.content[0].text
