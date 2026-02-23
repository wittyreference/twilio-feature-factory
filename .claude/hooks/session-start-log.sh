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

# --- Session Bootstrap Checks ---
# Local-only checks (no API calls, <500ms). Warnings to stderr so Claude sees them.
# These catch "you forgot to set up" issues. Run /preflight for full validation.

# Determine session dir early for stale check
if [ "$CLAUDE_META_MODE" = "true" ]; then
    SESSION_DIR="$PROJECT_ROOT/.meta"
else
    SESSION_DIR="$PROJECT_ROOT/.claude"
fi

# 1. Stale session check (BEFORE reset — checks the OLD timestamp)
if [ -f "$SESSION_DIR/.session-start" ]; then
    PREV_START=$(cat "$SESSION_DIR/.session-start" 2>/dev/null)
    NOW=$(date +%s)
    if [ -n "$PREV_START" ] && [ "$PREV_START" -gt 0 ] 2>/dev/null; then
        AGE_HOURS=$(( (NOW - PREV_START) / 3600 ))
        if [ "$AGE_HOURS" -gt 48 ]; then
            echo "WARNING: Previous session started ${AGE_HOURS}h ago. Flywheel 'recent commits' may return excessive results." >&2
        fi
    fi
fi

# 2. .env file check
if [ -f "$PROJECT_ROOT/.env" ]; then
    MISSING_VARS=""
    for VAR_NAME in TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_PHONE_NUMBER; do
        VAR_VALUE=$(grep "^${VAR_NAME}=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'")
        if [ -z "$VAR_VALUE" ]; then
            MISSING_VARS="${MISSING_VARS} ${VAR_NAME}"
        elif [ "$VAR_VALUE" = "your_account_sid_here" ] || [ "$VAR_VALUE" = "your_auth_token_here" ] || [ "$VAR_VALUE" = "your_phone_number_here" ] || echo "$VAR_VALUE" | grep -qE '^(xxx|placeholder|changeme|TODO)'; then
            MISSING_VARS="${MISSING_VARS} ${VAR_NAME}(placeholder)"
        fi
    done
    if [ -n "$MISSING_VARS" ]; then
        echo "WARNING: .env issues:${MISSING_VARS}" >&2
    fi
else
    echo "WARNING: No .env file found. Copy .env.example and configure credentials." >&2
fi

# 3. CLI profile check (reads local config, no network)
if command -v twilio >/dev/null 2>&1; then
    ACTIVE_PROFILE=$(twilio profiles:list 2>/dev/null | grep -E '(true|Active)' | head -1)
    if [ -z "$ACTIVE_PROFILE" ]; then
        echo "WARNING: No active Twilio CLI profile. Run 'twilio profiles:create' or 'twilio profiles:use <name>'." >&2
    fi
fi

# 4. Pending learning exercises check
if [ "$CLAUDE_META_MODE" = "true" ] && [ -n "$CLAUDE_LEARNING_DIR" ] && [ -d "$CLAUDE_LEARNING_DIR" ]; then
    EXERCISE_FILE="$CLAUDE_LEARNING_DIR/exercises.md"
    STATE_FILE="$CLAUDE_LEARNING_DIR/exercise-state.json"
    if [ -f "$EXERCISE_FILE" ]; then
        # Count exercise headers (## lines that aren't the file title)
        EXERCISE_COUNT=$(grep -c '^## ' "$EXERCISE_FILE" 2>/dev/null) || EXERCISE_COUNT=0
        if [ "$EXERCISE_COUNT" -gt 0 ]; then
            echo "LEARNING: $EXERCISE_COUNT exercise(s) pending — use /learn" >&2
        fi
    fi
    # Reset per-session exercise state
    if [ -f "$STATE_FILE" ]; then
        cat > "$STATE_FILE" <<STATEEOF
{
  "exercises_offered": 0,
  "exercises_completed": 0,
  "exercises_declined": false,
  "last_exercise_ts": 0,
  "topics_covered": []
}
STATEEOF
    fi
fi

echo "Run /preflight for full environment validation." >&2

# --- Reset Session Tracking ---
# Reset session-start timestamp for the flywheel
date +%s > "$SESSION_DIR/.session-start"

# Clear session-files tracking (new session = new file list)
rm -f "$SESSION_DIR/.session-files"

exit 0
