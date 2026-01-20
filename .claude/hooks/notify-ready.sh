#!/bin/bash
# ABOUTME: Desktop notification hook for when Claude finishes responding.
# ABOUTME: Uses native macOS notifications, Linux notify-send, or terminal bell.

notify_user() {
    local title="$1"
    local message="$2"

    # macOS native notification (AppleScript)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        osascript -e "display notification \"$message\" with title \"$title\" sound name \"Glass\"" 2>/dev/null || true
    # Linux with notify-send
    elif command -v notify-send &> /dev/null; then
        notify-send "$title" "$message" 2>/dev/null || true
    # Fallback: terminal bell
    else
        echo -e "\a"
    fi
}

# Call dev hooks if they exist (local development only, .claude-dev is gitignored)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEV_HOOK="$PROJECT_ROOT/.claude-dev/hooks/session-summary.sh"
if [ -x "$DEV_HOOK" ]; then
    "$DEV_HOOK"
fi

# Send notification
notify_user "Claude Code" "Ready for your input"

exit 0
