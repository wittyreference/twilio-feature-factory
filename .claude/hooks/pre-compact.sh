#!/bin/bash
# ABOUTME: Captures pre-compaction token count for debugging.
# ABOUTME: Logs when compaction is triggered and by what method.

# Read JSON input from stdin
INPUT=$(cat)

# Extract fields from hook input
TRIGGER=$(echo "$INPUT" | jq -r '.compactMetadata.trigger // .trigger // "unknown"' 2>/dev/null)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)

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

# Create logs directory if needed
mkdir -p "$LOGS_DIR"

# Log the compaction event (the summary will be captured by post-compact-summary.sh)
echo "PreCompact: trigger=$TRIGGER session=$SESSION_ID timestamp=$TIMESTAMP" >> "$LOGS_DIR/compaction-events.log"
echo "Compaction triggered ($TRIGGER) - summary will be captured after compaction" >&2

# Always exit successfully - don't block compaction
exit 0
