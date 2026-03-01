#!/bin/bash
# ABOUTME: Idempotent account reset for validation runs — removes deployed services, blanks webhooks,
# ABOUTME: recreates Twilio resources, deletes recordings/transcripts, and updates .env with new SIDs.

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# Must run from project root
if [ ! -f "package.json" ] || [ ! -d ".claude" ]; then
    echo -e "${RED}Error: Must be run from the twilio-feature-factory root directory${NC}" >&2
    exit 1
fi

# Must have .env
if [ ! -f ".env" ]; then
    echo -e "${RED}Error: .env file not found${NC}" >&2
    exit 1
fi

# Source credentials
set -a
source .env
set +a

# Force US1 — regional env vars from .env could silently redirect API calls
unset TWILIO_REGION TWILIO_EDGE

if [ -z "$TWILIO_ACCOUNT_SID" ] || [ -z "$TWILIO_AUTH_TOKEN" ]; then
    echo -e "${RED}Error: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in .env${NC}" >&2
    exit 1
fi

# Twilio API base
TWILIO_API="https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}"
AUTH="${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}"

# Helper: update a key=value in .env (macOS sed)
update_env() {
    local key="$1"
    local value="$2"
    if grep -q "^${key}=" .env; then
        sed -i '' "s|^${key}=.*|${key}=${value}|" .env
    else
        echo "${key}=${value}" >> .env
    fi
}

# Track what was cleaned for the summary
CLEANED=()
NEW_SIDS=()

echo -e "${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║         Validation Reset — Clean Slate                     ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ─────────────────────────────────────────────────────────────
# Phase 1: Remove serverless deployment
# ─────────────────────────────────────────────────────────────
echo -e "${CYAN}[Phase 1/7]${NC} Remove serverless deployment..."

SERVICE_NAME="prototype"
SERVICE_SID=$(twilio api:serverless:v1:services:list -o json 2>/dev/null \
    | python3 -c "
import sys, json
data = json.load(sys.stdin)
for svc in data:
    if svc.get('friendlyName') == '${SERVICE_NAME}' or svc.get('uniqueName') == '${SERVICE_NAME}':
        print(svc['sid'])
        break
" 2>/dev/null || echo "")

if [ -n "$SERVICE_SID" ]; then
    twilio api:serverless:v1:services:remove --sid "$SERVICE_SID" -o json 2>/dev/null || true
    echo -e "${GREEN}  Deleted serverless service: ${SERVICE_SID}${NC}"
    CLEANED+=("Serverless service ${SERVICE_SID}")
else
    echo -e "${DIM}  No serverless service found (already clean)${NC}"
fi

# Clear callback base URL since the service is gone
update_env "TWILIO_CALLBACK_BASE_URL" ""
echo -e "${DIM}  Cleared TWILIO_CALLBACK_BASE_URL in .env${NC}"

# Clear the serverless toolkit's cached service SID
if [ -f ".twiliodeployinfo" ]; then
    echo '{}' > .twiliodeployinfo
    echo -e "${DIM}  Cleared .twiliodeployinfo cache${NC}"
fi

# ─────────────────────────────────────────────────────────────
# Phase 2: Reset phone number webhooks
# ─────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}[Phase 2/7]${NC} Reset phone number webhooks..."

NUMBERS_JSON=$(twilio api:core:incoming-phone-numbers:list -o json 2>/dev/null || echo "[]")
NUM_COUNT=$(echo "$NUMBERS_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

if [ "$NUM_COUNT" -gt 0 ]; then
    echo "$NUMBERS_JSON" | python3 -c "
import sys, json
for num in json.load(sys.stdin):
    print(num['sid'])
" 2>/dev/null | while read -r PN_SID; do
        curl -s -X POST "${TWILIO_API}/IncomingPhoneNumbers/${PN_SID}.json" \
            -u "$AUTH" \
            -d 'VoiceUrl=' \
            -d 'VoiceFallbackUrl=' \
            -d 'StatusCallback=' \
            -d 'SmsUrl=' \
            -d 'SmsFallbackUrl=' \
            -d 'SmsStatusCallback=' > /dev/null
        echo -e "${GREEN}  Reset webhooks on ${PN_SID}${NC}"
    done
    CLEANED+=("Webhooks on ${NUM_COUNT} phone numbers")
else
    echo -e "${DIM}  No phone numbers found${NC}"
fi

# ─────────────────────────────────────────────────────────────
# Phase 3: Delete & recreate services
# ─────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}[Phase 3/7]${NC} Delete & recreate services..."

# --- Sync Service ---
if [ -n "$TWILIO_SYNC_SERVICE_SID" ]; then
    curl -s -X DELETE "https://sync.twilio.com/v1/Services/${TWILIO_SYNC_SERVICE_SID}" \
        -u "$AUTH" > /dev/null 2>&1 || true
    echo -e "${DIM}  Deleted Sync service: ${TWILIO_SYNC_SERVICE_SID}${NC}"
fi

NEW_SYNC=$(curl -s -X POST "https://sync.twilio.com/v1/Services" \
    -u "$AUTH" \
    -d 'FriendlyName=twilio-agent-factory-sync' \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('sid',''))" 2>/dev/null)

if [ -n "$NEW_SYNC" ]; then
    update_env "TWILIO_SYNC_SERVICE_SID" "$NEW_SYNC"
    echo -e "${GREEN}  Created Sync service: ${NEW_SYNC}${NC}"
    NEW_SIDS+=("TWILIO_SYNC_SERVICE_SID=${NEW_SYNC}")
else
    echo -e "${RED}  Failed to create Sync service${NC}"
fi

# --- Verify Service ---
if [ -n "$TWILIO_VERIFY_SERVICE_SID" ]; then
    curl -s -X DELETE "https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}" \
        -u "$AUTH" > /dev/null 2>&1 || true
    echo -e "${DIM}  Deleted Verify service: ${TWILIO_VERIFY_SERVICE_SID}${NC}"
fi

NEW_VERIFY=$(curl -s -X POST "https://verify.twilio.com/v2/Services" \
    -u "$AUTH" \
    -d 'FriendlyName=twilio-agent-factory-verify' \
    -d 'CodeLength=6' \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('sid',''))" 2>/dev/null)

if [ -n "$NEW_VERIFY" ]; then
    update_env "TWILIO_VERIFY_SERVICE_SID" "$NEW_VERIFY"
    echo -e "${GREEN}  Created Verify service: ${NEW_VERIFY}${NC}"
    NEW_SIDS+=("TWILIO_VERIFY_SERVICE_SID=${NEW_VERIFY}")
else
    echo -e "${RED}  Failed to create Verify service${NC}"
fi

# --- Messaging Service ---
if [ -n "$TWILIO_MESSAGING_SERVICE_SID" ]; then
    curl -s -X DELETE "https://messaging.twilio.com/v1/Services/${TWILIO_MESSAGING_SERVICE_SID}" \
        -u "$AUTH" > /dev/null 2>&1 || true
    echo -e "${DIM}  Deleted Messaging service: ${TWILIO_MESSAGING_SERVICE_SID}${NC}"
fi

NEW_MSG=$(curl -s -X POST "https://messaging.twilio.com/v1/Services" \
    -u "$AUTH" \
    -d 'FriendlyName=twilio-agent-factory-messaging' \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('sid',''))" 2>/dev/null)

if [ -n "$NEW_MSG" ]; then
    update_env "TWILIO_MESSAGING_SERVICE_SID" "$NEW_MSG"
    echo -e "${GREEN}  Created Messaging service: ${NEW_MSG}${NC}"
    NEW_SIDS+=("TWILIO_MESSAGING_SERVICE_SID=${NEW_MSG}")
else
    echo -e "${RED}  Failed to create Messaging service${NC}"
fi

# --- TaskRouter Workspace + Queue + Workflow ---
if [ -n "$TWILIO_TASKROUTER_WORKSPACE_SID" ]; then
    curl -s -X DELETE "https://taskrouter.twilio.com/v1/Workspaces/${TWILIO_TASKROUTER_WORKSPACE_SID}" \
        -u "$AUTH" > /dev/null 2>&1 || true
    echo -e "${DIM}  Deleted TaskRouter workspace: ${TWILIO_TASKROUTER_WORKSPACE_SID}${NC}"
fi

NEW_WS=$(curl -s -X POST "https://taskrouter.twilio.com/v1/Workspaces" \
    -u "$AUTH" \
    -d 'FriendlyName=twilio-agent-factory-workspace' \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('sid',''))" 2>/dev/null)

if [ -n "$NEW_WS" ]; then
    update_env "TWILIO_TASKROUTER_WORKSPACE_SID" "$NEW_WS"
    echo -e "${GREEN}  Created TaskRouter workspace: ${NEW_WS}${NC}"
    NEW_SIDS+=("TWILIO_TASKROUTER_WORKSPACE_SID=${NEW_WS}")

    # Create default queue
    NEW_QUEUE=$(curl -s -X POST "https://taskrouter.twilio.com/v1/Workspaces/${NEW_WS}/TaskQueues" \
        -u "$AUTH" \
        -d 'FriendlyName=Default Queue' \
        -d 'TargetWorkers=1==1' \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('sid',''))" 2>/dev/null)

    if [ -n "$NEW_QUEUE" ]; then
        echo -e "${GREEN}  Created default queue: ${NEW_QUEUE}${NC}"

        # Create default workflow routing to that queue
        WORKFLOW_CONFIG=$(python3 -c "
import json
print(json.dumps({
    'task_routing': {
        'filters': [],
        'default_filter': {
            'queue': '${NEW_QUEUE}'
        }
    }
}))
")
        NEW_WW=$(curl -s -X POST "https://taskrouter.twilio.com/v1/Workspaces/${NEW_WS}/Workflows" \
            -u "$AUTH" \
            -d 'FriendlyName=Default Workflow' \
            --data-urlencode "Configuration=${WORKFLOW_CONFIG}" \
            | python3 -c "import sys,json; print(json.load(sys.stdin).get('sid',''))" 2>/dev/null)

        if [ -n "$NEW_WW" ]; then
            update_env "TWILIO_TASKROUTER_WORKFLOW_SID" "$NEW_WW"
            echo -e "${GREEN}  Created default workflow: ${NEW_WW}${NC}"
            NEW_SIDS+=("TWILIO_TASKROUTER_WORKFLOW_SID=${NEW_WW}")
        else
            echo -e "${RED}  Failed to create TaskRouter workflow${NC}"
        fi
    else
        echo -e "${RED}  Failed to create TaskRouter queue${NC}"
    fi
else
    echo -e "${RED}  Failed to create TaskRouter workspace${NC}"
fi

# ─────────────────────────────────────────────────────────────
# Phase 4: Delete recordings
# ─────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}[Phase 4/7]${NC} Delete recordings..."

REC_JSON=$(curl -s "${TWILIO_API}/Recordings.json?PageSize=200" -u "$AUTH")
REC_COUNT=$(echo "$REC_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
recs = data.get('recordings', [])
print(len(recs))
" 2>/dev/null || echo "0")

if [ "$REC_COUNT" -gt 0 ]; then
    echo "$REC_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for rec in data.get('recordings', []):
    print(rec['sid'])
" 2>/dev/null | while read -r REC_SID; do
        curl -s -X DELETE "${TWILIO_API}/Recordings/${REC_SID}.json" -u "$AUTH" > /dev/null
        echo -e "${DIM}  Deleted recording: ${REC_SID}${NC}"
    done
    CLEANED+=("${REC_COUNT} recordings")
    echo -e "${GREEN}  Deleted ${REC_COUNT} recordings${NC}"
else
    echo -e "${DIM}  No recordings found${NC}"
fi

# ─────────────────────────────────────────────────────────────
# Phase 5: Delete Voice Intelligence transcripts
# ─────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}[Phase 5/7]${NC} Delete Voice Intelligence transcripts..."

TRANSCRIPT_JSON=$(curl -s "https://intelligence.twilio.com/v2/Transcripts?PageSize=200" -u "$AUTH" 2>/dev/null || echo '{"transcripts":[]}')
TX_COUNT=$(echo "$TRANSCRIPT_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
txs = data.get('transcripts', [])
print(len(txs))
" 2>/dev/null || echo "0")

if [ "$TX_COUNT" -gt 0 ]; then
    echo "$TRANSCRIPT_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for tx in data.get('transcripts', []):
    print(tx['sid'])
" 2>/dev/null | while read -r TX_SID; do
        curl -s -X DELETE "https://intelligence.twilio.com/v2/Transcripts/${TX_SID}" -u "$AUTH" > /dev/null
        echo -e "${DIM}  Deleted transcript: ${TX_SID}${NC}"
    done
    CLEANED+=("${TX_COUNT} transcripts")
    echo -e "${GREEN}  Deleted ${TX_COUNT} transcripts${NC}"
else
    echo -e "${DIM}  No transcripts found${NC}"
fi

# ─────────────────────────────────────────────────────────────
# Phase 6: Clear validation state
# ─────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}[Phase 6/7]${NC} Clear validation state..."

if [ -f ".meta/sequential-validation-state.json" ]; then
    rm ".meta/sequential-validation-state.json"
    echo -e "${GREEN}  Removed .meta/sequential-validation-state.json${NC}"
    CLEANED+=("sequential-validation-state.json")
else
    echo -e "${DIM}  No sequential validation state file found${NC}"
fi

# Delete local validation branches
VALIDATION_BRANCHES=$(git branch --list 'validation-*' 2>/dev/null | sed 's/^[* ]*//')
if [ -n "$VALIDATION_BRANCHES" ]; then
    echo "$VALIDATION_BRANCHES" | while read -r BRANCH; do
        git branch -D "$BRANCH" 2>/dev/null || true
        echo -e "${GREEN}  Deleted branch: ${BRANCH}${NC}"
    done
    CLEANED+=("validation-* branches")
else
    echo -e "${DIM}  No validation branches found${NC}"
fi

# ─────────────────────────────────────────────────────────────
# Phase 7: Summary
# ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                  Reset Complete                            ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ ${#CLEANED[@]} -gt 0 ]; then
    echo -e "${CYAN}Cleaned:${NC}"
    for item in "${CLEANED[@]}"; do
        echo -e "  - ${item}"
    done
    echo ""
fi

if [ ${#NEW_SIDS[@]} -gt 0 ]; then
    echo -e "${CYAN}New SIDs in .env:${NC}"
    for sid in "${NEW_SIDS[@]}"; do
        echo -e "  ${GREEN}${sid}${NC}"
    done
    echo ""
fi

echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Re-source .env if running in a shell session"
echo "  2. Run 'npm run deploy:dev' to create a fresh serverless deployment"
echo "  3. Configure webhooks on phone numbers as needed"
echo ""
