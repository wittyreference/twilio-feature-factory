#!/bin/bash
# ABOUTME: Hook for SubagentStop events - triggers doc update reminder.
# ABOUTME: Runs after any subagent completes work - natural checkpoint for docs.

# Subagent completion is a great time to remind about docs because:
# - Work was just completed that might need documenting
# - There's a natural pause before the next task
# - The debounce (2 min) prevents spam during rapid subagent calls

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Call doc-update-check if it exists in dev hooks
DEV_HOOK="$PROJECT_ROOT/.claude-dev/hooks/doc-update-check.sh"
if [ -x "$DEV_HOOK" ]; then
    "$DEV_HOOK"
fi

exit 0
