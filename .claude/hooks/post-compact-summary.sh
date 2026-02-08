#!/bin/bash
# ABOUTME: Captures the compaction summary after context is compacted.
# ABOUTME: Extracts the summary from transcript and saves for debugging.

# Read JSON input from stdin
INPUT=$(cat)

# Extract fields from hook input
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)
SOURCE=$(echo "$INPUT" | jq -r '.source // "unknown"' 2>/dev/null)

# Only run for compaction restarts
if [ "$SOURCE" != "compact" ]; then
    exit 0
fi

# Source meta-mode detection for environment-aware paths
HOOK_DIR="$(dirname "$0")"
if [ -f "$HOOK_DIR/_meta-mode.sh" ]; then
    source "$HOOK_DIR/_meta-mode.sh"
fi

# Set up paths - use .meta/logs if in meta mode
if [ "$CLAUDE_META_MODE" = "true" ]; then
    LOGS_DIR=".meta/logs"
else
    LOGS_DIR=".claude/logs"
fi

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SUMMARY_FILE="$LOGS_DIR/compaction-summary-${TIMESTAMP}.md"

# Create logs directory if needed
mkdir -p "$LOGS_DIR"

# Extract the compaction summary from transcript
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
    # Find the LAST entry with isCompactSummary: true and extract the full message content
    # Use -s (slurp) to read all entries, filter to summaries, take last one
    SUMMARY=$(jq -rs '[.[] | select(.isCompactSummary == true)] | last | .message.content' "$TRANSCRIPT_PATH" 2>/dev/null)

    if [ -n "$SUMMARY" ] && [ "$SUMMARY" != "null" ]; then
        {
            echo "# Compaction Summary"
            echo ""
            echo "**Captured:** $(date -Iseconds)"
            echo "**Session:** $SESSION_ID"
            echo "**Transcript:** $TRANSCRIPT_PATH"
            echo ""
            echo "---"
            echo ""
            echo "$SUMMARY"
        } > "$SUMMARY_FILE"

        echo "Compaction summary saved to: $SUMMARY_FILE" >&2
    else
        echo "Warning: Could not extract compaction summary from transcript" >&2
    fi
else
    echo "Warning: Transcript path not available or file doesn't exist" >&2
fi

# Always exit successfully
exit 0
