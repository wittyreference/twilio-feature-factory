#!/usr/bin/env bash
# ABOUTME: Clean-room provisioning validator — creates ephemeral Twilio resources, tests full
# ABOUTME: provisioning lifecycle end-to-end, then tears everything down. Existing infrastructure untouched.

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
            echo "Clean-room provisioning validator. Creates ephemeral Twilio resources"
            echo "(phone number, Sync, Verify, Messaging, TaskRouter, Serverless, VI),"
            echo "sends SMS, makes a call, deep validates, then tears everything down."
            echo ""
            echo "  --keep     Don't delete created resources when done (inspect manually)"
            echo "  --verbose  Show full API responses"
            echo ""
            echo "Cost per run: ~\$0.07 (number prorated + 1 SMS + 1 call)"
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

# Must run from project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

if [ ! -f "package.json" ] || [ ! -d ".claude" ]; then
    echo -e "${RED}Error: Must be run from the twilio-feature-factory root directory${NC}" >&2
    exit 1
fi

if [ ! -f ".env" ]; then
    echo -e "${RED}Error: .env file not found${NC}" >&2
    exit 1
fi

# Clear inherited Twilio vars that could conflict with .env
unset TWILIO_REGION TWILIO_EDGE TWILIO_API_KEY TWILIO_API_SECRET 2>/dev/null || true

# Source credentials
set -a
source .env
set +a

if [ -z "$TWILIO_ACCOUNT_SID" ] || [ -z "$TWILIO_AUTH_TOKEN" ]; then
    echo -e "${RED}Error: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in .env${NC}" >&2
    exit 1
fi

# Twilio API base
TWILIO_API="https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}"
AUTH="${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}"

# Resource tracking for cleanup
PURCHASED_PN_SID=""
SYNC_SID=""
VERIFY_SID=""
MESSAGING_SID=""
WORKSPACE_SID=""
SERVERLESS_SID=""
VI_SID=""
CALL_SID=""

# ─── Cleanup ────────────────────────────────────────────────────────────────
cleanup() {
    echo ""
    echo -e "${BOLD}Cleanup${NC}"

    if [ "$KEEP" = true ]; then
        echo -e "  ${YELLOW}--keep: Resources left on account:${NC}"
        [ -n "$PURCHASED_PN_SID" ] && echo -e "    Phone number: ${PURCHASED_PN_SID}"
        [ -n "$SYNC_SID" ] && echo -e "    Sync service: ${SYNC_SID}"
        [ -n "$VERIFY_SID" ] && echo -e "    Verify service: ${VERIFY_SID}"
        [ -n "$MESSAGING_SID" ] && echo -e "    Messaging service: ${MESSAGING_SID}"
        [ -n "$WORKSPACE_SID" ] && echo -e "    TaskRouter workspace: ${WORKSPACE_SID}"
        [ -n "$SERVERLESS_SID" ] && echo -e "    Serverless service: ${SERVERLESS_SID}"
        [ -n "$VI_SID" ] && echo -e "    VI service: ${VI_SID}"
        return
    fi

    # Release phone number
    if [ -n "$PURCHASED_PN_SID" ]; then
        echo -e "  Releasing phone number ${PURCHASED_PN_SID}..."
        curl -s -X DELETE "${TWILIO_API}/IncomingPhoneNumbers/${PURCHASED_PN_SID}.json" \
            -u "$AUTH" > /dev/null 2>&1 || true
    fi

    # Delete Sync service
    if [ -n "$SYNC_SID" ]; then
        echo -e "  Deleting Sync service ${SYNC_SID}..."
        curl -s -X DELETE "https://sync.twilio.com/v1/Services/${SYNC_SID}" \
            -u "$AUTH" > /dev/null 2>&1 || true
    fi

    # Delete Verify service
    if [ -n "$VERIFY_SID" ]; then
        echo -e "  Deleting Verify service ${VERIFY_SID}..."
        curl -s -X DELETE "https://verify.twilio.com/v2/Services/${VERIFY_SID}" \
            -u "$AUTH" > /dev/null 2>&1 || true
    fi

    # Delete Messaging service
    if [ -n "$MESSAGING_SID" ]; then
        echo -e "  Deleting Messaging service ${MESSAGING_SID}..."
        curl -s -X DELETE "https://messaging.twilio.com/v1/Services/${MESSAGING_SID}" \
            -u "$AUTH" > /dev/null 2>&1 || true
    fi

    # Delete TaskRouter workspace (cascades queue + workflow)
    if [ -n "$WORKSPACE_SID" ]; then
        echo -e "  Deleting TaskRouter workspace ${WORKSPACE_SID}..."
        curl -s -X DELETE "https://taskrouter.twilio.com/v1/Workspaces/${WORKSPACE_SID}" \
            -u "$AUTH" > /dev/null 2>&1 || true
    fi

    # Delete Serverless service
    if [ -n "$SERVERLESS_SID" ]; then
        echo -e "  Deleting Serverless service ${SERVERLESS_SID}..."
        curl -s -X DELETE "https://serverless.twilio.com/v1/Services/${SERVERLESS_SID}" \
            -u "$AUTH" > /dev/null 2>&1 || true
    fi

    # Delete Voice Intelligence service
    if [ -n "$VI_SID" ]; then
        echo -e "  Deleting VI service ${VI_SID}..."
        curl -s -X DELETE "https://intelligence.twilio.com/v2/Services/${VI_SID}" \
            -u "$AUTH" > /dev/null 2>&1 || true
    fi

    echo -e "  Done."
}
trap cleanup EXIT

# ─── Pre-flight ──────────────────────────────────────────────────────────────
echo -e "${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       Clean-Room Provisioning Validation                   ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${DIM}All resources use 'validation-${TIMESTAMP}' prefix${NC}"
echo -e "${DIM}Existing infrastructure is never modified${NC}"
echo ""

for cmd in curl jq python3; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo -e "${RED}ERROR: $cmd is required but not installed${NC}"
        exit 1
    fi
done

# ─── Phase 1: Search available phone numbers ────────────────────────────────
echo -e "${CYAN}[1/14]${NC} Search available phone numbers..."

SEARCH_JSON=$(curl -s "${TWILIO_API}/AvailablePhoneNumbers/US/Local.json?VoiceEnabled=true&SmsEnabled=true&PageSize=1" \
    -u "$AUTH" 2>/dev/null || echo '{}')

AVAILABLE_NUMBER=$(echo "$SEARCH_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
numbers = data.get('available_phone_numbers', [])
if numbers:
    print(numbers[0].get('phone_number', ''))
else:
    print('')
" 2>/dev/null || echo "")

if [ "$VERBOSE" = true ]; then
    echo -e "  ${DIM}$(echo "$SEARCH_JSON" | jq -c '.available_phone_numbers[0] | {phone_number, friendly_name, capabilities}' 2>/dev/null)${NC}"
fi

if [ -n "$AVAILABLE_NUMBER" ]; then
    test_result "Search available numbers returns a result" "found" "found"
    echo -e "  ${DIM}Found: ${AVAILABLE_NUMBER}${NC}"
else
    test_result "Search available numbers returns a result" "found" "empty"
    echo -e "${RED}Cannot continue without available numbers${NC}"
    exit 1
fi

# ─── Phase 2: Purchase a phone number ───────────────────────────────────────
echo ""
echo -e "${CYAN}[2/14]${NC} Purchase phone number ${AVAILABLE_NUMBER}..."

PURCHASE_JSON=$(curl -s -X POST "${TWILIO_API}/IncomingPhoneNumbers.json" \
    -u "$AUTH" \
    -d "PhoneNumber=${AVAILABLE_NUMBER}" \
    -d "FriendlyName=validation-${TIMESTAMP}" \
    2>/dev/null || echo '{}')

PURCHASED_PN_SID=$(echo "$PURCHASE_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('sid', ''))
" 2>/dev/null || echo "")

if [ "$VERBOSE" = true ]; then
    echo -e "  ${DIM}$(echo "$PURCHASE_JSON" | jq -c '{sid, phone_number, friendly_name, status}' 2>/dev/null)${NC}"
fi

if [ -n "$PURCHASED_PN_SID" ] && [[ "$PURCHASED_PN_SID" == PN* ]]; then
    test_result "Purchase phone number" "success" "success"
    echo -e "  ${DIM}SID: ${PURCHASED_PN_SID}${NC}"
else
    test_result "Purchase phone number" "success" "failed"
    echo -e "${RED}Cannot continue without a purchased number${NC}"
    echo -e "${DIM}Response: $(echo "$PURCHASE_JSON" | jq -c '.' 2>/dev/null)${NC}"
    exit 1
fi

# ─── Phase 3: Create Sync service ───────────────────────────────────────────
echo ""
echo -e "${CYAN}[3/14]${NC} Create Sync service..."

SYNC_JSON=$(curl -s -X POST "https://sync.twilio.com/v1/Services" \
    -u "$AUTH" \
    -d "FriendlyName=validation-sync-${TIMESTAMP}" \
    2>/dev/null || echo '{}')

SYNC_SID=$(echo "$SYNC_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('sid', ''))
" 2>/dev/null || echo "")

if [ "$VERBOSE" = true ]; then
    echo -e "  ${DIM}$(echo "$SYNC_JSON" | jq -c '{sid, friendly_name}' 2>/dev/null)${NC}"
fi

if [ -n "$SYNC_SID" ] && [[ "$SYNC_SID" == IS* ]]; then
    test_result "Create Sync service" "success" "success"
    echo -e "  ${DIM}SID: ${SYNC_SID}${NC}"
else
    test_result "Create Sync service" "success" "failed"
fi

# ─── Phase 4: Create Verify service ─────────────────────────────────────────
echo ""
echo -e "${CYAN}[4/14]${NC} Create Verify service..."

VERIFY_STDERR_FILE=$(mktemp)
VERIFY_JSON=$(curl -s -w "\n%{http_code}" -X POST "https://verify.twilio.com/v2/Services" \
    -u "$AUTH" \
    -d "FriendlyName=validation-verify-${TIMESTAMP}" \
    -d "CodeLength=6" \
    2>"$VERIFY_STDERR_FILE" || echo '{}')
VERIFY_HTTP_CODE=$(echo "$VERIFY_JSON" | tail -1)
VERIFY_JSON=$(echo "$VERIFY_JSON" | sed '$d')
if [ "$VERBOSE" = true ]; then
    echo -e "  ${DIM}HTTP ${VERIFY_HTTP_CODE} | Raw: $(echo "$VERIFY_JSON" | head -c 200)${NC}"
    VERIFY_STDERR=$(cat "$VERIFY_STDERR_FILE" 2>/dev/null)
    [ -n "$VERIFY_STDERR" ] && echo -e "  ${DIM}stderr: ${VERIFY_STDERR}${NC}"
fi
rm -f "$VERIFY_STDERR_FILE"

VERIFY_SID=$(echo "$VERIFY_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('sid', ''))
" 2>/dev/null || echo "")

if [ "$VERBOSE" = true ]; then
    echo -e "  ${DIM}$(echo "$VERIFY_JSON" | jq -c '{sid, friendly_name}' 2>/dev/null)${NC}"
fi

if [ -n "$VERIFY_SID" ] && [[ "$VERIFY_SID" == VA* ]]; then
    test_result "Create Verify service" "success" "success"
    echo -e "  ${DIM}SID: ${VERIFY_SID}${NC}"
else
    test_result "Create Verify service" "success" "failed"
fi

# ─── Phase 5: Create Messaging service ──────────────────────────────────────
echo ""
echo -e "${CYAN}[5/14]${NC} Create Messaging service..."

MSG_JSON=$(curl -s -X POST "https://messaging.twilio.com/v1/Services" \
    -u "$AUTH" \
    -d "FriendlyName=validation-messaging-${TIMESTAMP}" \
    2>/dev/null || echo '{}')

MESSAGING_SID=$(echo "$MSG_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('sid', ''))
" 2>/dev/null || echo "")

if [ "$VERBOSE" = true ]; then
    echo -e "  ${DIM}$(echo "$MSG_JSON" | jq -c '{sid, friendly_name}' 2>/dev/null)${NC}"
fi

if [ -n "$MESSAGING_SID" ] && [[ "$MESSAGING_SID" == MG* ]]; then
    test_result "Create Messaging service" "success" "success"
    echo -e "  ${DIM}SID: ${MESSAGING_SID}${NC}"
else
    test_result "Create Messaging service" "success" "failed"
fi

# ─── Phase 6: Create TaskRouter workspace ────────────────────────────────────
echo ""
echo -e "${CYAN}[6/14]${NC} Create TaskRouter workspace..."

WS_JSON=$(curl -s -X POST "https://taskrouter.twilio.com/v1/Workspaces" \
    -u "$AUTH" \
    -d "FriendlyName=validation-workspace-${TIMESTAMP}" \
    2>/dev/null || echo '{}')

WORKSPACE_SID=$(echo "$WS_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('sid', ''))
" 2>/dev/null || echo "")

if [ "$VERBOSE" = true ]; then
    echo -e "  ${DIM}$(echo "$WS_JSON" | jq -c '{sid, friendly_name}' 2>/dev/null)${NC}"
fi

if [ -n "$WORKSPACE_SID" ] && [[ "$WORKSPACE_SID" == WS* ]]; then
    test_result "Create TaskRouter workspace" "success" "success"
    echo -e "  ${DIM}SID: ${WORKSPACE_SID}${NC}"
else
    test_result "Create TaskRouter workspace" "success" "failed"
fi

# ─── Phase 7: Create TaskRouter queue ────────────────────────────────────────
echo ""
echo -e "${CYAN}[7/14]${NC} Create TaskRouter queue..."

QUEUE_SID=""
if [ -n "$WORKSPACE_SID" ]; then
    QUEUE_JSON=$(curl -s -X POST "https://taskrouter.twilio.com/v1/Workspaces/${WORKSPACE_SID}/TaskQueues" \
        -u "$AUTH" \
        -d "FriendlyName=validation-queue-${TIMESTAMP}" \
        -d "TargetWorkers=1==1" \
        2>/dev/null || echo '{}')

    QUEUE_SID=$(echo "$QUEUE_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('sid', ''))
" 2>/dev/null || echo "")

    if [ "$VERBOSE" = true ]; then
        echo -e "  ${DIM}$(echo "$QUEUE_JSON" | jq -c '{sid, friendly_name}' 2>/dev/null)${NC}"
    fi

    if [ -n "$QUEUE_SID" ] && [[ "$QUEUE_SID" == WQ* ]]; then
        test_result "Create TaskRouter queue" "success" "success"
        echo -e "  ${DIM}SID: ${QUEUE_SID}${NC}"
    else
        test_result "Create TaskRouter queue" "success" "failed"
    fi
else
    test_result "Create TaskRouter queue" "success" "skipped (no workspace)"
fi

# ─── Phase 8: Create TaskRouter workflow ─────────────────────────────────────
echo ""
echo -e "${CYAN}[8/14]${NC} Create TaskRouter workflow..."

if [ -n "$WORKSPACE_SID" ] && [ -n "$QUEUE_SID" ]; then
    WORKFLOW_CONFIG=$(python3 -c "
import json
print(json.dumps({
    'task_routing': {
        'filters': [],
        'default_filter': {
            'queue': '${QUEUE_SID}'
        }
    }
}))
")

    WF_JSON=$(curl -s -X POST "https://taskrouter.twilio.com/v1/Workspaces/${WORKSPACE_SID}/Workflows" \
        -u "$AUTH" \
        -d "FriendlyName=validation-workflow-${TIMESTAMP}" \
        --data-urlencode "Configuration=${WORKFLOW_CONFIG}" \
        2>/dev/null || echo '{}')

    WORKFLOW_SID=$(echo "$WF_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('sid', ''))
" 2>/dev/null || echo "")

    if [ "$VERBOSE" = true ]; then
        echo -e "  ${DIM}$(echo "$WF_JSON" | jq -c '{sid, friendly_name}' 2>/dev/null)${NC}"
    fi

    if [ -n "$WORKFLOW_SID" ] && [[ "$WORKFLOW_SID" == WW* ]]; then
        test_result "Create TaskRouter workflow" "success" "success"
        echo -e "  ${DIM}SID: ${WORKFLOW_SID}${NC}"
    else
        test_result "Create TaskRouter workflow" "success" "failed"
    fi
else
    test_result "Create TaskRouter workflow" "success" "skipped (no workspace/queue)"
fi

# ─── Phase 9: Configure webhooks on purchased number ─────────────────────────
echo ""
echo -e "${CYAN}[9/14]${NC} Configure webhooks on purchased number..."

# Use a known TwiML endpoint for testing — the account's own status callback URL
# or a simple echo URL. We just need to verify the API call succeeds.
VOICE_URL="https://demo.twilio.com/welcome/voice/"
SMS_URL="https://demo.twilio.com/welcome/sms/"

WEBHOOK_JSON=$(curl -s -X POST "${TWILIO_API}/IncomingPhoneNumbers/${PURCHASED_PN_SID}.json" \
    -u "$AUTH" \
    -d "VoiceUrl=${VOICE_URL}" \
    -d "SmsUrl=${SMS_URL}" \
    2>/dev/null || echo '{}')

CONFIGURED_VOICE_URL=$(echo "$WEBHOOK_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('voice_url', ''))
" 2>/dev/null || echo "")

if [ "$VERBOSE" = true ]; then
    echo -e "  ${DIM}$(echo "$WEBHOOK_JSON" | jq -c '{sid, voice_url, sms_url}' 2>/dev/null)${NC}"
fi

if [ "$CONFIGURED_VOICE_URL" = "$VOICE_URL" ]; then
    test_result "Configure webhooks on purchased number" "success" "success"
else
    test_result "Configure webhooks on purchased number" "success" "failed"
fi

# ─── Phase 10: Create Serverless service ─────────────────────────────────────
echo ""
echo -e "${CYAN}[10/14]${NC} Create Serverless service..."

SVC_NAME="validation-${TIMESTAMP}"
SVC_JSON=$(curl -s -X POST "https://serverless.twilio.com/v1/Services" \
    -u "$AUTH" \
    -d "FriendlyName=${SVC_NAME}" \
    -d "UniqueName=${SVC_NAME}" \
    -d "IncludeCredentials=true" \
    2>/dev/null || echo '{}')

SERVERLESS_SID=$(echo "$SVC_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('sid', ''))
" 2>/dev/null || echo "")

if [ "$VERBOSE" = true ]; then
    echo -e "  ${DIM}$(echo "$SVC_JSON" | jq -c '{sid, friendly_name, unique_name}' 2>/dev/null)${NC}"
fi

if [ -n "$SERVERLESS_SID" ] && [[ "$SERVERLESS_SID" == ZS* ]]; then
    test_result "Create Serverless service" "success" "success"
    echo -e "  ${DIM}SID: ${SERVERLESS_SID}${NC}"
else
    test_result "Create Serverless service" "success" "failed"
fi

# ─── Phase 11: Send SMS from purchased number ───────────────────────────────
echo ""
echo -e "${CYAN}[11/14]${NC} Send SMS from purchased number..."

DEST_NUMBER="${TEST_PHONE_NUMBER:-}"
if [ -z "$DEST_NUMBER" ]; then
    DEST_NUMBER="${TWILIO_PHONE_NUMBER:-}"
fi

if [ -n "$DEST_NUMBER" ] && [ "$DEST_NUMBER" != "$AVAILABLE_NUMBER" ]; then
    SMS_JSON=$(curl -s -X POST "${TWILIO_API}/Messages.json" \
        -u "$AUTH" \
        -d "From=${AVAILABLE_NUMBER}" \
        -d "To=${DEST_NUMBER}" \
        -d "Body=Provisioning validation test ${TIMESTAMP}" \
        2>/dev/null || echo '{}')

    SMS_SID=$(echo "$SMS_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('sid', ''))
" 2>/dev/null || echo "")

    SMS_STATUS=$(echo "$SMS_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('status', ''))
" 2>/dev/null || echo "")

    if [ "$VERBOSE" = true ]; then
        echo -e "  ${DIM}$(echo "$SMS_JSON" | jq -c '{sid, status, from, to}' 2>/dev/null)${NC}"
    fi

    if [ -n "$SMS_SID" ] && [[ "$SMS_SID" == SM* || "$SMS_SID" == MM* ]]; then
        test_result "Send SMS from purchased number" "success" "success"
        echo -e "  ${DIM}SID: ${SMS_SID} (${SMS_STATUS})${NC}"
    else
        # Check for error message
        ERROR_MSG=$(echo "$SMS_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('message', ''))
" 2>/dev/null || echo "")
        test_result "Send SMS from purchased number" "success" "failed"
        [ -n "$ERROR_MSG" ] && echo -e "  ${DIM}Error: ${ERROR_MSG}${NC}"
    fi
else
    test_result "Send SMS from purchased number" "success" "skipped (no dest number)"
fi

# ─── Phase 12: Make outbound call from purchased number ─────────────────────
echo ""
echo -e "${CYAN}[12/14]${NC} Make outbound call from purchased number..."

if [ -n "$DEST_NUMBER" ] && [ "$DEST_NUMBER" != "$AVAILABLE_NUMBER" ]; then
    CALL_JSON=$(curl -s -X POST "${TWILIO_API}/Calls.json" \
        -u "$AUTH" \
        -d "From=${AVAILABLE_NUMBER}" \
        -d "To=${DEST_NUMBER}" \
        --data-urlencode "Twiml=<Response><Say voice=\"Polly.Amy\">Provisioning validation test call. Goodbye.</Say></Response>" \
        2>/dev/null || echo '{}')

    CALL_SID=$(echo "$CALL_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('sid', ''))
" 2>/dev/null || echo "")

    CALL_STATUS=$(echo "$CALL_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('status', ''))
" 2>/dev/null || echo "")

    if [ "$VERBOSE" = true ]; then
        echo -e "  ${DIM}$(echo "$CALL_JSON" | jq -c '{sid, status, from, to}' 2>/dev/null)${NC}"
    fi

    if [ -n "$CALL_SID" ] && [[ "$CALL_SID" == CA* ]]; then
        test_result "Make outbound call" "success" "success"
        echo -e "  ${DIM}SID: ${CALL_SID} (${CALL_STATUS})${NC}"
    else
        ERROR_MSG=$(echo "$CALL_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('message', ''))
" 2>/dev/null || echo "")
        test_result "Make outbound call" "success" "failed"
        [ -n "$ERROR_MSG" ] && echo -e "  ${DIM}Error: ${ERROR_MSG}${NC}"
    fi
else
    test_result "Make outbound call" "success" "skipped (no dest number)"
fi

# ─── Phase 13: Deep validate call ───────────────────────────────────────────
echo ""
echo -e "${CYAN}[13/14]${NC} Deep validate call..."

if [ -n "$CALL_SID" ] && [[ "$CALL_SID" == CA* ]]; then
    # Poll call status until terminal (max 30 seconds)
    MAX_POLLS=15
    POLL_INTERVAL=2
    FINAL_STATUS=""

    for i in $(seq 1 $MAX_POLLS); do
        POLL_JSON=$(curl -s "${TWILIO_API}/Calls/${CALL_SID}.json" \
            -u "$AUTH" 2>/dev/null || echo '{}')

        FINAL_STATUS=$(echo "$POLL_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('status', ''))
" 2>/dev/null || echo "")

        if [ "$VERBOSE" = true ]; then
            echo -e "  ${DIM}Poll ${i}/${MAX_POLLS}: ${FINAL_STATUS}${NC}"
        fi

        # Terminal states: completed, busy, no-answer, canceled, failed
        case "$FINAL_STATUS" in
            completed|busy|no-answer|canceled|failed)
                break
                ;;
        esac

        sleep "$POLL_INTERVAL"
    done

    CALL_DURATION=$(echo "$POLL_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('duration', '0'))
" 2>/dev/null || echo "0")

    echo -e "  ${DIM}Final status: ${FINAL_STATUS}, duration: ${CALL_DURATION}s${NC}"

    # Call is valid if it reached a terminal state (not stuck in queued/ringing)
    # completed is ideal, but busy/no-answer also prove the provisioning worked
    case "$FINAL_STATUS" in
        completed)
            test_result "Deep validate call (completed)" "success" "success"
            ;;
        busy|no-answer|canceled)
            # These prove the number worked and the call was placed
            test_result "Deep validate call (${FINAL_STATUS} — number works)" "success" "success"
            ;;
        failed)
            test_result "Deep validate call (call failed)" "success" "failed"
            ;;
        *)
            test_result "Deep validate call (status: ${FINAL_STATUS})" "success" "timeout"
            ;;
    esac
else
    test_result "Deep validate call" "success" "skipped (no call SID)"
fi

# ─── Phase 14: Create Voice Intelligence service ────────────────────────────
echo ""
echo -e "${CYAN}[14/14]${NC} Create Voice Intelligence service..."

VI_JSON=$(curl -s -X POST "https://intelligence.twilio.com/v2/Services" \
    -u "$AUTH" \
    -d "UniqueName=validation-vi-${TIMESTAMP}" \
    -d "FriendlyName=validation-vi-${TIMESTAMP}" \
    -d "AutoTranscribe=false" \
    -d "LanguageCode=en-US" \
    2>/dev/null || echo '{}')

VI_SID=$(echo "$VI_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('sid', ''))
" 2>/dev/null || echo "")

if [ "$VERBOSE" = true ]; then
    echo -e "  ${DIM}$(echo "$VI_JSON" | jq -c '{sid, friendly_name, unique_name}' 2>/dev/null)${NC}"
fi

if [ -n "$VI_SID" ] && [[ "$VI_SID" == GA* ]]; then
    test_result "Create Voice Intelligence service" "success" "success"
    echo -e "  ${DIM}SID: ${VI_SID}${NC}"
else
    # VI might not be enabled on all accounts
    ERROR_CODE=$(echo "$VI_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('code', ''))
" 2>/dev/null || echo "")
    ERROR_MSG=$(echo "$VI_JSON" | python3 -c "
import sys, json
print(json.load(sys.stdin).get('message', ''))
" 2>/dev/null || echo "")
    test_result "Create Voice Intelligence service" "success" "failed"
    [ -n "$ERROR_MSG" ] && echo -e "  ${DIM}Error: ${ERROR_MSG}${NC}"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${BOLD}Results: $PASS/$TOTAL passed${NC}"
if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}$FAIL test(s) FAILED${NC}"
else
    echo -e "${GREEN}All tests passed!${NC}"
fi
echo ""

exit "$FAIL"
