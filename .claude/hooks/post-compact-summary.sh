#!/bin/bash
# ABOUTME: Captures the compaction summary after context is compacted.
# ABOUTME: Extracts the summary from transcript and saves for debugging.
#
# KNOWN ISSUE: Claude Code ≥2.1.59 removed the isCompactSummary boolean marker
# from transcript entries and may no longer fire SessionStart with source=compact.
# This hook attempts both the legacy boolean detection and content-based fallback,
# but may not capture summaries on newer versions. See: github.com/anthropics/claude-code/issues

# Read JSON input from stdin.
# Two callers:
#   1. SessionStart hook (manual /compact) - has "source": "compact"
#   2. PostToolUse hooks via marker file - has session_id/transcript_path but no source
INPUT=$(cat)

# Extract fields from hook input
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)
SOURCE=$(echo "$INPUT" | jq -r '.source // "marker"' 2>/dev/null)

# Only run for compaction-related invocations (SessionStart compact or marker file)
if [ "$SOURCE" != "compact" ] && [ "$SOURCE" != "marker" ]; then
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
    # Try two detection methods:
    # 1. (Legacy, ≤2.1.50) isCompactSummary boolean field
    # 2. (Current, ≥2.1.59) Content-based detection — look for "continued from a previous conversation"
    SUMMARY=$(jq -rs '[.[] | select(.isCompactSummary == true)] | last | .message.content' "$TRANSCRIPT_PATH" 2>/dev/null)

    if [ -z "$SUMMARY" ] || [ "$SUMMARY" = "null" ]; then
        # Fallback: find by content pattern (Claude Code ≥2.1.59 dropped the boolean marker)
        # In new format, the summary is a user message with string content containing
        # "This session is being continued from a previous conversation"
        SUMMARY=$(grep '"This session is being continued' "$TRANSCRIPT_PATH" 2>/dev/null \
            | while IFS= read -r line; do
                # Only accept user messages with string content (the actual summary)
                content_type=$(echo "$line" | jq -r '.message.content | type' 2>/dev/null)
                msg_type=$(echo "$line" | jq -r '.type' 2>/dev/null)
                if [ "$content_type" = "string" ] && [ "$msg_type" = "user" ]; then
                    echo "$line" | jq -r '.message.content' 2>/dev/null
                fi
            done | tail -1)
    fi

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
