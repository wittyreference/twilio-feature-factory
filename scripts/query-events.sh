#!/bin/bash
# ABOUTME: Query structured events from the observability JSONL log.
# ABOUTME: Convenience wrapper around jq for common event queries.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Detect meta-mode for correct log path
if [ -d "$PROJECT_ROOT/.meta" ]; then
    EVENTS_FILE="$PROJECT_ROOT/.meta/logs/events.jsonl"
else
    EVENTS_FILE="$PROJECT_ROOT/.claude/logs/events.jsonl"
fi

if [ ! -f "$EVENTS_FILE" ]; then
    echo "No events file found at $EVENTS_FILE"
    echo "Events are emitted by hooks during normal Claude Code operation."
    exit 0
fi

usage() {
    cat <<EOF
Usage: $(basename "$0") <command> [args]

Commands:
  summary              Event counts by type
  failures             Bash commands with non-zero exit codes
  timeline [N]         Last N events chronologically (default: 20)
  session <id>         Filter to specific session (prefix match)
  safety               Safety check events (injection detection)
  deploys              Deployment events
  tests                Test run events
  types                List all event types seen
  today                Events from today only
  raw                  Dump raw JSONL

Examples:
  $(basename "$0") summary
  $(basename "$0") timeline 50
  $(basename "$0") session abc123
  $(basename "$0") safety
EOF
}

if [ $# -eq 0 ]; then
    usage
    exit 0
fi

COMMAND="$1"
shift

case "$COMMAND" in
    summary)
        echo "Event counts by type:"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
        jq -s 'group_by(.event_type) | map({type: .[0].event_type, count: length}) | sort_by(-.count) | .[] | "\(.type): \(.count)"' "$EVENTS_FILE" | tr -d '"'
        echo ""
        TOTAL=$(wc -l < "$EVENTS_FILE" | tr -d ' ')
        echo "Total events: $TOTAL"
        ;;

    failures)
        echo "Failed bash commands:"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
        jq -s '[.[] | select(.event_type == "bash_command" and .exit_code != null and .exit_code != 0)] | if length == 0 then "None" else .[] | "\(.timestamp) exit=\(.exit_code) cmd=\(.command)" end' "$EVENTS_FILE" | tr -d '"'
        ;;

    timeline)
        N="${1:-20}"
        echo "Last $N events:"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
        tail -n "$N" "$EVENTS_FILE" | jq -r '"\(.timestamp) [\(.event_type)] \(del(.timestamp, .event_type, .session_id) | to_entries | map("\(.key)=\(.value)") | join(" "))"'
        ;;

    session)
        if [ $# -eq 0 ]; then
            echo "Usage: $(basename "$0") session <session_id_prefix>"
            exit 1
        fi
        SESSION_PREFIX="$1"
        echo "Events for session $SESSION_PREFIX*:"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
        jq -r "select(.session_id | startswith(\"$SESSION_PREFIX\")) | \"\(.timestamp) [\(.event_type)] \(del(.timestamp, .event_type, .session_id) | to_entries | map(\"\(.key)=\(.value)\") | join(\" \"))\"" "$EVENTS_FILE"
        ;;

    safety)
        echo "Safety check events:"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
        jq -s '[.[] | select(.event_type == "safety_check")] | if length == 0 then "No safety events recorded" else .[] | "\(.timestamp) check=\(.check) source=\(.input_source) result=\(.result) \(if .matched_pattern then "pattern=\(.matched_pattern)" else "" end)" end' "$EVENTS_FILE" | tr -d '"'
        ;;

    deploys)
        echo "Deployment events:"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
        jq -s '[.[] | select(.event_type == "deploy")] | if length == 0 then "No deployments recorded" else .[] | "\(.timestamp) \(.command // "unknown")" end' "$EVENTS_FILE" | tr -d '"'
        ;;

    tests)
        echo "Test run events:"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
        jq -s '[.[] | select(.event_type == "test_run")] | if length == 0 then "No test runs recorded" else .[] | "\(.timestamp) \(.command // "unknown")" end' "$EVENTS_FILE" | tr -d '"'
        ;;

    types)
        echo "Event types seen:"
        jq -r '.event_type' "$EVENTS_FILE" | sort -u
        ;;

    today)
        TODAY=$(date -u +%Y-%m-%d)
        echo "Events from $TODAY:"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
        jq -r "select(.timestamp | startswith(\"$TODAY\")) | \"\(.timestamp) [\(.event_type)] \(del(.timestamp, .event_type, .session_id) | to_entries | map(\"\(.key)=\(.value)\") | join(\" \"))\"" "$EVENTS_FILE"
        ;;

    raw)
        cat "$EVENTS_FILE"
        ;;

    *)
        echo "Unknown command: $COMMAND"
        usage
        exit 1
        ;;
esac
