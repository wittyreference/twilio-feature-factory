#!/bin/bash
# ABOUTME: Create an evaluation baseline from current events data.
# ABOUTME: Baseline is used by eval-regression.sh to detect metric degradation.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Detect meta-mode for correct log path
if [ -d "$PROJECT_ROOT/.meta" ]; then
    EVAL_DIR="$PROJECT_ROOT/.meta/logs/evaluations"
    EVENTS_FILE="$PROJECT_ROOT/.meta/logs/events.jsonl"
else
    EVAL_DIR="$PROJECT_ROOT/.claude/logs/evaluations"
    EVENTS_FILE="$PROJECT_ROOT/.claude/logs/events.jsonl"
fi

mkdir -p "$EVAL_DIR"
BASELINE_FILE="$EVAL_DIR/baseline.json"

if [ ! -f "$EVENTS_FILE" ]; then
    echo "No events file found. Run some Claude Code sessions to generate data first."
    exit 1
fi

EVENT_COUNT=$(wc -l < "$EVENTS_FILE" | tr -d ' ')
if [ "$EVENT_COUNT" -lt 5 ]; then
    echo "Only $EVENT_COUNT events recorded. Need more data for a meaningful baseline."
    echo "Keep working and re-run this after a few sessions."
    exit 1
fi

# Check for existing baseline
if [ -f "$BASELINE_FILE" ]; then
    EXISTING_DATE=$(jq -r '.created_at // "unknown"' "$BASELINE_FILE")
    echo "Existing baseline found (created: $EXISTING_DATE)"
    echo -n "Overwrite? [y/N] "
    read -r CONFIRM
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
        echo "Keeping existing baseline."
        exit 0
    fi
    # Archive old baseline
    cp "$BASELINE_FILE" "$EVAL_DIR/baseline-$(date +%Y%m%d-%H%M%S).json"
fi

# Generate baseline metrics
jq -sr '
  {
    created_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
    event_count: length,
    sessions: (map(.session_id) | unique | length),
    event_type_distribution: (group_by(.event_type) | map({key: .[0].event_type, value: length}) | from_entries),
    safety: {
      total_checks: ([.[] | select(.event_type == "safety_check")] | length),
      blocked: ([.[] | select(.event_type == "safety_check" and .result == "detected")] | length)
    },
    session_metrics: (
      group_by(.session_id) |
      map({
        session_id: .[0].session_id,
        event_count: length,
        bash_commands: ([.[] | select(.event_type == "bash_command")] | length),
        file_writes: ([.[] | select(.event_type == "file_write")] | length),
        test_runs: ([.[] | select(.event_type == "test_run")] | length),
        deploys: ([.[] | select(.event_type == "deploy")] | length),
        subagents: ([.[] | select(.event_type == "subagent_complete")] | length)
      }) |
      {
        avg_bash_per_session: (map(.bash_commands) | add / length),
        avg_writes_per_session: (map(.file_writes) | add / length),
        avg_tests_per_session: (map(.test_runs) | add / length)
      }
    )
  }
' "$EVENTS_FILE" > "$BASELINE_FILE"

echo "Baseline created: $BASELINE_FILE"
echo ""
jq '.' "$BASELINE_FILE"
