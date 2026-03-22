#!/bin/bash
# ABOUTME: Compare current evaluation metrics against baseline to detect regression.
# ABOUTME: Alerts if key metrics degrade beyond configured thresholds.

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

BASELINE_FILE="$EVAL_DIR/baseline.json"

if [ ! -f "$BASELINE_FILE" ]; then
    echo "No baseline found. Create one first:"
    echo "  ./scripts/eval-baseline.sh"
    exit 1
fi

if [ ! -f "$EVENTS_FILE" ]; then
    echo "No events file found."
    exit 1
fi

echo "Regression Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

BASELINE_DATE=$(jq -r '.created_at' "$BASELINE_FILE")
BASELINE_EVENTS=$(jq -r '.event_count' "$BASELINE_FILE")
CURRENT_EVENTS=$(wc -l < "$EVENTS_FILE" | tr -d ' ')
NEW_EVENTS=$((CURRENT_EVENTS - BASELINE_EVENTS))

echo "Baseline: $BASELINE_DATE ($BASELINE_EVENTS events)"
echo "Current:  $CURRENT_EVENTS events ($NEW_EVENTS new since baseline)"
echo ""

if [ "$NEW_EVENTS" -lt 5 ]; then
    echo "Only $NEW_EVENTS new events since baseline. Need more data for comparison."
    exit 0
fi

# Compare current metrics against baseline
jq -sr --slurpfile baseline "$BASELINE_FILE" '
  # Current metrics (all events)
  . as $all |
  ($all | map(.session_id) | unique | length) as $cur_sessions |
  ([$all[] | select(.event_type == "bash_command")] | length) as $cur_bash |
  ([$all[] | select(.event_type == "file_write")] | length) as $cur_writes |
  ([$all[] | select(.event_type == "test_run")] | length) as $cur_tests |
  ([$all[] | select(.event_type == "safety_check" and .result == "detected")] | length) as $cur_safety_blocks |

  # Baseline metrics
  $baseline[0] as $base |
  ($base.sessions // 1) as $base_sessions |
  ($base.session_metrics.avg_bash_per_session // 0) as $base_avg_bash |
  ($base.session_metrics.avg_writes_per_session // 0) as $base_avg_writes |
  ($base.session_metrics.avg_tests_per_session // 0) as $base_avg_tests |
  ($base.safety.blocked // 0) as $base_safety_blocks |

  # Current per-session averages
  ($cur_bash / (if $cur_sessions > 0 then $cur_sessions else 1 end)) as $cur_avg_bash |
  ($cur_writes / (if $cur_sessions > 0 then $cur_sessions else 1 end)) as $cur_avg_writes |
  ($cur_tests / (if $cur_sessions > 0 then $cur_sessions else 1 end)) as $cur_avg_tests |

  # Build comparison report
  {
    sessions: {baseline: $base_sessions, current: $cur_sessions},
    avg_bash_per_session: {
      baseline: ($base_avg_bash | . * 10 | round / 10),
      current: ($cur_avg_bash | . * 10 | round / 10),
      change_pct: (if $base_avg_bash > 0 then ((($cur_avg_bash - $base_avg_bash) / $base_avg_bash * 100) | . * 10 | round / 10) else null end)
    },
    avg_writes_per_session: {
      baseline: ($base_avg_writes | . * 10 | round / 10),
      current: ($cur_avg_writes | . * 10 | round / 10),
      change_pct: (if $base_avg_writes > 0 then ((($cur_avg_writes - $base_avg_writes) / $base_avg_writes * 100) | . * 10 | round / 10) else null end)
    },
    avg_tests_per_session: {
      baseline: ($base_avg_tests | . * 10 | round / 10),
      current: ($cur_avg_tests | . * 10 | round / 10),
      change_pct: (if $base_avg_tests > 0 then ((($cur_avg_tests - $base_avg_tests) / $base_avg_tests * 100) | . * 10 | round / 10) else null end)
    },
    safety_blocks: {baseline: $base_safety_blocks, current: $cur_safety_blocks}
  }
' "$EVENTS_FILE"

echo ""
echo "Interpretation:"
echo "  - Bash commands per session: Higher may indicate more iteration (potential regression)"
echo "  - File writes per session: Baseline for output volume"
echo "  - Tests per session: Higher is generally better (more validation)"
echo "  - Safety blocks: Any increase means injection patterns were detected"
