#!/bin/bash
# ABOUTME: Orchestrates parallel and serial validation runs for regression testing.
# ABOUTME: Runs safe-to-parallelize checks first, then headless validation lanes.

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
MODE="quick"  # quick | standard | full | serial

usage() {
    cat <<'USAGE'
Usage: run-regression.sh [OPTIONS]

Run regression validation suite after significant codebase changes.

Modes:
  --quick      Phase 1 only: parallel fast checks (~5 min, no LLM)
  --standard   Phase 1 + chaos + SIP Lab E2E (~60 min)
  --full       Phase 1 + 5 parallel headless lanes (~3 hours)
               Requires .env.lane-b for resource isolation
  --serial     Phase 1 + headless lanes run sequentially (~5-6 hours)
               No .env.lane-b needed

Options:
  --help       Show this help message

Environment:
  CLAUDE_HEADLESS_ACKNOWLEDGED=true  Required for --standard, --full, --serial

Examples:
  ./scripts/run-regression.sh --quick
  CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-regression.sh --standard
  CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-regression.sh --full
  CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-regression.sh --serial
USAGE
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --quick)    MODE="quick"; shift ;;
        --standard) MODE="standard"; shift ;;
        --full)     MODE="full"; shift ;;
        --serial)   MODE="serial"; shift ;;
        --help)     usage; exit 0 ;;
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

if [ "$MODE" = "full" ] && [ ! -f ".env.lane-b" ]; then
    echo -e "${RED}Error: .env.lane-b not found. Required for --full mode (parallel lane isolation).${NC}" >&2
    echo -e "${DIM}Use --serial instead, or provision Lane B resources first.${NC}" >&2
    exit 1
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
# PHASE 1: Parallel Fast Checks
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

# Launch all fast checks in background
run_check "unit-tests"      "npm test -- --bail"                                        &
run_check "lint"             "npm run lint"                                               &
run_check "typecheck"        "cd agents/mcp-servers/twilio && npx tsc --noEmit"          &
run_check "doc-drift"        "./scripts/check-claude-doc-drift.sh"                        &
run_check "meta-separation"  "./scripts/validate-meta-separation.sh"                      &

# Newman E2E — may not be available in all environments
if [ -f "postman/collection.json" ] || command -v newman &> /dev/null 2>&1; then
    run_check "e2e-newman" "npm run test:e2e" &
fi

# Shipping readiness — may not exist in all clones
if [ -f "scripts/verify-shipping-ready.sh" ]; then
    run_check "shipping-ready" "./scripts/verify-shipping-ready.sh" &
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
# PHASE 2: Headless Validation Lanes
# ============================================================================

if [ "$MODE" = "quick" ]; then
    echo -e "${DIM}Skipping headless validation (--quick mode).${NC}"
else
    echo -e "${CYAN}Phase 2: Headless Validation${NC}"

    HEADLESS_SCRIPT="./scripts/run-headless.sh"

    case "$MODE" in
        standard)
            # Chaos + SIP Lab E2E (lightweight, no headless claude for SIP Lab)
            echo -e "  ${DIM}Lane C: Chaos validation (60 turns)${NC}"
            REGRESSION_REPORT_DIR="$REPORT_DIR" \
                $HEADLESS_SCRIPT --task chaos-only --max-turns 60 \
                > "${REPORT_DIR}/lane-c.log" 2>&1
            echo $? > "${REPORT_DIR}/lane-c.exit"

            # Lane E: SIP Lab E2E (pure Jest, no headless claude needed)
            if [ -f "scripts/run-sip-lab-e2e.sh" ]; then
                echo -e "  ${DIM}Lane E: SIP Lab E2E (Jest)${NC}"
                ./scripts/run-sip-lab-e2e.sh \
                    > "${REPORT_DIR}/lane-e.log" 2>&1
                echo $? > "${REPORT_DIR}/lane-e.exit"
            fi
            ;;

        full)
            # Run preflight with SIP Lab for voice lanes
            echo -e "  ${DIM}Running preflight (deploy + ngrok + agents + SIP Lab)...${NC}"
            if [ -f "scripts/headless-preflight.sh" ]; then
                ./scripts/headless-preflight.sh --sip-lab > "${REPORT_DIR}/preflight.log" 2>&1 || true
                # Re-source env to pick up preflight exports
                if [ -f ".env" ]; then set -a; source .env; set +a; fi
            fi

            # Five parallel lanes with resource isolation
            echo -e "  ${DIM}Lane A: Random voice validation (120 turns)${NC}"
            echo -e "  ${DIM}Lane B: Nonvoice validation (120 turns)${NC}"
            echo -e "  ${DIM}Lane C: Chaos validation (60 turns)${NC}"
            echo -e "  ${DIM}Lane D: Sequential voice UC1-UC10 (250 turns)${NC}"
            echo -e "  ${DIM}Lane E: SIP Lab E2E (Jest)${NC}"
            echo ""

            # Lane A: voice/random on default .env resources
            REGRESSION_REPORT_DIR="$REPORT_DIR" \
                $HEADLESS_SCRIPT --task random-validation --max-turns 120 \
                > "${REPORT_DIR}/lane-a.log" 2>&1 &
            LANE_A_PID=$!

            # Lane B: nonvoice on .env.lane-b resources
            REGRESSION_REPORT_DIR="$REPORT_DIR" \
                $HEADLESS_SCRIPT --task nonvoice-only --env-file .env.lane-b --max-turns 120 \
                > "${REPORT_DIR}/lane-b.log" 2>&1 &
            LANE_B_PID=$!

            # Lane C: chaos (no Twilio resources)
            REGRESSION_REPORT_DIR="$REPORT_DIR" \
                $HEADLESS_SCRIPT --task chaos-only --max-turns 60 \
                > "${REPORT_DIR}/lane-c.log" 2>&1 &
            LANE_C_PID=$!

            # Lane D: sequential voice UC1-UC10 (preflight already ran)
            REGRESSION_REPORT_DIR="$REPORT_DIR" \
                $HEADLESS_SCRIPT --task sequential-validation --max-turns 250 \
                > "${REPORT_DIR}/lane-d.log" 2>&1 &
            LANE_D_PID=$!

            # Lane E: SIP Lab E2E (pure Jest, no headless claude)
            if [ -f "scripts/run-sip-lab-e2e.sh" ]; then
                ./scripts/run-sip-lab-e2e.sh \
                    > "${REPORT_DIR}/lane-e.log" 2>&1 &
                LANE_E_PID=$!
            fi

            # Wait for all lanes
            echo -e "${DIM}Waiting for all lanes to complete...${NC}"
            wait $LANE_A_PID 2>/dev/null; echo $? > "${REPORT_DIR}/lane-a.exit"
            wait $LANE_B_PID 2>/dev/null; echo $? > "${REPORT_DIR}/lane-b.exit"
            wait $LANE_C_PID 2>/dev/null; echo $? > "${REPORT_DIR}/lane-c.exit"
            wait $LANE_D_PID 2>/dev/null; echo $? > "${REPORT_DIR}/lane-d.exit"
            if [ -n "${LANE_E_PID:-}" ]; then
                wait $LANE_E_PID 2>/dev/null; echo $? > "${REPORT_DIR}/lane-e.exit"
            fi
            ;;

        serial)
            # Run preflight with SIP Lab
            echo -e "  ${DIM}Running preflight (deploy + ngrok + agents + SIP Lab)...${NC}"
            if [ -f "scripts/headless-preflight.sh" ]; then
                ./scripts/headless-preflight.sh --sip-lab > "${REPORT_DIR}/preflight.log" 2>&1 || true
                if [ -f ".env" ]; then set -a; source .env; set +a; fi
            fi

            # Sequential — no lane-b needed
            echo -e "  ${DIM}Lane C: Chaos validation (60 turns)${NC}"
            REGRESSION_REPORT_DIR="$REPORT_DIR" \
                $HEADLESS_SCRIPT --task chaos-only --max-turns 60 \
                > "${REPORT_DIR}/lane-c.log" 2>&1
            echo $? > "${REPORT_DIR}/lane-c.exit"

            # Lane E: SIP Lab E2E (lightweight, run early)
            if [ -f "scripts/run-sip-lab-e2e.sh" ]; then
                echo -e "  ${DIM}Lane E: SIP Lab E2E (Jest)${NC}"
                ./scripts/run-sip-lab-e2e.sh \
                    > "${REPORT_DIR}/lane-e.log" 2>&1
                echo $? > "${REPORT_DIR}/lane-e.exit"
            fi

            echo -e "  ${DIM}Lane B: Nonvoice validation (120 turns)${NC}"
            REGRESSION_REPORT_DIR="$REPORT_DIR" \
                $HEADLESS_SCRIPT --task nonvoice-only --max-turns 120 \
                > "${REPORT_DIR}/lane-b.log" 2>&1
            echo $? > "${REPORT_DIR}/lane-b.exit"

            echo -e "  ${DIM}Lane A: Random voice validation (120 turns)${NC}"
            REGRESSION_REPORT_DIR="$REPORT_DIR" \
                $HEADLESS_SCRIPT --task random-validation --max-turns 120 \
                > "${REPORT_DIR}/lane-a.log" 2>&1
            echo $? > "${REPORT_DIR}/lane-a.exit"

            echo -e "  ${DIM}Lane D: Sequential voice UC1-UC10 (250 turns)${NC}"
            REGRESSION_REPORT_DIR="$REPORT_DIR" \
                $HEADLESS_SCRIPT --task sequential-validation --max-turns 250 \
                > "${REPORT_DIR}/lane-d.log" 2>&1
            echo $? > "${REPORT_DIR}/lane-d.exit"
            ;;
    esac

    # Collect Phase 2 results
    PHASE2_RESULTS=""
    for exit_file in "${REPORT_DIR}"/lane-*.exit; do
        [ -f "$exit_file" ] || continue
        lane=$(basename "$exit_file" .exit)
        exit_code=$(cat "$exit_file")

        # Check for JSON results file (written by headless tasks)
        json_result=""
        case "$lane" in
            lane-a) json_result="${REPORT_DIR}/voice-results.json" ;;
            lane-b) json_result="${REPORT_DIR}/nonvoice-results.json" ;;
            lane-c) json_result="${REPORT_DIR}/chaos-results.json" ;;
            lane-d) json_result="${REPORT_DIR}/sequential-results.json" ;;
            lane-e) json_result="${REPORT_DIR}/sip-lab-results.json" ;;
        esac

        if [ -f "$json_result" ]; then
            PHASE2_RESULTS="${PHASE2_RESULTS}  ${GREEN}DONE${NC}  ${lane} (results captured)\n"
        elif [ "$exit_code" = "0" ]; then
            PHASE2_RESULTS="${PHASE2_RESULTS}  ${YELLOW}DONE${NC}  ${lane} (no JSON results file)\n"
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
    # Find the line number of the first ## entry
    FIRST_ENTRY=$(grep -n "^## \[" "$LEARNINGS_TARGET" | head -1 | cut -d: -f1)
    if [ -n "$FIRST_ENTRY" ]; then
        # Insert before the first existing entry
        head -n $((FIRST_ENTRY - 1)) "$LEARNINGS_TARGET" > "${LEARNINGS_TARGET}.tmp"
        cat "$CONSOLIDATED" >> "${LEARNINGS_TARGET}.tmp"
        tail -n +${FIRST_ENTRY} "$LEARNINGS_TARGET" >> "${LEARNINGS_TARGET}.tmp"
        mv "${LEARNINGS_TARGET}.tmp" "$LEARNINGS_TARGET"
    else
        # No existing entries, just append
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
        echo "## Phase 2: Headless Validation"
        echo ""
        echo "| Lane | Status | Results File |"
        echo "|------|--------|-------------|"

        for exit_file in "${REPORT_DIR}"/lane-*.exit; do
            [ -f "$exit_file" ] || continue
            lane=$(basename "$exit_file" .exit)
            exit_code=$(cat "$exit_file")
            json_result=""
            case "$lane" in
                lane-a) json_result="voice-results.json" ;;
                lane-b) json_result="nonvoice-results.json" ;;
                lane-c) json_result="chaos-results.json" ;;
                lane-d) json_result="sequential-results.json" ;;
                lane-e) json_result="sip-lab-results.json" ;;
            esac
            has_json="No"
            [ -f "${REPORT_DIR}/${json_result}" ] && has_json="Yes"
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
