#!/bin/bash
# ABOUTME: Hook for SubagentStop events - logs agent type and triggers doc update reminder.
# ABOUTME: Runs after any subagent completes work - natural checkpoint for docs.

# Subagent completion is a great time to remind about docs because:
# - Work was just completed that might need documenting
# - There's a natural pause before the next task
# - The debounce (2 min) prevents spam during rapid subagent calls

# Read JSON input from stdin (CC v2.1.47+ provides last_assistant_message,
# CC v2.1.69+ provides agent_id and agent_type)
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT="$(cat)"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_meta-mode.sh"

# Log agent completion with type info if available
if [ -n "$HOOK_INPUT" ] && command -v jq &>/dev/null; then
    AGENT_TYPE=$(echo "$HOOK_INPUT" | jq -r '.agent_type // "unknown"' 2>/dev/null)
    AGENT_ID=$(echo "$HOOK_INPUT" | jq -r '.agent_id // ""' 2>/dev/null)
    if [ "$AGENT_TYPE" != "unknown" ] && [ "$AGENT_TYPE" != "null" ]; then
        echo "Subagent completed: type=$AGENT_TYPE id=${AGENT_ID:0:8}" >&2
    fi
fi

# Call the consolidated flywheel-doc-check (environment-aware)
FLYWHEEL_HOOK="$SCRIPT_DIR/flywheel-doc-check.sh"
if [ -x "$FLYWHEEL_HOOK" ]; then
    "$FLYWHEEL_HOOK"
fi

# Trigger learning exercise generation after autonomous work completes
LEARNING_HOOK="$SCRIPT_DIR/generate-learning-exercises.sh"
if [ -x "$LEARNING_HOOK" ]; then
    "$LEARNING_HOOK" 2>/dev/null || true
fi

exit 0
