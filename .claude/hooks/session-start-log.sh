#!/bin/bash
# ABOUTME: Logs all SessionStart events to diagnose which sources fire when.
# ABOUTME: Captures source, session ID, and attempts summary extraction for compaction-like events.

INPUT=$(cat)

# Extract fields from hook input
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)
SOURCE=$(echo "$INPUT" | jq -r '.source // "unknown"' 2>/dev/null)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)
MODEL=$(echo "$INPUT" | jq -r '.model // "unknown"' 2>/dev/null)

# Source meta-mode detection for environment-aware paths
HOOK_DIR="$(dirname "$0")"
if [ -f "$HOOK_DIR/_meta-mode.sh" ]; then
    source "$HOOK_DIR/_meta-mode.sh"
fi

# Set up paths
if [ "$CLAUDE_META_MODE" = "true" ]; then
    LOGS_DIR=".meta/logs"
else
    LOGS_DIR=".claude/logs"
fi
mkdir -p "$LOGS_DIR"

TIMESTAMP=$(date -Iseconds)

# Log every SessionStart event (this is the diagnostic value)
echo "SessionStart: source=$SOURCE session=$SESSION_ID model=$MODEL timestamp=$TIMESTAMP" >> "$LOGS_DIR/session-events.log"

# For compaction-like events (source=compact, or any source with a transcript),
# attempt to extract the compaction summary
if [ "$SOURCE" = "compact" ] || [ "$SOURCE" = "clear" ] || [ "$SOURCE" = "plan" ]; then
    if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
        SUMMARY_FILE="$LOGS_DIR/compaction-summary-$(date +%Y%m%d-%H%M%S).md"

        # Extract the LAST compaction summary from transcript
        SUMMARY=$(jq -rs '[.[] | select(.isCompactSummary == true)] | last | .message.content' "$TRANSCRIPT_PATH" 2>/dev/null)

        if [ -n "$SUMMARY" ] && [ "$SUMMARY" != "null" ]; then
            {
                echo "# Compaction Summary"
                echo ""
                echo "**Captured:** $TIMESTAMP"
                echo "**Source:** $SOURCE"
                echo "**Session:** $SESSION_ID"
                echo "**Transcript:** $TRANSCRIPT_PATH"
                echo ""
                echo "---"
                echo ""
                echo "$SUMMARY"
            } > "$SUMMARY_FILE"
            echo "Compaction summary saved (source=$SOURCE): $SUMMARY_FILE" >&2
        fi
    fi
fi

# Reset session tracking on any session start (fresh session = fresh tracking)
if [ "$CLAUDE_META_MODE" = "true" ]; then
    SESSION_DIR="$PROJECT_ROOT/.meta"
else
    SESSION_DIR="$PROJECT_ROOT/.claude"
fi

# Reset session-start timestamp for the flywheel
date +%s > "$SESSION_DIR/.session-start"

# Clear session-files tracking (new session = new file list)
rm -f "$SESSION_DIR/.session-files"

exit 0
