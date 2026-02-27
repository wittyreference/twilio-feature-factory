#!/usr/bin/env bash
# ABOUTME: Runs the E2E deep validation test suite against live Twilio APIs (US1).
# ABOUTME: Unsets regional config to ensure standard US1 endpoint usage.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MCP_DIR="$PROJECT_DIR/agents/mcp-servers/twilio"
REPORT_DIR="$MCP_DIR/__tests__/validation-reports"

cd "$PROJECT_DIR"

# Source .env for credentials
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
fi

# Force US1 standard endpoints — unset any regional config
unset TWILIO_REGION
unset TWILIO_EDGE
unset TWILIO_API_KEY
unset TWILIO_API_SECRET

echo "══════════════════════════════════════════════"
echo "  E2E Deep Validation Suite"
echo "══════════════════════════════════════════════"
echo ""
echo "  Account:  $TWILIO_ACCOUNT_SID"
echo "  From:     $TWILIO_PHONE_NUMBER"
echo "  To:       ${TEST_PHONE_NUMBER:-not set}"
echo "  Region:   US1 (standard)"
echo "  Auth:     Account SID + Auth Token"
echo ""

# Verify auth works against US1
AUTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
    -u "${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}" \
    "https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json" 2>/dev/null || echo "000")

if [ "$AUTH_CHECK" != "200" ]; then
    echo "ERROR: Auth token returned HTTP $AUTH_CHECK against US1 api.twilio.com"
    echo "E2E tests require a valid auth token for the standard US1 endpoint."
    exit 1
fi
echo "  Auth:     ✓ Verified against api.twilio.com"
echo ""

# Run the tests
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
REPORT_FILE="$REPORT_DIR/$TIMESTAMP-results.txt"

echo "Running E2E tests..."
echo ""

cd "$MCP_DIR"

RUN_DEEP_VALIDATION_TESTS=true npx jest \
    --testPathPattern=e2e-deep-validation \
    --verbose \
    --no-coverage \
    --forceExit \
    2>&1 | tee "$REPORT_FILE"

EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo "══════════════════════════════════════════════"
if [ "$EXIT_CODE" -eq 0 ]; then
    echo "  ALL VALIDATORS PASSED ✓"
else
    echo "  SOME VALIDATORS FAILED (exit code: $EXIT_CODE)"
fi
echo "  Report saved: $REPORT_FILE"
echo "══════════════════════════════════════════════"

exit $EXIT_CODE
