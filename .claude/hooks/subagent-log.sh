#!/bin/bash
# ABOUTME: Hook for SubagentStop events - triggers doc update reminder.
# ABOUTME: Runs after any subagent completes work - natural checkpoint for docs.

# Subagent completion is a great time to remind about docs because:
# - Work was just completed that might need documenting
# - There's a natural pause before the next task
# - The debounce (2 min) prevents spam during rapid subagent calls

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Call the consolidated flywheel-doc-check (environment-aware)
FLYWHEEL_HOOK="$SCRIPT_DIR/flywheel-doc-check.sh"
if [ -x "$FLYWHEEL_HOOK" ]; then
    "$FLYWHEEL_HOOK"
fi

exit 0
