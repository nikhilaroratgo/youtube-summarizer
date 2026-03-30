#!/bin/bash
# Setup script for YouTube Summarizer

echo "Setting up YouTube Summarizer..."

# Check uv
if ! command -v uv &> /dev/null; then
    echo "uv not found. Installing..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    source "$HOME/.local/bin/env"
fi

# Create venv and install dependencies
uv sync

# Check ffmpeg (required for Whisper fallback)
if ! command -v ffmpeg &> /dev/null; then
    echo ""
    echo "ffmpeg not found. Install it for Whisper audio transcription support:"
    echo "  macOS:  brew install ffmpeg"
    echo "  Ubuntu: sudo apt install ffmpeg"
    echo ""
    echo "(Not required if YouTube captions are available for your videos)"
fi

echo ""
echo "Setup complete! To use:"
echo ""
echo "  1. Set API key:  export ANTHROPIC_API_KEY=your_key_here"
echo "  2. Run:          uv run main.py 'https://youtube.com/watch?v=...'"
echo ""
echo "Options:"
echo "  --style brief|detailed|bullets   Summary style (default: detailed)"
echo "  --whisper                         Force Whisper transcription"
echo "  --save                            Save transcript + summary to output/"
echo "  --transcript-only                 Only extract transcript, no summary"
