#!/bin/bash
# ABOUTME: Orchestrates sequential validation runs for regression testing.
# ABOUTME: Runs fast checks in parallel, then headless validation lanes one at a time.

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# Defaults
MODE="quick"  # quick | standard | full
SKIP_PREFLIGHT=false

usage() {
    cat <<'USAGE'
Usage: run-regression.sh [OPTIONS]

Run regression validation suite after significant codebase changes.
All headless lanes run SEQUENTIALLY to avoid API rate limit exhaustion.

Modes:
  --quick      Phase 1 only: parallel fast checks (~5 min, no LLM)
  --standard   Phase 1 + 6 sequential headless suites (~4-5 hours)
               Order: sequential → nonvoice → dogfood → smoke → uber → chaos
  --full       Phase 1 + preflight + SIP Lab + all 6 suites (~5-6 hours)

Options:
  --skip-preflight  Skip preflight in --full mode (if already deployed)
  --help            Show this help message

Environment:
  CLAUDE_HEADLESS_ACKNOWLEDGED=true  Required for --standard and --full

IMPORTANT: Do NOT run this from inside a Claude Code session.
           claude -p cannot launch nested inside Claude Code.
           Run from a regular terminal instead.

Examples:
  ./scripts/run-regression.sh --quick
  CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-regression.sh --standard
  CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-regression.sh --full
USAGE
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --quick)          MODE="quick"; shift ;;
        --standard)       MODE="standard"; shift ;;
        --full)           MODE="full"; shift ;;
        --skip-preflight) SKIP_PREFLIGHT=true; shift ;;
        --help)           usage; exit 0 ;;
        *)
            echo -e "${RED}Error: Unknown option: $1${NC}" >&2
            usage
            exit 1
            ;;
    esac
done

# --- Validation ---

if [ ! -f "package.json" ] || [ ! -d ".claude" ]; then
    echo -e "${RED}Error: Must be run from the twilio-feature-factory root directory${NC}" >&2
    exit 1
fi

# Guard against nested Claude Code sessions
if [ -n "${CLAUDECODE:-}" ]; then
    echo -e "${RED}Error: Cannot run headless validation from inside a Claude Code session.${NC}" >&2
    echo -e "${DIM}claude -p detects the CLAUDECODE env var and refuses to start.${NC}" >&2
    echo -e "${DIM}Run this script from a regular terminal instead.${NC}" >&2
    exit 1
fi

if [ "$MODE" != "quick" ]; then
    if [ "$CLAUDE_HEADLESS_ACKNOWLEDGED" != "true" ]; then
        echo -e "${RED}Error: CLAUDE_HEADLESS_ACKNOWLEDGED=true is required for --${MODE} mode.${NC}" >&2
        exit 1
    fi
    if ! command -v claude &> /dev/null; then
        echo -e "${RED}Error: 'claude' command not found. Required for headless validation.${NC}" >&2
        exit 1
    fi
fi

# --- Setup ---

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
REPORT_DIR="$(pwd)/.meta/regression-reports/${TIMESTAMP}"
mkdir -p "$REPORT_DIR"

REPORT_DIR_DISPLAY=".meta/regression-reports/${TIMESTAMP}"

echo -e "${BOLD}Regression Validation Suite${NC}"
echo -e "${DIM}Mode: ${MODE} | Report: ${REPORT_DIR_DISPLAY}${NC}"
echo ""

# Track overall start time
START_TIME=$(date +%s)

# ============================================================================
# PHASE 1: Parallel Fast Checks (no LLM, safe to parallelize)
# ============================================================================

echo -e "${CYAN}Phase 1: Parallel Fast Checks${NC}"

run_check() {
    local name="$1"
    local cmd="$2"
    local log_file="${REPORT_DIR}/phase1-${name}.log"
    local exit_file="${REPORT_DIR}/phase1-${name}.exit"

    local rc=0
    eval "$cmd" > "$log_file" 2>&1 || rc=$?
    echo "$rc" > "$exit_file"
}

# Launch all fast checks in background (no LLM calls, safe to parallelize)
run_check "unit-tests"      "npm test -- --bail"                                        &
run_check "lint"             "npm run lint"                                               &
run_check "typecheck"        "cd agents/mcp-servers/twilio && npx tsc --noEmit"          &
run_check "doc-drift"        "./scripts/check-claude-doc-drift.sh"                        &
run_check "meta-separation"  "./.meta/scripts/validate-meta-separation.sh"                 &

# Newman E2E — may not be available in all environments
if [ -f "postman/collection.json" ] || command -v newman &> /dev/null 2>&1; then
    run_check "e2e-newman" "npm run test:e2e" &
fi

# Shipping readiness — may not exist in all clones
if [ -f ".meta/scripts/verify-shipping-ready.sh" ]; then
    run_check "shipping-ready" "./.meta/scripts/verify-shipping-ready.sh" &
fi

# README drift
if [ -f "scripts/check-readme-drift.sh" ]; then
    run_check "readme-drift" "./scripts/check-readme-drift.sh" &
fi

# Wait for all Phase 1 checks
wait

# Collect Phase 1 results
PHASE1_PASS=0
PHASE1_FAIL=0
PHASE1_RESULTS=""

for exit_file in "${REPORT_DIR}"/phase1-*.exit; do
    [ -f "$exit_file" ] || continue
    name=$(basename "$exit_file" .exit | sed 's/phase1-//')
    exit_code=$(cat "$exit_file")
    if [ "$exit_code" = "0" ]; then
        PHASE1_RESULTS="${PHASE1_RESULTS}  ${GREEN}PASS${NC}  ${name}\n"
        PHASE1_PASS=$((PHASE1_PASS + 1))
    else
        PHASE1_RESULTS="${PHASE1_RESULTS}  ${RED}FAIL${NC}  ${name} (exit ${exit_code})\n"
        PHASE1_FAIL=$((PHASE1_FAIL + 1))
    fi
done

echo -e "\n${BOLD}Phase 1 Results:${NC}"
echo -e "$PHASE1_RESULTS"

if [ $PHASE1_FAIL -gt 0 ]; then
    echo -e "${YELLOW}Warning: ${PHASE1_FAIL} fast check(s) failed. Continuing anyway.${NC}"
fi

# ============================================================================
# PHASE 2: Sequential Headless Validation Lanes (ONE AT A TIME)
# ============================================================================
#
# All headless lanes run sequentially to avoid API rate limit exhaustion.
# Each lane is a separate claude -p session that consumes API quota.
# Running them in parallel causes empty responses and wasted turns.
#
# Order: sequential → nonvoice → dogfood → smoke → uber → chaos
# This order front-loads the most valuable (voice) and fastest (nonvoice)
# suites, then runs progressively less critical ones.

if [ "$MODE" = "quick" ]; then
    echo -e "${DIM}Skipping headless validation (--quick mode).${NC}"
else
    echo -e "${CYAN}Phase 2: Sequential Headless Validation${NC}"
    echo -e "${DIM}Lanes run one at a time to stay within API rate limits.${NC}"
    echo ""

    HEADLESS_SCRIPT="./scripts/run-headless.sh"

    # --- Preflight (full mode only) ---
    if [ "$MODE" = "full" ] && [ "$SKIP_PREFLIGHT" = "false" ]; then
        echo -e "  ${DIM}Preflight: deploy + ngrok + agents + SIP Lab...${NC}"
        if [ -f "scripts/headless-preflight.sh" ]; then
            ./scripts/headless-preflight.sh --sip-lab > "${REPORT_DIR}/preflight.log" 2>&1 || true
            if [ -f ".env" ]; then set -a; source .env; set +a; fi
        fi
        echo ""
    fi

    # Helper: run a single headless lane and capture timing
    run_lane() {
        local lane_name="$1"
        local task_name="$2"
        local max_turns="$3"
        local lane_start exit_code lane_end lane_dur

        lane_start=$(date +%s)
        echo -e "  ${CYAN}[$lane_name]${NC} Starting (${max_turns} turns max)... $(date +%H:%M:%S)"

        exit_code=0
        REGRESSION_REPORT_DIR="$REPORT_DIR" \
            $HEADLESS_SCRIPT --task "$task_name" --max-turns "$max_turns" \
            > "${REPORT_DIR}/lane-${lane_name}.log" 2>&1 || exit_code=$?
        echo "$exit_code" > "${REPORT_DIR}/lane-${lane_name}.exit"

        lane_end=$(date +%s)
        lane_dur=$(( (lane_end - lane_start) / 60 ))

        if [ "$exit_code" = "0" ]; then
            echo -e "  ${GREEN}[$lane_name]${NC} Done (${lane_dur}m)"
        else
            echo -e "  ${RED}[$lane_name]${NC} Failed (exit ${exit_code}, ${lane_dur}m)"
        fi
    }

    # Helper: run a non-headless command as a lane
    run_script_lane() {
        local lane_name="$1"
        local cmd="$2"
        local lane_start exit_code lane_end lane_dur

        lane_start=$(date +%s)
        echo -e "  ${CYAN}[$lane_name]${NC} Starting... $(date +%H:%M:%S)"

        exit_code=0
        eval "$cmd" > "${REPORT_DIR}/lane-${lane_name}.log" 2>&1 || exit_code=$?
        echo "$exit_code" > "${REPORT_DIR}/lane-${lane_name}.exit"

        lane_end=$(date +%s)
        lane_dur=$(( (lane_end - lane_start) / 60 ))

        if [ "$exit_code" = "0" ]; then
            echo -e "  ${GREEN}[$lane_name]${NC} Done (${lane_dur}m)"
        else
            echo -e "  ${RED}[$lane_name]${NC} Failed (exit ${exit_code}, ${lane_dur}m)"
        fi
    }

    # === Lane 1: Sequential Voice Validation (UC1-UC10) ===
    run_lane "sequential" "sequential-validation" 250

    # === Lane 2: Nonvoice Validation (SMS, Verify, Sync, TaskRouter, Video) ===
    run_lane "nonvoice" "nonvoice-only" 120

    # === Lane 3: Dogfood Environment ===
    run_script_lane "dogfood" "./scripts/dogfood-env.sh"

    # === Lane 4: Smoke Test (Feature Factory autonomous) ===
    if [ -f ".meta/scripts/smoke-test-ff.sh" ]; then
        # Smoke test needs clean git tree — stash and restore
        STASH_NEEDED=false
        DIRTY=$(git status --porcelain 2>/dev/null | grep -v '^ *?.* \.meta/' | wc -l | tr -d ' ')
        if [ "$DIRTY" -gt 0 ]; then
            STASH_NEEDED=true
            git stash --include-untracked -m "regression-suite-smoke-test" 2>/dev/null || true
        fi

        run_script_lane "smoke" "bash .meta/scripts/smoke-test-ff.sh --no-tee 1"

        if [ "$STASH_NEEDED" = "true" ]; then
            git stash pop 2>/dev/null || true
        fi
    else
        echo -e "  ${DIM}[smoke] Skipped — .meta/scripts/smoke-test-ff.sh not found${NC}"
    fi

    # === Lane 5: Uber-Validation ===
    run_lane "uber" "uber-validation" 120

    # === Lane 6: Chaos Validation ===
    run_lane "chaos" "chaos-only" 60

    # === Lane E: SIP Lab E2E (pure Jest, no headless claude — fast) ===
    if [ "$MODE" = "full" ] && [ -f "scripts/run-sip-lab-e2e.sh" ]; then
        run_script_lane "sip-lab" "./scripts/run-sip-lab-e2e.sh"
    fi

    # Collect Phase 2 results
    PHASE2_RESULTS=""
    for exit_file in "${REPORT_DIR}"/lane-*.exit; do
        [ -f "$exit_file" ] || continue
        lane=$(basename "$exit_file" .exit | sed 's/lane-//')
        exit_code=$(cat "$exit_file")

        # Check for JSON results file (written by headless tasks)
        json_result=""
        case "$lane" in
            sequential) json_result="${REPORT_DIR}/sequential-results.json" ;;
            nonvoice)   json_result="${REPORT_DIR}/nonvoice-results.json" ;;
            chaos)      json_result="${REPORT_DIR}/chaos-results.json" ;;
            uber)       json_result="${REPORT_DIR}/uber-results.json" ;;
            sip-lab)    json_result="${REPORT_DIR}/sip-lab-results.json" ;;
        esac

        if [ -n "$json_result" ] && [ -f "$json_result" ]; then
            PHASE2_RESULTS="${PHASE2_RESULTS}  ${GREEN}DONE${NC}  ${lane} (results captured)\n"
        elif [ "$exit_code" = "0" ]; then
            PHASE2_RESULTS="${PHASE2_RESULTS}  ${YELLOW}DONE${NC}  ${lane} (no JSON results)\n"
        else
            PHASE2_RESULTS="${PHASE2_RESULTS}  ${RED}FAIL${NC}  ${lane} (exit ${exit_code})\n"
        fi
    done

    if [ -n "$PHASE2_RESULTS" ]; then
        echo -e "\n${BOLD}Phase 2 Results:${NC}"
        echo -e "$PHASE2_RESULTS"
    fi
fi

# ============================================================================
# PHASE 3: Report Consolidation
# ============================================================================

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
DURATION_MIN=$((DURATION / 60))
DURATION_SEC=$((DURATION % 60))

# Consolidate learnings from headless lanes into the documentation flywheel
LEARNINGS_COUNT=0
LEARNINGS_TARGET=""
if [ -d ".meta" ]; then
    LEARNINGS_TARGET=".meta/learnings.md"
else
    LEARNINGS_TARGET=".claude/learnings.md"
fi

LEARNINGS_FOUND=false
for learnings_file in "${REPORT_DIR}"/*-learnings.md; do
    [ -f "$learnings_file" ] || continue
    LEARNINGS_FOUND=true
    break
done

if [ "$LEARNINGS_FOUND" = true ] && [ -f "$LEARNINGS_TARGET" ]; then
    # Build a consolidated learnings entry
    CONSOLIDATED="${REPORT_DIR}/consolidated-learnings.md"
    {
        echo ""
        echo "## [$(date +%Y-%m-%d)] Regression Validation (${MODE} mode)"
        echo ""
        echo "**Auto-captured from headless validation lanes.** Report: ${REPORT_DIR_DISPLAY}/"
        echo ""

        for learnings_file in "${REPORT_DIR}"/*-learnings.md; do
            [ -f "$learnings_file" ] || continue
            cat "$learnings_file"
            echo ""
            LEARNINGS_COUNT=$((LEARNINGS_COUNT + 1))
        done

        # Also extract recommendations from JSON results files
        for json_file in "${REPORT_DIR}"/*-results.json; do
            [ -f "$json_file" ] || continue
            recs=$(python3 -c "
import json, sys
try:
    with open('$json_file') as f:
        data = json.load(f)
    recs = data.get('recommendations', [])
    if recs:
        name = '$json_file'.split('/')[-1].replace('-results.json', '')
        print(f'**{name} recommendations:**')
        for r in recs:
            print(f'- {r}')
except: pass
" 2>/dev/null)
            if [ -n "$recs" ]; then
                echo "$recs"
                echo ""
            fi
        done
    } > "$CONSOLIDATED"

    # Append to learnings file (after the header, before existing entries)
    FIRST_ENTRY=$(grep -n "^## \[" "$LEARNINGS_TARGET" | head -1 | cut -d: -f1)
    if [ -n "$FIRST_ENTRY" ]; then
        head -n $((FIRST_ENTRY - 1)) "$LEARNINGS_TARGET" > "${LEARNINGS_TARGET}.tmp"
        cat "$CONSOLIDATED" >> "${LEARNINGS_TARGET}.tmp"
        tail -n +${FIRST_ENTRY} "$LEARNINGS_TARGET" >> "${LEARNINGS_TARGET}.tmp"
        mv "${LEARNINGS_TARGET}.tmp" "$LEARNINGS_TARGET"
    else
        cat "$CONSOLIDATED" >> "$LEARNINGS_TARGET"
    fi
    echo -e "  ${GREEN}Learnings${NC}: ${LEARNINGS_COUNT} lane(s) captured → ${LEARNINGS_TARGET}"
fi

# Generate summary report
SUMMARY_FILE="${REPORT_DIR}/summary.md"
{
    echo "# Regression Validation Report"
    echo ""
    echo "**Date**: $(date -Iseconds)"
    echo "**Mode**: ${MODE}"
    echo "**Duration**: ${DURATION_MIN}m ${DURATION_SEC}s"
    echo ""
    echo "## Phase 1: Fast Checks"
    echo ""
    echo "| Check | Status |"
    echo "|-------|--------|"

    for exit_file in "${REPORT_DIR}"/phase1-*.exit; do
        [ -f "$exit_file" ] || continue
        name=$(basename "$exit_file" .exit | sed 's/phase1-//')
        exit_code=$(cat "$exit_file")
        if [ "$exit_code" = "0" ]; then
            echo "| ${name} | PASS |"
        else
            echo "| ${name} | FAIL (exit ${exit_code}) |"
        fi
    done

    if [ "$MODE" != "quick" ]; then
        echo ""
        echo "## Phase 2: Headless Validation (Sequential)"
        echo ""
        echo "| Lane | Status | Results File |"
        echo "|------|--------|-------------|"

        for exit_file in "${REPORT_DIR}"/lane-*.exit; do
            [ -f "$exit_file" ] || continue
            lane=$(basename "$exit_file" .exit | sed 's/lane-//')
            exit_code=$(cat "$exit_file")
            json_result=""
            case "$lane" in
                sequential) json_result="sequential-results.json" ;;
                nonvoice)   json_result="nonvoice-results.json" ;;
                chaos)      json_result="chaos-results.json" ;;
                uber)       json_result="uber-results.json" ;;
                sip-lab)    json_result="sip-lab-results.json" ;;
            esac
            has_json="No"
            [ -n "$json_result" ] && [ -f "${REPORT_DIR}/${json_result}" ] && has_json="Yes"
            if [ "$exit_code" = "0" ]; then
                echo "| ${lane} | DONE | ${has_json} |"
            else
                echo "| ${lane} | FAIL (exit ${exit_code}) | ${has_json} |"
            fi
        done
    fi

    echo ""
    echo "## Summary"
    echo ""
    echo "- Phase 1: ${PHASE1_PASS} passed, ${PHASE1_FAIL} failed"
    if [ "$MODE" != "quick" ]; then
        lane_count=$(ls "${REPORT_DIR}"/lane-*.exit 2>/dev/null | wc -l | tr -d ' ')
        echo "- Phase 2: ${lane_count} lane(s) completed"
    fi
    echo "- Duration: ${DURATION_MIN}m ${DURATION_SEC}s"
    echo "- Report: ${REPORT_DIR_DISPLAY}/"

} > "$SUMMARY_FILE"

# Print final summary
echo -e "${BOLD}=====================================${NC}"
echo -e "${BOLD}Regression Validation Complete${NC}"
echo -e "${BOLD}=====================================${NC}"
echo ""
echo -e "  Mode:     ${MODE}"
echo -e "  Duration: ${DURATION_MIN}m ${DURATION_SEC}s"
echo -e "  Phase 1:  ${GREEN}${PHASE1_PASS} passed${NC}, ${RED}${PHASE1_FAIL} failed${NC}"

if [ "$MODE" != "quick" ]; then
    lane_count=$(ls "${REPORT_DIR}"/lane-*.exit 2>/dev/null | wc -l | tr -d ' ')
    echo -e "  Phase 2:  ${lane_count} lane(s) completed"
fi

echo -e "  Report:   ${REPORT_DIR_DISPLAY}/summary.md"
echo ""

# Exit with failure if any Phase 1 check failed
if [ $PHASE1_FAIL -gt 0 ]; then
    exit 1
fi

exit 0
