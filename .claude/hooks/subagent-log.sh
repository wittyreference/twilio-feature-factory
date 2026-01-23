#!/bin/bash
# ABOUTME: Triggers documentation flywheel hooks after subagent completion.
# ABOUTME: The actual value is in doc-update-check.sh, not activity logging.

# Determine the project root (where .claude directory is)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Call dev hooks if they exist (local development only, .claude-dev is gitignored)
DEV_HOOK="$PROJECT_ROOT/.claude-dev/hooks/doc-update-check.sh"
if [ -x "$DEV_HOOK" ]; then
    "$DEV_HOOK"
fi

exit 0
