#!/usr/bin/env bash
# ABOUTME: Scores validation results as 0-100, outputs summary, and appends to scores.jsonl.
# ABOUTME: Accepts MCP ValidationResult JSON (stdin/file) or provisioning PASS/FAIL text.

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

# Default scores file location
if [ -d "$PROJECT_ROOT/.meta/validation-reports/state" ]; then
    SCORES_FILE="$PROJECT_ROOT/.meta/validation-reports/state/scores.jsonl"
else
    SCORES_FILE="$PROJECT_ROOT/.meta/validation-reports/scores.jsonl"
fi

usage() {
    cat <<EOF
Usage: $0 [OPTIONS] [FILE]

Score validation results and append to scores.jsonl.

Input modes:
  FILE              Read JSON from file
  --stdin           Read JSON from stdin (default if no FILE and stdin is piped)
  --provisioning    Parse PASS/FAIL text from provisioning script (stdin or file)

Options:
  --label NAME      Label for this run (e.g., "provisioning", "e2e-deep", "mcp-validate-call")
  --no-save         Print score but don't append to scores.jsonl
  --scores-file F   Override scores.jsonl location
  --json            Output score as JSON instead of human-readable
  -h, --help        Show this help

Examples:
  # Score MCP validation JSON
  echo '{"success":true,"checks":{"a":{"passed":true}}}' | $0 --label mcp-env

  # Score provisioning output
  ./validate-provisioning.sh 2>&1 | $0 --provisioning --label provisioning

  # Score a saved JSON file
  $0 --label e2e results.json
EOF
    exit 0
}

MODE="json"
LABEL=""
SAVE=true
OUTPUT_JSON=false
INPUT_FILE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --provisioning) MODE="provisioning"; shift ;;
        --label) LABEL="$2"; shift 2 ;;
        --no-save) SAVE=false; shift ;;
        --scores-file) SCORES_FILE="$2"; shift 2 ;;
        --json) OUTPUT_JSON=true; shift ;;
        --stdin) shift ;; # explicit stdin, no-op (default behavior)
        -h|--help) usage ;;
        -*) echo "Unknown option: $1" >&2; exit 1 ;;
        *) INPUT_FILE="$1"; shift ;;
    esac
done

# Read input
if [ -n "$INPUT_FILE" ]; then
    INPUT=$(cat "$INPUT_FILE")
elif [ ! -t 0 ]; then
    INPUT=$(cat)
else
    echo "Error: No input provided. Pipe data or specify a file." >&2
    echo "Run $0 --help for usage." >&2
    exit 1
fi

# Require jq
if ! command -v jq >/dev/null 2>&1; then
    echo "Error: jq is required" >&2
    exit 1
fi

# ─── Score MCP ValidationResult JSON ────────────────────────────────────────
score_json() {
    local input="$1"

    # Handle both single objects and arrays of results
    local is_array
    is_array=$(echo "$input" | jq -r 'if type == "array" then "true" else "false" end' 2>/dev/null || echo "false")

    if [ "$is_array" = "true" ]; then
        # Array of results — score each, return aggregate
        local total_passed=0
        local total_checks=0
        local total_errors=0
        local total_warnings=0
        local details="[]"

        while IFS= read -r result; do
            local passed checks errors warnings
            passed=$(echo "$result" | jq '[.checks // {} | to_entries[] | select(.value.passed == true)] | length')
            checks=$(echo "$result" | jq '[.checks // {} | to_entries[]] | length')
            errors=$(echo "$result" | jq '[.errors // [] | .[]] | length')
            warnings=$(echo "$result" | jq '[.warnings // [] | .[]] | length')
            local rsid rtype
            rsid=$(echo "$result" | jq -r '.resourceSid // "unknown"')
            rtype=$(echo "$result" | jq -r '.resourceType // "unknown"')

            total_passed=$((total_passed + passed))
            total_checks=$((total_checks + checks))
            total_errors=$((total_errors + errors))
            total_warnings=$((total_warnings + warnings))

            local item_score=0
            if [ "$checks" -gt 0 ]; then
                item_score=$(( (passed * 100) / checks ))
            fi
            details=$(echo "$details" | jq --arg sid "$rsid" --arg type "$rtype" --argjson score "$item_score" --argjson p "$passed" --argjson c "$checks" \
                '. + [{"resourceSid": $sid, "resourceType": $type, "score": $score, "passed": $p, "total": $c}]')
        done < <(echo "$input" | jq -c '.[]')

        local score=0
        if [ "$total_checks" -gt 0 ]; then
            score=$(( (total_passed * 100) / total_checks ))
        fi

        # Deduct for errors (5 pts each, floor 0)
        local penalty=$((total_errors * 5))
        score=$(( score - penalty ))
        [ "$score" -lt 0 ] && score=0

        echo "$score|$total_passed|$total_checks|$total_errors|$total_warnings"
        return
    fi

    # Single result object
    local passed checks errors warnings
    passed=$(echo "$input" | jq '[.checks // {} | to_entries[] | select(.value.passed == true)] | length')
    checks=$(echo "$input" | jq '[.checks // {} | to_entries[]] | length')
    errors=$(echo "$input" | jq '[.errors // [] | .[]] | length')
    warnings=$(echo "$input" | jq '[.warnings // [] | .[]] | length')

    local score=0
    if [ "$checks" -gt 0 ]; then
        score=$(( (passed * 100) / checks ))
    fi

    # Deduct for errors (5 pts each, floor 0)
    local penalty=$((errors * 5))
    score=$(( score - penalty ))
    [ "$score" -lt 0 ] && score=0

    echo "$score|$passed|$checks|$errors|$warnings"
}

# ─── Score provisioning PASS/FAIL text ──────────────────────────────────────
score_provisioning() {
    local input="$1"

    # Count PASS and FAIL lines (matches the test_result() output format)
    local passed failed
    passed=$(echo "$input" | grep -cE '^\s+PASS ' || echo "0")
    failed=$(echo "$input" | grep -cE '^\s+FAIL ' || echo "0")
    local total=$((passed + failed))

    # Also count skipped
    local skipped
    skipped=$(echo "$input" | grep -c 'skipped' || echo "0")

    local score=0
    if [ "$total" -gt 0 ]; then
        score=$(( (passed * 100) / total ))
    fi

    # Skipped tests deduct 2 pts each (they indicate incomplete coverage)
    local penalty=$((skipped * 2))
    score=$(( score - penalty ))
    [ "$score" -lt 0 ] && score=0

    echo "$score|$passed|$total|$failed|$skipped"
}

# ─── Main ───────────────────────────────────────────────────────────────────

if [ "$MODE" = "provisioning" ]; then
    RESULT=$(score_provisioning "$INPUT")
else
    # Validate it's JSON
    if ! echo "$INPUT" | jq empty 2>/dev/null; then
        echo "Error: Input is not valid JSON" >&2
        exit 1
    fi
    RESULT=$(score_json "$INPUT")
fi

IFS='|' read -r SCORE PASSED TOTAL ERRORS WARNINGS <<< "$RESULT"

# Auto-detect label if not set
if [ -z "$LABEL" ]; then
    if [ "$MODE" = "provisioning" ]; then
        LABEL="provisioning"
    elif [ -n "$INPUT_FILE" ]; then
        LABEL=$(basename "$INPUT_FILE" .json)
    else
        LABEL="validation"
    fi
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ─── Output ─────────────────────────────────────────────────────────────────

if [ "$OUTPUT_JSON" = true ]; then
    jq -n \
        --arg ts "$TIMESTAMP" \
        --arg label "$LABEL" \
        --argjson score "$SCORE" \
        --argjson passed "$PASSED" \
        --argjson total "$TOTAL" \
        --argjson errors "$ERRORS" \
        --argjson warnings "$WARNINGS" \
        --arg mode "$MODE" \
        '{timestamp: $ts, label: $label, score: $score, passed: $passed, total: $total, errors: $errors, warnings: $warnings, mode: $mode}'
else
    # Color the score
    if [ "$SCORE" -ge 90 ]; then
        SCORE_COLOR="$GREEN"
    elif [ "$SCORE" -ge 70 ]; then
        SCORE_COLOR="$YELLOW"
    else
        SCORE_COLOR="$RED"
    fi

    echo -e "${BOLD}Validation Score${NC}"
    echo -e "  Label:    ${CYAN}${LABEL}${NC}"
    echo -e "  Score:    ${SCORE_COLOR}${SCORE}/100${NC}"
    echo -e "  Checks:   ${PASSED}/${TOTAL} passed"
    if [ "$MODE" = "provisioning" ]; then
        echo -e "  Failed:   ${ERRORS}"
        echo -e "  Skipped:  ${WARNINGS}"
    else
        echo -e "  Errors:   ${ERRORS}"
        echo -e "  Warnings: ${WARNINGS}"
    fi
    echo -e "  Time:     ${DIM}${TIMESTAMP}${NC}"
fi

# ─── Save to scores.jsonl ──────────────────────────────────────────────────

if [ "$SAVE" = true ]; then
    mkdir -p "$(dirname "$SCORES_FILE")"

    RECORD=$(jq -cn \
        --arg ts "$TIMESTAMP" \
        --arg label "$LABEL" \
        --argjson score "$SCORE" \
        --argjson passed "$PASSED" \
        --argjson total "$TOTAL" \
        --argjson errors "$ERRORS" \
        --argjson warnings "$WARNINGS" \
        --arg mode "$MODE" \
        '{timestamp: $ts, label: $label, score: $score, passed: $passed, total: $total, errors: $errors, warnings: $warnings, mode: $mode}')

    echo "$RECORD" >> "$SCORES_FILE"

    if [ "$OUTPUT_JSON" != true ]; then
        echo -e "  ${DIM}Saved to $(basename "$SCORES_FILE")${NC}"
    fi
fi
