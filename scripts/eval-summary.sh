#!/bin/bash
# ABOUTME: Aggregate structured events into evaluation metrics.
# ABOUTME: Produces per-session and overall summaries from events.jsonl.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Detect meta-mode for correct log path
if [ -d "$PROJECT_ROOT/.meta" ]; then
    EVENTS_FILE="$PROJECT_ROOT/.meta/logs/events.jsonl"
    EVAL_DIR="$PROJECT_ROOT/.meta/logs/evaluations"
else
    EVENTS_FILE="$PROJECT_ROOT/.claude/logs/events.jsonl"
    EVAL_DIR="$PROJECT_ROOT/.claude/logs/evaluations"
fi

mkdir -p "$EVAL_DIR"

if [ ! -f "$EVENTS_FILE" ]; then
    echo "No events file found. Run some Claude Code sessions first."
    exit 0
fi

# Period filter (default: all time)
PERIOD="${1:-all}"
PERIOD_FILTER=""
if [ "$PERIOD" = "today" ]; then
    PERIOD_FILTER=$(date -u +%Y-%m-%d)
    echo "Evaluation Summary — Today ($PERIOD_FILTER)"
elif [ "$PERIOD" = "week" ]; then
    # Last 7 days
    if [[ "$OSTYPE" == "darwin"* ]]; then
        PERIOD_FILTER=$(date -u -v-7d +%Y-%m-%d)
    else
        PERIOD_FILTER=$(date -u -d '7 days ago' +%Y-%m-%d)
    fi
    echo "Evaluation Summary — Last 7 days (since $PERIOD_FILTER)"
else
    echo "Evaluation Summary — All time"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Build the summary using jq
jq -sr --arg period "$PERIOD_FILTER" '
  # Filter by period if specified
  (if $period != "" then [.[] | select(.timestamp >= $period)] else . end) as $events |

  # Total counts by type
  ($events | group_by(.event_type) | map({key: .[0].event_type, value: length}) | from_entries) as $counts |

  # Session count
  ($events | map(.session_id) | unique | length) as $sessions |

  # Safety checks
  ([$events[] | select(.event_type == "safety_check")] | length) as $safety_total |
  ([$events[] | select(.event_type == "safety_check" and .result == "detected")] | length) as $safety_blocked |

  # Build output
  {
    period: (if $period != "" then $period else "all" end),
    total_events: ($events | length),
    sessions: $sessions,
    event_counts: $counts,
    safety: {
      total_checks: $safety_total,
      blocked: $safety_blocked
    }
  }
' "$EVENTS_FILE" | jq '.'

# Save to evaluations directory
SUMMARY_FILE="$EVAL_DIR/summary-$(date +%Y%m%d-%H%M%S).json"
jq -sr --arg period "$PERIOD_FILTER" '
  (if $period != "" then [.[] | select(.timestamp >= $period)] else . end) as $events |
  ($events | group_by(.event_type) | map({key: .[0].event_type, value: length}) | from_entries) as $counts |
  ($events | map(.session_id) | unique | length) as $sessions |
  ([$events[] | select(.event_type == "safety_check")] | length) as $safety_total |
  ([$events[] | select(.event_type == "safety_check" and .result == "detected")] | length) as $safety_blocked |
  {
    generated_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
    period: (if $period != "" then $period else "all" end),
    total_events: ($events | length),
    sessions: $sessions,
    event_counts: $counts,
    safety: { total_checks: $safety_total, blocked: $safety_blocked }
  }
' "$EVENTS_FILE" > "$SUMMARY_FILE"

echo ""
echo "Summary saved to: $SUMMARY_FILE"
