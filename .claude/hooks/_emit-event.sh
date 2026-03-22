#!/bin/bash
# ABOUTME: Shared JSONL event emitter for structured observability.
# ABOUTME: Source from any hook to emit events to $CLAUDE_LOGS_DIR/events.jsonl.

# Ensure meta-mode detection has run (sets CLAUDE_LOGS_DIR)
if [ -z "$CLAUDE_LOGS_DIR" ]; then
    _EMIT_HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "$_EMIT_HOOK_DIR/_meta-mode.sh" ]; then
        source "$_EMIT_HOOK_DIR/_meta-mode.sh"
    fi
fi

# emit_event TYPE PAYLOAD_JSON
#
# Appends a structured JSONL event to the events log.
# TYPE: event category (e.g., "bash_command", "file_write", "session_start")
# PAYLOAD_JSON: additional fields as a JSON object string
#
# The caller must set EMIT_SESSION_ID before calling, or it defaults to "unknown".
#
# Example:
#   EMIT_SESSION_ID="$MY_SESSION_ID"
#   source _emit-event.sh
#   emit_event "bash_command" '{"command":"npm test","exit_code":0}'
emit_event() {
    local event_type="$1"
    local payload="$2"

    # Require jq
    if ! command -v jq &>/dev/null; then
        return 0
    fi

    local log_dir="${CLAUDE_LOGS_DIR:-${PROJECT_ROOT:-.}/.claude/logs}"
    mkdir -p "$log_dir" 2>/dev/null || return 0

    local events_file="$log_dir/events.jsonl"
    local timestamp
    timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local session_id="${EMIT_SESSION_ID:-unknown}"

    # Build event: base fields + caller payload merged
    printf '%s\n' "$(jq -nc \
        --arg ts "$timestamp" \
        --arg type "$event_type" \
        --arg sid "$session_id" \
        --argjson payload "${payload:-{\}}" \
        '{timestamp:$ts, event_type:$type, session_id:$sid} + $payload'
    )" >> "$events_file" 2>/dev/null
}
