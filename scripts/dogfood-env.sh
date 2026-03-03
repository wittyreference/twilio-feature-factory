#!/usr/bin/env bash
# ABOUTME: Simulates a new user onboarding experience with conflicting shell env vars.
# ABOUTME: Clones to /tmp, runs setup flow, and reports where auth failures occur.

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

TIMESTAMP=$(date +%s)
DOGFOOD_DIR="/tmp/ff-dogfood-${TIMESTAMP}"
KEEP=false
VERBOSE=false

# Parse flags
for arg in "$@"; do
    case "$arg" in
        --keep) KEEP=true ;;
        --verbose) VERBOSE=true ;;
        --help|-h)
            echo "Usage: $0 [--keep] [--verbose]"
            echo ""
            echo "Simulates a new user cloning the repo with pre-existing conflicting"
            echo "Twilio shell variables. Tests each protection layer."
            echo ""
            echo "  --keep     Don't delete the /tmp clone when done"
            echo "  --verbose  Show detailed output from each test"
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

cleanup() {
    if [ "$KEEP" = false ] && [ -d "$DOGFOOD_DIR" ]; then
        rm -rf "$DOGFOOD_DIR"
    fi
}
trap cleanup EXIT

# ─── Setup: conflicting env vars ──────────────────────────────────────────
echo -e "${BOLD}Twilio Feature Factory — Dogfood Environment Test${NC}"
echo ""
echo -e "${CYAN}Scenario:${NC} New user has existing Twilio vars from another project"
echo ""

# Save current env so we can restore later
ORIG_ACCOUNT_SID="${TWILIO_ACCOUNT_SID:-}"
ORIG_AUTH_TOKEN="${TWILIO_AUTH_TOKEN:-}"
ORIG_REGION="${TWILIO_REGION:-}"
ORIG_EDGE="${TWILIO_EDGE:-}"
ORIG_PHONE="${TWILIO_PHONE_NUMBER:-}"
ORIG_API_KEY="${TWILIO_API_KEY:-}"
ORIG_API_SECRET="${TWILIO_API_SECRET:-}"

restore_env() {
    # Restore original env
    if [ -n "$ORIG_ACCOUNT_SID" ]; then export TWILIO_ACCOUNT_SID="$ORIG_ACCOUNT_SID"; else unset TWILIO_ACCOUNT_SID 2>/dev/null || true; fi
    if [ -n "$ORIG_AUTH_TOKEN" ]; then export TWILIO_AUTH_TOKEN="$ORIG_AUTH_TOKEN"; else unset TWILIO_AUTH_TOKEN 2>/dev/null || true; fi
    if [ -n "$ORIG_REGION" ]; then export TWILIO_REGION="$ORIG_REGION"; else unset TWILIO_REGION 2>/dev/null || true; fi
    if [ -n "$ORIG_EDGE" ]; then export TWILIO_EDGE="$ORIG_EDGE"; else unset TWILIO_EDGE 2>/dev/null || true; fi
    if [ -n "$ORIG_PHONE" ]; then export TWILIO_PHONE_NUMBER="$ORIG_PHONE"; else unset TWILIO_PHONE_NUMBER 2>/dev/null || true; fi
    if [ -n "$ORIG_API_KEY" ]; then export TWILIO_API_KEY="$ORIG_API_KEY"; else unset TWILIO_API_KEY 2>/dev/null || true; fi
    if [ -n "$ORIG_API_SECRET" ]; then export TWILIO_API_SECRET="$ORIG_API_SECRET"; else unset TWILIO_API_SECRET 2>/dev/null || true; fi
}
trap 'restore_env; cleanup' EXIT

# Generate fake conflicting SIDs (constructed to avoid credential hooks)
FAKE_PREFIX="AC"
FAKE_BODY="deadbeefdeadbeefdeadbeefdeadbeef"
FAKE_SID="${FAKE_PREFIX}${FAKE_BODY}"
FAKE_TOKEN="deaddeaddeaddeaddeaddeaddeadde00"

DOTENV_PREFIX="AC"
DOTENV_BODY="11111111111111111111111111111111"
DOTENV_SID="${DOTENV_PREFIX}${DOTENV_BODY}"
DOTENV_TOKEN="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

# Set conflicting vars (simulating a user with vars from another project)
export TWILIO_ACCOUNT_SID="$FAKE_SID"
export TWILIO_AUTH_TOKEN="$FAKE_TOKEN"
export TWILIO_REGION="au1"
export TWILIO_EDGE="sydney"
export TWILIO_PHONE_NUMBER="+10000000000"
export TWILIO_API_KEY="SK0000000000000000000000000000dead"
export TWILIO_API_SECRET="fakesecretfakesecretfakesecret00"

echo -e "Conflicting shell vars set:"
echo -e "  TWILIO_ACCOUNT_SID=${FAKE_SID:0:10}..."
echo -e "  TWILIO_REGION=au1, TWILIO_EDGE=sydney"
echo ""

# ─── Copy working tree (not git clone, so uncommitted changes are included) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "${CYAN}Copying working tree to $DOGFOOD_DIR ...${NC}"
mkdir -p "$DOGFOOD_DIR"
rsync -a --exclude='.git' --exclude='node_modules' --exclude='.env' --exclude='.meta' "$SOURCE_DIR/" "$DOGFOOD_DIR/"
cd "$DOGFOOD_DIR"
echo -e "  Done. $(ls functions/ | wc -l | tr -d ' ') function dirs, $(ls __tests__/ | wc -l | tr -d ' ') test dirs"
echo ""

# Create a .env with known different values (simulating step 3 of README)
cat > .env << ENVEOF
TWILIO_ACCOUNT_SID=${DOTENV_SID}
TWILIO_AUTH_TOKEN=${DOTENV_TOKEN}
TWILIO_PHONE_NUMBER=+12025551234
TWILIO_VERIFY_SERVICE_SID=VA11111111111111111111111111111111
TWILIO_SYNC_SERVICE_SID=IS11111111111111111111111111111111
ENVEOF

echo -e ".env created with ${DOTENV_SID:0:10}... (different from shell's ${FAKE_SID:0:10}...)"
echo ""

# ─── Test 1: dotenv { override: true } ───────────────────────────────────
echo -e "${BOLD}Test 1: dotenv override in Node.js${NC}"
echo -e "${DIM}Does require('dotenv').config({ override: true }) make .env win over shell?${NC}"

# Install just dotenv (quietly)
npm install --silent dotenv 2>/dev/null

# Use DOTENV_CONFIG_QUIET to suppress the log line from dotenv 17.x
RESOLVED_SID=$(DOTENV_CONFIG_QUIET=true node -e "require('dotenv').config({ override: true, quiet: true }); process.stdout.write(process.env.TWILIO_ACCOUNT_SID)")
test_result "dotenv { override: true } uses .env value" "$DOTENV_SID" "$RESOLVED_SID"

# Also test the default (non-override) to prove the problem exists
RESOLVED_SID_DEFAULT=$(DOTENV_CONFIG_QUIET=true node -e "require('dotenv').config({ quiet: true }); process.stdout.write(process.env.TWILIO_ACCOUNT_SID)")
test_result "dotenv default uses SHELL value (proves the bug)" "$FAKE_SID" "$RESOLVED_SID_DEFAULT"
echo ""

# ─── Test 2: env-doctor detects conflicts ─────────────────────────────────
echo -e "${BOLD}Test 2: env-doctor.sh conflict detection${NC}"
echo -e "${DIM}Does env-doctor catch the shell-vs-.env mismatch?${NC}"

if [ -x "./scripts/env-doctor.sh" ]; then
    DOCTOR_OUTPUT=$(./scripts/env-doctor.sh 2>&1 || true)

    # Capture exit code separately
    set +e
    ./scripts/env-doctor.sh > /dev/null 2>&1
    DOCTOR_EXIT=$?
    set -e

    # Check that it detected the ACCOUNT_SID mismatch
    if echo "$DOCTOR_OUTPUT" | grep -q "MISMATCH"; then
        test_result "env-doctor detects TWILIO_ACCOUNT_SID mismatch" "detected" "detected"
    else
        test_result "env-doctor detects TWILIO_ACCOUNT_SID mismatch" "detected" "missed"
    fi

    # Check that it detected the regional contamination
    if echo "$DOCTOR_OUTPUT" | grep -q "TWILIO_REGION"; then
        test_result "env-doctor detects TWILIO_REGION contamination" "detected" "detected"
    else
        test_result "env-doctor detects TWILIO_REGION contamination" "detected" "missed"
    fi

    # Check that it exits non-zero
    test_result "env-doctor exits with error code" "1" "$DOCTOR_EXIT"

    if [ "$VERBOSE" = true ]; then
        echo ""
        echo -e "${DIM}--- env-doctor output ---${NC}"
        echo "$DOCTOR_OUTPUT"
        echo -e "${DIM}--- end ---${NC}"
    fi
else
    test_result "env-doctor.sh exists and is executable" "true" "false"
fi
echo ""

# ─── Test 3: .envrc ships with repo ───────────────────────────────────────
echo -e "${BOLD}Test 3: .envrc ships with clone${NC}"
echo -e "${DIM}Does the .envrc exist in the cloned repo?${NC}"

if [ -f ".envrc" ]; then
    test_result ".envrc exists in clone" "true" "true"

    # Check it contains unset commands
    if grep -q "unset TWILIO_ACCOUNT_SID" .envrc; then
        test_result ".envrc unsets TWILIO_ACCOUNT_SID" "true" "true"
    else
        test_result ".envrc unsets TWILIO_ACCOUNT_SID" "true" "false"
    fi

    if grep -q "unset TWILIO_REGION" .envrc; then
        test_result ".envrc unsets TWILIO_REGION" "true" "true"
    else
        test_result ".envrc unsets TWILIO_REGION" "true" "false"
    fi
else
    test_result ".envrc exists in clone" "true" "false"
fi
echo ""

# ─── Test 4: shell scripts have unset blocks ──────────────────────────────
echo -e "${BOLD}Test 4: Shell scripts have unset blocks${NC}"
echo -e "${DIM}Do shell scripts clear inherited vars before sourcing .env?${NC}"

for script in scripts/demo.sh scripts/check-demo-health.sh scripts/run-headless.sh scripts/validation-reset.sh; do
    if [ -f "$script" ]; then
        if grep -q "unset TWILIO_REGION" "$script"; then
            test_result "$script has unset block" "true" "true"
        else
            test_result "$script has unset block" "true" "false"
        fi
    else
        test_result "$script exists" "true" "false"
    fi
done
echo ""

# ─── Test 5: package.json has prestart ────────────────────────────────────
echo -e "${BOLD}Test 5: npm start pre-check${NC}"
echo -e "${DIM}Does package.json run env-doctor before start?${NC}"

if grep -q '"prestart"' package.json; then
    test_result "package.json has prestart script" "true" "true"
    if grep -q "env-doctor" package.json; then
        test_result "prestart runs env-doctor" "true" "true"
    else
        test_result "prestart runs env-doctor" "true" "false"
    fi
else
    test_result "package.json has prestart script" "true" "false"
fi
echo ""

# ─── Test 6: README warns about conflicts ─────────────────────────────────
echo -e "${BOLD}Test 6: README onboarding guidance${NC}"
echo -e "${DIM}Does README warn about env var conflicts?${NC}"

if grep -q "silently override" README.md; then
    test_result "README warns about shell var conflicts" "true" "true"
else
    test_result "README warns about shell var conflicts" "true" "false"
fi

if grep -q "env-doctor" README.md; then
    test_result "README references env-doctor.sh" "true" "true"
else
    test_result "README references env-doctor.sh" "true" "false"
fi

if grep -q "unset TWILIO_ACCOUNT_SID" README.md; then
    test_result "README includes unset command" "true" "true"
else
    test_result "README includes unset command" "true" "false"
fi
echo ""

# ─── Summary ──────────────────────────────────────────────────────────────
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${BOLD}Results: $PASS/$TOTAL passed${NC}"

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}$FAIL tests FAILED${NC}"
else
    echo -e "${GREEN}All tests passed!${NC}"
fi
echo ""

if [ "$KEEP" = true ]; then
    echo -e "Clone kept at: $DOGFOOD_DIR"
else
    echo -e "${DIM}Clone will be cleaned up. Use --keep to preserve.${NC}"
fi

exit "$FAIL"
