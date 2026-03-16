#!/usr/bin/env bash
# ABOUTME: Automated test of the post-clone onboarding experience. Simulates a fresh user
# ABOUTME: cloning the repo into /tmp, running setup, and verifying everything works.

set -euo pipefail

# Colors (matches validate-provisioning.sh)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

TIMESTAMP=$(date +%s)
KEEP=false
VERBOSE=false
SMOKE_TEST=false
GIT_CLONE=false

# Parse flags
for arg in "$@"; do
    case "$arg" in
        --keep) KEEP=true ;;
        --verbose) VERBOSE=true ;;
        --smoke-test) SMOKE_TEST=true ;;
        --git-clone) GIT_CLONE=true ;;
        --help|-h)
            echo "Usage: $0 [--keep] [--verbose] [--smoke-test] [--git-clone]"
            echo ""
            echo "Simulates a fresh clone in /tmp and validates the full onboarding flow."
            echo "All work happens in /tmp/fresh-install-TIMESTAMP/ — main repo is untouched."
            echo ""
            echo "  --keep         Don't delete temp dir when done (inspect manually)"
            echo "  --verbose      Show full command output"
            echo "  --smoke-test   Run Phase E: send SMS + make call (requires TEST_PHONE_NUMBER)"
            echo "  --git-clone    Use git clone instead of rsync (slower, but true fresh clone)"
            echo ""
            echo "Required environment variables:"
            echo "  TWILIO_ACCOUNT_SID    Account credentials"
            echo "  TWILIO_AUTH_TOKEN     Account credentials"
            echo ""
            echo "Optional environment variables:"
            echo "  TWILIO_PHONE_NUMBER   Skip phone number provisioning"
            echo "  TEST_PHONE_NUMBER     Required for --smoke-test"
            exit 0
            ;;
    esac
done

PASS=0
FAIL=0
TOTAL=0

test_result() {
    local name="$1"
    local expected="$2"
    local actual="$3"
    TOTAL=$((TOTAL + 1))

    if [ "$expected" = "$actual" ]; then
        echo -e "  ${GREEN}PASS${NC} $name"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $name"
        echo -e "       ${DIM}expected: $expected${NC}"
        echo -e "       ${DIM}actual:   $actual${NC}"
        FAIL=$((FAIL + 1))
    fi
}

# Resolve source repo
SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK_DIR="/tmp/fresh-install-${TIMESTAMP}"

# Cleanup trap
cleanup() {
    if ! $KEEP && [ -d "$WORK_DIR" ]; then
        echo -e "\n${DIM}Cleaning up $WORK_DIR...${NC}"
        rm -rf "$WORK_DIR"
    fi
}
trap cleanup EXIT

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       Fresh Install Validation                            ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${DIM}Source:  $SOURCE_DIR${NC}"
echo -e "${DIM}Target:  $WORK_DIR${NC}"
echo ""

# Pre-flight: check required env vars
if [ -z "${TWILIO_ACCOUNT_SID:-}" ] || [[ "${TWILIO_ACCOUNT_SID:-}" == ACxxxx* ]]; then
    echo -e "${RED}Error: TWILIO_ACCOUNT_SID must be set${NC}"
    echo -e "${DIM}Export it before running: export TWILIO_ACCOUNT_SID=ACxxxxxxxx${NC}"
    exit 1
fi
if [ -z "${TWILIO_AUTH_TOKEN:-}" ] || [ "${TWILIO_AUTH_TOKEN:-}" = "your_auth_token_here" ]; then
    echo -e "${RED}Error: TWILIO_AUTH_TOKEN must be set${NC}"
    exit 1
fi
if $SMOKE_TEST && [ -z "${TEST_PHONE_NUMBER:-}" ]; then
    echo -e "${RED}Error: TEST_PHONE_NUMBER required for --smoke-test${NC}"
    echo -e "${DIM}Export your personal number: export TEST_PHONE_NUMBER=+1XXXXXXXXXX${NC}"
    exit 1
fi

START_TIME=$(date +%s)

# ─────────────────────────────────────────────────────────
# Phase A: Clone/Copy
# ─────────────────────────────────────────────────────────
echo -e "${BOLD}Phase A: Fresh Clone${NC}"
echo ""

mkdir -p "$WORK_DIR"

if $GIT_CLONE; then
    # Get remote URL from source repo
    REMOTE_URL=$(cd "$SOURCE_DIR" && git remote get-url origin 2>/dev/null || echo "")
    if [ -n "$REMOTE_URL" ]; then
        if $VERBOSE; then
            git clone "$REMOTE_URL" "$WORK_DIR/repo" 2>&1
        else
            git clone "$REMOTE_URL" "$WORK_DIR/repo" > /dev/null 2>&1
        fi
        CLONE_OK=$?
    else
        # No remote, fall back to local clone
        if $VERBOSE; then
            git clone "$SOURCE_DIR" "$WORK_DIR/repo" 2>&1
        else
            git clone "$SOURCE_DIR" "$WORK_DIR/repo" > /dev/null 2>&1
        fi
        CLONE_OK=$?
    fi
    test_result "A1: git clone" "0" "$CLONE_OK"
    WORK_DIR="$WORK_DIR/repo"
else
    # rsync (faster, uses working tree)
    if $VERBOSE; then
        rsync -a --exclude='node_modules' --exclude='.env' --exclude='.meta' \
            --exclude='dist' --exclude='coverage' --exclude='.twiliodeployinfo' \
            "$SOURCE_DIR/" "$WORK_DIR/" 2>&1
    else
        rsync -a --exclude='node_modules' --exclude='.env' --exclude='.meta' \
            --exclude='dist' --exclude='coverage' --exclude='.twiliodeployinfo' \
            "$SOURCE_DIR/" "$WORK_DIR/" > /dev/null 2>&1
    fi
    test_result "A1: rsync to /tmp" "0" "$?"
fi

cd "$WORK_DIR"

test_result "A2: package.json exists" "true" "$([ -f package.json ] && echo true || echo false)"
test_result "A3: .env.example exists" "true" "$([ -f .env.example ] && echo true || echo false)"
test_result "A4: .mcp.json exists" "true" "$([ -f .mcp.json ] && echo true || echo false)"
test_result "A5: .envrc exists" "true" "$([ -f .envrc ] && echo true || echo false)"
test_result "A6: bootstrap.sh exists" "true" "$([ -f scripts/bootstrap.sh ] && echo true || echo false)"
test_result "A7: bootstrap.sh executable" "true" "$([ -x scripts/bootstrap.sh ] && echo true || echo false)"

echo ""

# ─────────────────────────────────────────────────────────
# Phase B: npm install
# ─────────────────────────────────────────────────────────
echo -e "${BOLD}Phase B: npm install${NC}"
echo ""

INSTALL_START=$(date +%s)

if $VERBOSE; then
    npm install 2>&1
    INSTALL_EXIT=$?
else
    npm install > /dev/null 2>&1
    INSTALL_EXIT=$?
fi

INSTALL_END=$(date +%s)
INSTALL_DURATION=$((INSTALL_END - INSTALL_START))

test_result "B1: npm install exit code" "0" "$INSTALL_EXIT"
test_result "B2: node_modules/ created" "true" "$([ -d node_modules ] && echo true || echo false)"
test_result "B3: MCP server dist exists" "true" "$([ -f agents/mcp-servers/twilio/dist/serve.js ] && echo true || echo false)"

# Check dist/tools has files (tools were compiled)
TOOL_COUNT=$(find agents/mcp-servers/twilio/dist/tools -name '*.js' 2>/dev/null | wc -l | tr -d ' ')
test_result "B4: MCP tool files compiled (>0)" "true" "$([ "$TOOL_COUNT" -gt 0 ] && echo true || echo false)"

echo -e "  ${DIM}Install duration: ${INSTALL_DURATION}s${NC}"
echo ""

# ─────────────────────────────────────────────────────────
# Phase C: Bootstrap (non-interactive)
# ─────────────────────────────────────────────────────────
echo -e "${BOLD}Phase C: bootstrap.sh --non-interactive --skip-provisioning${NC}"
echo ""

# Set up .env with credentials for non-interactive mode
cp .env.example .env
sed -i '' "s|^TWILIO_ACCOUNT_SID=.*|TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}|" .env
sed -i '' "s|^TWILIO_AUTH_TOKEN=.*|TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}|" .env
if [ -n "${TWILIO_PHONE_NUMBER:-}" ]; then
    sed -i '' "s|^TWILIO_PHONE_NUMBER=.*|TWILIO_PHONE_NUMBER=${TWILIO_PHONE_NUMBER}|" .env
fi

# Export for bootstrap
export TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN
export TWILIO_PHONE_NUMBER="${TWILIO_PHONE_NUMBER:-}"
export TEST_PHONE_NUMBER="${TEST_PHONE_NUMBER:-}"

if $VERBOSE; then
    bash scripts/bootstrap.sh --non-interactive --skip-provisioning 2>&1
    BOOTSTRAP_EXIT=$?
else
    bash scripts/bootstrap.sh --non-interactive --skip-provisioning > /dev/null 2>&1
    BOOTSTRAP_EXIT=$?
fi

test_result "C1: bootstrap.sh exit code" "0" "$BOOTSTRAP_EXIT"
test_result "C2: .env populated" "true" "$([ -f .env ] && echo true || echo false)"

# Verify credentials in .env
SAVED_SID=$(grep "^TWILIO_ACCOUNT_SID=" .env 2>/dev/null | cut -d= -f2)
test_result "C3: SID in .env matches" "$TWILIO_ACCOUNT_SID" "$SAVED_SID"

echo ""

# ─────────────────────────────────────────────────────────
# Phase D: env-doctor
# ─────────────────────────────────────────────────────────
echo -e "${BOLD}Phase D: env-doctor${NC}"
echo ""

# Clear potentially conflicting vars for clean test
unset TWILIO_REGION TWILIO_EDGE TWILIO_API_KEY TWILIO_API_SECRET 2>/dev/null || true

if [ -f "scripts/env-doctor.sh" ]; then
    if $VERBOSE; then
        bash scripts/env-doctor.sh 2>&1
        DOCTOR_EXIT=$?
    else
        bash scripts/env-doctor.sh > /dev/null 2>&1
        DOCTOR_EXIT=$?
    fi
    test_result "D1: env-doctor exit code" "0" "$DOCTOR_EXIT"
else
    test_result "D1: env-doctor.sh exists" "true" "false"
fi

echo ""

# ─────────────────────────────────────────────────────────
# Phase D.5: MCP Server Verification
# ─────────────────────────────────────────────────────────
echo -e "${BOLD}Phase D.5: MCP Server Verification${NC}"
echo ""

# D5.1: verify-mcp.sh exists and is executable
test_result "D5.1: verify-mcp.sh exists" "true" "$([ -f scripts/verify-mcp.sh ] && echo true || echo false)"

# D5.2: verify-mcp.sh passes (server can construct itself)
if [ -f "scripts/verify-mcp.sh" ]; then
    if $VERBOSE; then
        bash scripts/verify-mcp.sh 2>&1
        MCP_EXIT=$?
    else
        bash scripts/verify-mcp.sh > /dev/null 2>&1
        MCP_EXIT=$?
    fi
    test_result "D5.2: MCP server startup check" "0" "$MCP_EXIT"
else
    test_result "D5.2: MCP server startup check" "0" "1"
fi

# D5.3: Critical env vars resolve to non-empty, non-placeholder values
for VAR_NAME in TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN; do
    VAR_VALUE="${!VAR_NAME:-}"
    RESOLVED=$([ -n "$VAR_VALUE" ] && [ "$VAR_VALUE" != "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" ] && [ "$VAR_VALUE" != "your_auth_token_here" ] && echo true || echo false)
    test_result "D5.3: $VAR_NAME resolves in MCP context" "true" "$RESOLVED"
done

echo ""

# ─────────────────────────────────────────────────────────
# Phase D.6: direnv Awareness
# ─────────────────────────────────────────────────────────
echo -e "${BOLD}Phase D.6: direnv Awareness${NC}"
echo ""

test_result "D6.1: .envrc exists" "true" "$([ -f .envrc ] && echo true || echo false)"

if command -v direnv > /dev/null 2>&1; then
    DIRENV_ALLOWED=$(direnv status 2>/dev/null | grep -c "Found RC allowed true" || echo "0")
    test_result "D6.2: direnv allowed" "1" "$DIRENV_ALLOWED"
else
    echo -e "  ${YELLOW}SKIP${NC} D6.2: direnv not installed (expected in CI)"
fi

echo ""

# ─────────────────────────────────────────────────────────
# Phase E: Smoke Test (optional)
# ─────────────────────────────────────────────────────────
if $SMOKE_TEST; then
    echo -e "${BOLD}Phase E: Smoke Test${NC}"
    echo ""

    # E1: API reachable
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
        "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID.json" 2>/dev/null || echo "000")
    test_result "E1: Twilio API reachable" "200" "$HTTP_CODE"

    # E2: Send SMS (if phone number configured)
    PHONE="${TWILIO_PHONE_NUMBER:-}"
    if [ -n "$PHONE" ] && [[ "$PHONE" != +1xxxxxxxxxx* ]]; then
        SMS_RESPONSE=$(curl -s -X POST \
            -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
            "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json" \
            --data-urlencode "To=$TEST_PHONE_NUMBER" \
            --data-urlencode "From=$PHONE" \
            --data-urlencode "Body=Fresh install validation smoke test ($(date +%H:%M:%S))" 2>/dev/null || echo "{}")

        SMS_SID=$(echo "$SMS_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sid',''))" 2>/dev/null || echo "")
        test_result "E2: SMS sent" "true" "$([ -n "$SMS_SID" ] && echo true || echo false)"
        if [ -n "$SMS_SID" ]; then
            echo -e "       ${DIM}SID: $SMS_SID${NC}"
        else
            ERROR_MSG=$(echo "$SMS_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('message','unknown'))" 2>/dev/null || echo "unknown")
            echo -e "       ${DIM}error: $ERROR_MSG${NC}"
        fi

        # E3: Make call
        CALL_RESPONSE=$(curl -s -X POST \
            -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
            "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls.json" \
            --data-urlencode "To=$TEST_PHONE_NUMBER" \
            --data-urlencode "From=$PHONE" \
            --data-urlencode "Twiml=<Response><Say>Fresh install validation complete. Your Feature Factory setup is working.</Say></Response>" 2>/dev/null || echo "{}")

        CALL_SID=$(echo "$CALL_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sid',''))" 2>/dev/null || echo "")
        test_result "E3: Call initiated" "true" "$([ -n "$CALL_SID" ] && echo true || echo false)"
        if [ -n "$CALL_SID" ]; then
            echo -e "       ${DIM}SID: $CALL_SID${NC}"
        else
            ERROR_MSG=$(echo "$CALL_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('message','unknown'))" 2>/dev/null || echo "unknown")
            echo -e "       ${DIM}error: $ERROR_MSG${NC}"
        fi
    else
        test_result "E2: SMS sent" "true" "false"
        echo -e "       ${DIM}TWILIO_PHONE_NUMBER not configured${NC}"
        test_result "E3: Call initiated" "true" "false"
    fi

    echo ""
fi

# ─────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────
END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))

echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Fresh Install Validation Results${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo ""

PHASE_A_LABEL="Phase A (Clone)"
PHASE_B_LABEL="Phase B (Install)"
PHASE_C_LABEL="Phase C (Bootstrap)"
PHASE_D_LABEL="Phase D (Env Doctor)"

echo -e "  ${GREEN}$PASS passed${NC}  ${RED}$FAIL failed${NC}  out of $TOTAL checks"
echo -e "  Duration: ${TOTAL_DURATION}s"
echo -e "  Location: $WORK_DIR"

if $KEEP; then
    echo -e "  ${DIM}Preserved (--keep): $WORK_DIR${NC}"
fi

echo ""

if [ $FAIL -gt 0 ]; then
    echo -e "${RED}${BOLD}FAIL${NC} — $FAIL check(s) did not pass"
    exit 1
else
    echo -e "${GREEN}${BOLD}PASS${NC} — All checks passed"
    exit 0
fi
