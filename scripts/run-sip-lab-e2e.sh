#!/usr/bin/env bash
# ABOUTME: Runs E2E SIP Lab tests against the live Asterisk PBX and Twilio SIP trunk.
# ABOUTME: Sources both .env and .env.sip-lab, verifies prerequisites, runs Jest tests.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SIP_LAB_ENV="$PROJECT_DIR/infrastructure/sip-lab/.env.sip-lab"
REPORT_DIR="$PROJECT_DIR/__tests__/e2e/sip-lab/reports"

cd "$PROJECT_DIR"

# ── Source environment ────────────────────────────────────────────────────

if [ -f ".env" ]; then
    set -a
    source .env
    set +a
fi

if [ -f "$SIP_LAB_ENV" ]; then
    set -a
    source "$SIP_LAB_ENV"
    set +a
else
    echo "ERROR: $SIP_LAB_ENV not found"
    echo "  Run: node infrastructure/sip-lab/scripts/setup-sip-lab.js"
    exit 1
fi

# Force US1 standard endpoints
unset TWILIO_REGION 2>/dev/null || true
unset TWILIO_EDGE 2>/dev/null || true
unset TWILIO_API_KEY 2>/dev/null || true
unset TWILIO_API_SECRET 2>/dev/null || true

# ── Banner ────────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════"
echo "  SIP Lab E2E Validation"
echo "══════════════════════════════════════════════"
echo ""
echo "  Account:    ${TWILIO_ACCOUNT_SID:-not set}"
echo "  From:       ${TWILIO_PHONE_NUMBER:-not set}"
echo "  Trunk:      ${SIP_LAB_TRUNK_SID:-not set}"
echo "  Droplet:    ${SIP_LAB_DROPLET_IP:-not set}"
echo "  Region:     US1 (standard)"
echo ""

# ── Verify prerequisites ─────────────────────────────────────────────────

ERRORS=0

if [ -z "${TWILIO_ACCOUNT_SID:-}" ] || [ -z "${TWILIO_AUTH_TOKEN:-}" ]; then
    echo "ERROR: Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN"
    ERRORS=$((ERRORS + 1))
fi

if [ -z "${TWILIO_PHONE_NUMBER:-}" ]; then
    echo "ERROR: Missing TWILIO_PHONE_NUMBER (FROM number for test calls)"
    ERRORS=$((ERRORS + 1))
fi

if [ -z "${SIP_LAB_TRUNK_SID:-}" ]; then
    echo "ERROR: Missing SIP_LAB_TRUNK_SID in .env.sip-lab"
    ERRORS=$((ERRORS + 1))
fi

if [ -z "${SIP_LAB_DROPLET_IP:-}" ]; then
    echo "ERROR: Missing SIP_LAB_DROPLET_IP in .env.sip-lab"
    ERRORS=$((ERRORS + 1))
fi

if [ "$ERRORS" -gt 0 ]; then
    echo ""
    echo "Fix the errors above and try again."
    exit 1
fi

# Verify auth works
AUTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
    -u "${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}" \
    "https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json" 2>/dev/null || echo "000")

if [ "$AUTH_CHECK" != "200" ]; then
    echo "ERROR: Auth token returned HTTP $AUTH_CHECK against api.twilio.com"
    exit 1
fi
echo "  Auth:       ✓ Verified"

# ── Optional: SSH health check ────────────────────────────────────────────

SSH_KEY="${SIP_LAB_SSH_KEY:-$HOME/.ssh/sip-lab}"

if [ -f "$SSH_KEY" ]; then
    if ssh -i "$SSH_KEY" -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
       "siplab@$SIP_LAB_DROPLET_IP" "echo ok" &>/dev/null; then
        echo "  Droplet:    ✓ SSH reachable"

        CONTAINER_STATUS=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no \
            "siplab@$SIP_LAB_DROPLET_IP" \
            "docker ps --filter name=sip-lab-asterisk --format '{{.Status}}'" 2>/dev/null || echo "")
        if [[ "$CONTAINER_STATUS" == *"Up"* ]]; then
            echo "  Asterisk:   ✓ Container running"
        else
            echo "WARNING: Asterisk container not running. Tests will likely fail."
            echo "  Fix: ssh -i $SSH_KEY siplab@$SIP_LAB_DROPLET_IP 'cd sip-lab && docker compose up -d'"
        fi
    else
        echo "WARNING: Cannot SSH to droplet at $SIP_LAB_DROPLET_IP"
        echo "  Droplet may be snapshotted. Restore with: cd infrastructure/sip-lab && ./scripts/droplet-restore.sh"
    fi
else
    echo "  Droplet:    ? SSH key not found at $SSH_KEY (skipping health check)"
fi

echo ""

# ── Run tests ─────────────────────────────────────────────────────────────

mkdir -p "$REPORT_DIR"
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
REPORT_FILE="$REPORT_DIR/$TIMESTAMP-results.txt"

echo "Running SIP Lab E2E tests..."
echo ""

npx jest __tests__/e2e/sip-lab/ \
    --testPathIgnorePatterns='/node_modules/' \
    --verbose \
    --no-coverage \
    --forceExit \
    2>&1 | tee "$REPORT_FILE"

EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo "══════════════════════════════════════════════"
if [ "$EXIT_CODE" -eq 0 ]; then
    echo "  ALL SIP LAB TESTS PASSED ✓"
else
    echo "  SOME TESTS FAILED (exit code: $EXIT_CODE)"
fi
echo "  Report saved: $REPORT_FILE"
echo "══════════════════════════════════════════════"

exit $EXIT_CODE
