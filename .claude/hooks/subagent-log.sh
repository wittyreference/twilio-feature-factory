#!/bin/bash
# ABOUTME: Logs subagent activity with rich context from transcript parsing.
# ABOUTME: Extracts subagent type, files modified, and commits from agent transcripts.

# Determine the project root (where .claude directory is)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$PROJECT_ROOT/.claude/logs"
LOG_FILE="$LOG_DIR/subagent-activity.log"
LOCK_FILE="$LOG_FILE.lock"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Get timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Get git context if available
GIT_BRANCH="N/A"
if [ -d "$PROJECT_ROOT/.git" ]; then
    GIT_BRANCH=$(cd "$PROJECT_ROOT" && git branch --show-current 2>/dev/null || echo "N/A")
fi

# Read hook input from stdin (JSON)
HOOK_INPUT=$(cat)

# Initialize variables with defaults
AGENT_ID="unknown"
SUBAGENT_TYPE="unknown"
FILES_MODIFIED=""
COMMITS=""

# Try to parse hook input if jq is available
if command -v jq &> /dev/null && [ -n "$HOOK_INPUT" ]; then
    # Extract agent_id from hook input
    PARSED_AGENT_ID=$(echo "$HOOK_INPUT" | jq -r '.agent_id // empty' 2>/dev/null)
    if [ -n "$PARSED_AGENT_ID" ]; then
        AGENT_ID="$PARSED_AGENT_ID"
    fi

    # Extract transcript path from hook input
    TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.agent_transcript_path // empty' 2>/dev/null)

    # Parse transcript if it exists
    if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
        # Extract subagent type from skill invocation or command name
        # Look for patterns like "/architect", "/dev", "/test", etc. in the transcript
        PARSED_TYPE=$(grep -oE '"skill"\s*:\s*"[^"]+"' "$TRANSCRIPT_PATH" 2>/dev/null | head -1 | sed 's/.*"skill"\s*:\s*"\([^"]*\)".*/\1/')
        if [ -z "$PARSED_TYPE" ]; then
            # Fallback: look for subagent type in prompt content
            PARSED_TYPE=$(grep -oE '/(architect|dev|test|review|spec|docs|test-gen|orchestrate)' "$TRANSCRIPT_PATH" 2>/dev/null | head -1 | tr -d '/')
        fi
        if [ -n "$PARSED_TYPE" ]; then
            SUBAGENT_TYPE="/$PARSED_TYPE"
        fi

        # Extract files modified from Write/Edit tool calls
        # Look for file_path in tool input
        FILES_LIST=$(grep -oE '"file_path"\s*:\s*"[^"]+"' "$TRANSCRIPT_PATH" 2>/dev/null | sed 's/.*"file_path"\s*:\s*"\([^"]*\)".*/\1/' | sort -u | head -5)
        if [ -n "$FILES_LIST" ]; then
            # Convert to relative paths and join with commas
            FILES_MODIFIED=$(echo "$FILES_LIST" | while read -r f; do
                echo "$f" | sed "s|$PROJECT_ROOT/||"
            done | paste -sd ", " -)
        fi

        # Extract commit hashes from tool output
        # Look for patterns like [abc1234] or commit abc1234
        COMMITS=$(grep -oE '\[[a-f0-9]{7,8}\]|commit [a-f0-9]{7,8}' "$TRANSCRIPT_PATH" 2>/dev/null | grep -oE '[a-f0-9]{7,8}' | sort -u | head -3 | paste -sd ", " -)
    fi
fi

# Use file locking to prevent race conditions
# The lock is released when the subshell exits
(
    flock -x 200 2>/dev/null || true

    # Write log entry
    {
        echo "[$TIMESTAMP] Subagent: $SUBAGENT_TYPE"
        echo "  Agent ID: ${AGENT_ID:0:7}"
        echo "  Branch: $GIT_BRANCH"
        if [ -n "$FILES_MODIFIED" ]; then
            echo "  Files: $FILES_MODIFIED"
        fi
        if [ -n "$COMMITS" ]; then
            echo "  Commits: $COMMITS"
        fi
        echo "---"
    } >> "$LOG_FILE"

) 200>"$LOCK_FILE"

# Keep log file from growing too large (keep last 500 lines)
if [ -f "$LOG_FILE" ]; then
    LINES=$(wc -l < "$LOG_FILE" | tr -d ' ')
    if [ "$LINES" -gt 500 ]; then
        (
            flock -x 200 2>/dev/null || true
            tail -500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
        ) 200>"$LOCK_FILE"
    fi
fi

# Call dev hooks if they exist (local development only, .claude-dev is gitignored)
DEV_HOOK="$PROJECT_ROOT/.claude-dev/hooks/doc-update-check.sh"
if [ -x "$DEV_HOOK" ]; then
    "$DEV_HOOK"
fi

exit 0
