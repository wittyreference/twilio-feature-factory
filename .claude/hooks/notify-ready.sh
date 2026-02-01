#!/bin/bash
# ABOUTME: Desktop notification hook for when Claude finishes responding.
# ABOUTME: Uses native macOS notifications, Linux notify-send, or terminal bell.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source environment detection helper
source "$SCRIPT_DIR/_meta-mode.sh"

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

# Check for pending documentation actions (environment-aware path)
PENDING_ACTIONS="$CLAUDE_PENDING_ACTIONS"
NOTIFICATION_MSG="Ready for your input"
if [ -f "$PENDING_ACTIONS" ]; then
    ACTION_COUNT=$(grep -c "^\- \[" "$PENDING_ACTIONS" 2>/dev/null || echo "0")
    if [ "$ACTION_COUNT" -gt 0 ]; then
        NOTIFICATION_MSG="Ready - $ACTION_COUNT pending doc action(s)"
    fi
fi

# Send notification
notify_user "Claude Code" "$NOTIFICATION_MSG"

exit 0
