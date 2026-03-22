#!/usr/bin/env bash
# ABOUTME: Shows validation score trends from scores.jsonl and flags regressions.
# ABOUTME: Simple terminal output — last N runs, per-label trends, regression alerts.

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -d "$PROJECT_ROOT/.meta/validation-reports/state" ]; then
    SCORES_FILE="$PROJECT_ROOT/.meta/validation-reports/state/scores.jsonl"
else
    SCORES_FILE="$PROJECT_ROOT/.meta/validation-reports/scores.jsonl"
fi

COUNT=20
LABEL_FILTER=""
REGRESSION_THRESHOLD=10

usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Show validation score trends and flag regressions.

Options:
  -n COUNT          Show last N entries (default: 20)
  --label NAME      Filter to a specific label
  --threshold N     Regression threshold in points (default: 10)
  --scores-file F   Override scores.jsonl location
  --summary         Show per-label summary only (latest score + trend)
  -h, --help        Show this help

Examples:
  $0                       # Last 20 scores
  $0 -n 5                  # Last 5 scores
  $0 --label provisioning  # Only provisioning scores
  $0 --summary             # One line per label
EOF
    exit 0
}

SUMMARY=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        -n) COUNT="$2"; shift 2 ;;
        --label) LABEL_FILTER="$2"; shift 2 ;;
        --threshold) REGRESSION_THRESHOLD="$2"; shift 2 ;;
        --scores-file) SCORES_FILE="$2"; shift 2 ;;
        --summary) SUMMARY=true; shift ;;
        -h|--help) usage ;;
        -*) echo "Unknown option: $1" >&2; exit 1 ;;
        *) echo "Unknown argument: $1" >&2; exit 1 ;;
    esac
done

if ! command -v jq >/dev/null 2>&1; then
    echo "Error: jq is required" >&2
    exit 1
fi

if [ ! -f "$SCORES_FILE" ]; then
    echo "No scores found at $SCORES_FILE"
    echo "Run score-validation.sh to generate scores."
    exit 0
fi

TOTAL_RECORDS=$(wc -l < "$SCORES_FILE" | tr -d ' ')
if [ "$TOTAL_RECORDS" -eq 0 ]; then
    echo "No scores recorded yet."
    exit 0
fi

# ─── Summary mode ───────────────────────────────────────────────────────────
if [ "$SUMMARY" = true ]; then
    echo -e "${BOLD}Validation Score Summary${NC}"
    echo -e "${DIM}$(basename "$SCORES_FILE") — $TOTAL_RECORDS total records${NC}"
    echo ""

    # Get unique labels
    LABELS=$(jq -r '.label' "$SCORES_FILE" | sort -u)

    printf "  ${BOLD}%-25s %7s %7s %7s  %s${NC}\n" "Label" "Latest" "Avg" "Count" "Trend"

    while IFS= read -r label; do
        # Get all scores for this label (in order)
        LABEL_SCORES=$(jq -r "select(.label == \"$label\") | .score" "$SCORES_FILE")
        LABEL_COUNT=$(echo "$LABEL_SCORES" | wc -l | tr -d ' ')
        LATEST=$(echo "$LABEL_SCORES" | tail -1)
        AVG=$(echo "$LABEL_SCORES" | awk '{s+=$1} END {printf "%.0f", s/NR}')

        # Trend: compare latest to previous (if exists)
        TREND=""
        if [ "$LABEL_COUNT" -ge 2 ]; then
            PREV=$(echo "$LABEL_SCORES" | tail -2 | head -1)
            DIFF=$((LATEST - PREV))
            if [ "$DIFF" -gt 0 ]; then
                TREND="${GREEN}+${DIFF}${NC}"
            elif [ "$DIFF" -lt 0 ]; then
                if [ "$DIFF" -le "-${REGRESSION_THRESHOLD}" ]; then
                    TREND="${RED}${DIFF} REGRESSION${NC}"
                else
                    TREND="${YELLOW}${DIFF}${NC}"
                fi
            else
                TREND="${DIM}=${NC}"
            fi
        else
            TREND="${DIM}(first)${NC}"
        fi

        # Color the score
        if [ "$LATEST" -ge 90 ]; then
            SCORE_COLOR="$GREEN"
        elif [ "$LATEST" -ge 70 ]; then
            SCORE_COLOR="$YELLOW"
        else
            SCORE_COLOR="$RED"
        fi

        printf "  %-25s ${SCORE_COLOR}%5s${NC}   %5s   %5s  %b\n" "$label" "$LATEST" "$AVG" "$LABEL_COUNT" "$TREND"
    done <<< "$LABELS"

    echo ""
    exit 0
fi

# ─── Detail mode ────────────────────────────────────────────────────────────
echo -e "${BOLD}Validation Score History${NC}"
echo -e "${DIM}$(basename "$SCORES_FILE") — showing last $COUNT of $TOTAL_RECORDS records${NC}"
echo ""

# Apply label filter
if [ -n "$LABEL_FILTER" ]; then
    DATA=$(jq -c "select(.label == \"$LABEL_FILTER\")" "$SCORES_FILE" | tail -n "$COUNT")
    echo -e "${DIM}Filter: label=$LABEL_FILTER${NC}"
else
    DATA=$(tail -n "$COUNT" "$SCORES_FILE")
fi

if [ -z "$DATA" ]; then
    echo "No matching records."
    exit 0
fi

printf "  ${BOLD}%-22s %-20s %7s %12s %s${NC}\n" "Timestamp" "Label" "Score" "Checks" "Status"

PREV_SCORES=()
REGRESSIONS=0

while IFS= read -r line; do
    TS=$(echo "$line" | jq -r '.timestamp')
    LABEL=$(echo "$line" | jq -r '.label')
    SCORE=$(echo "$line" | jq -r '.score')
    PASSED=$(echo "$line" | jq -r '.passed')
    TOTAL=$(echo "$line" | jq -r '.total')

    # Color the score
    if [ "$SCORE" -ge 90 ]; then
        SCORE_COLOR="$GREEN"
    elif [ "$SCORE" -ge 70 ]; then
        SCORE_COLOR="$YELLOW"
    else
        SCORE_COLOR="$RED"
    fi

    # Check for regression against previous score with same label
    STATUS=""
    for i in "${!PREV_SCORES[@]}"; do
        IFS=: read -r prev_label prev_score <<< "${PREV_SCORES[$i]}"
        if [ "$prev_label" = "$LABEL" ]; then
            DIFF=$((SCORE - prev_score))
            if [ "$DIFF" -le "-${REGRESSION_THRESHOLD}" ]; then
                STATUS="${RED}REGRESSION (${DIFF})${NC}"
                REGRESSIONS=$((REGRESSIONS + 1))
            elif [ "$DIFF" -gt 0 ]; then
                STATUS="${GREEN}+${DIFF}${NC}"
            elif [ "$DIFF" -lt 0 ]; then
                STATUS="${YELLOW}${DIFF}${NC}"
            fi
            # Update the stored score
            PREV_SCORES[$i]="${LABEL}:${SCORE}"
            break
        fi
    done

    # If no previous score found for this label, store it
    if [ -z "$STATUS" ]; then
        PREV_SCORES+=("${LABEL}:${SCORE}")
    fi

    # Truncate timestamp for display
    SHORT_TS="${TS:0:19}"

    printf "  %-22s %-20s ${SCORE_COLOR}%5s${NC}   %4s/%-4s %b\n" "$SHORT_TS" "$LABEL" "$SCORE" "$PASSED" "$TOTAL" "$STATUS"
done <<< "$DATA"

echo ""
if [ "$REGRESSIONS" -gt 0 ]; then
    echo -e "  ${RED}${REGRESSIONS} regression(s) detected (>${REGRESSION_THRESHOLD} point drop)${NC}"
else
    echo -e "  ${GREEN}No regressions detected${NC}"
fi
echo ""
