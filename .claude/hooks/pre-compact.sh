#!/bin/bash
# ABOUTME: Captures context state before auto-compaction for debugging.
# ABOUTME: Saves current plan and session state to logs directory.

# Source meta-mode detection for environment-aware paths
HOOK_DIR="$(dirname "$0")"
if [ -f "$HOOK_DIR/_meta-mode.sh" ]; then
    source "$HOOK_DIR/_meta-mode.sh"
fi

# Set up paths
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOGS_DIR="${CLAUDE_LOGS_DIR:-.claude/logs}"
COMPACTION_LOG="$LOGS_DIR/compaction-${TIMESTAMP}.md"

# Create logs directory if needed
mkdir -p "$LOGS_DIR"

# Capture current plan state if available
PLAN_FILE="${CLAUDE_PLAN_FILE:-}"
if [ -n "$PLAN_FILE" ] && [ -f "$PLAN_FILE" ]; then
    {
        echo "# Pre-Compaction Snapshot"
        echo ""
        echo "**Timestamp:** $(date -Iseconds)"
        echo "**Plan File:** $PLAN_FILE"
        echo "**Branch:** $(git branch --show-current 2>/dev/null || echo 'unknown')"
        echo ""
        echo "---"
        echo ""
        echo "## Plan Content"
        echo ""
        cat "$PLAN_FILE"
        echo ""
        echo "---"
        echo ""
    } > "$COMPACTION_LOG"

    echo "Pre-compaction snapshot saved to: $COMPACTION_LOG" >&2
fi

# Capture session files if tracking
SESSION_FILES="${CLAUDE_META_DIR:-.claude}/.session-files"
if [ -f "$SESSION_FILES" ]; then
    FILE_COUNT=$(wc -l < "$SESSION_FILES" | tr -d ' ')
    echo "Session files tracked: $FILE_COUNT" >&2

    if [ -n "$PLAN_FILE" ] && [ -f "$COMPACTION_LOG" ]; then
        {
            echo "## Session Files Tracked"
            echo ""
            echo "Files modified this session:"
            echo ""
            echo "\`\`\`"
            cat "$SESSION_FILES"
            echo "\`\`\`"
        } >> "$COMPACTION_LOG"
    fi
fi

# Capture pending actions if any
PENDING_ACTIONS="${CLAUDE_PENDING_ACTIONS:-}"
if [ -n "$PENDING_ACTIONS" ] && [ -f "$PENDING_ACTIONS" ]; then
    ACTION_COUNT=$(grep -c "^-" "$PENDING_ACTIONS" 2>/dev/null || echo "0")
    if [ "$ACTION_COUNT" -gt 0 ]; then
        echo "Pending doc actions: $ACTION_COUNT" >&2

        if [ -f "$COMPACTION_LOG" ]; then
            {
                echo ""
                echo "## Pending Documentation Actions"
                echo ""
                cat "$PENDING_ACTIONS"
            } >> "$COMPACTION_LOG"
        fi
    fi
fi

# Always exit successfully - don't block compaction
exit 0
