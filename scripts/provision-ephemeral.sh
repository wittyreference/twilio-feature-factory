#!/usr/bin/env bash
# ABOUTME: Create ephemeral Twilio resources for isolated validation runs.
# ABOUTME: Appends new SIDs to the specified env file for cleanup-ephemeral.sh to delete later.

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

ENV_FILE="${1:-.env}"
TIMESTAMP=$(date +%s)

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: Env file not found: ${ENV_FILE}${NC}" >&2
    exit 1
fi

# Source credentials from env file
set -a
source "$ENV_FILE"
set +a

if [ -z "${TWILIO_ACCOUNT_SID:-}" ] || [ -z "${TWILIO_AUTH_TOKEN:-}" ]; then
    echo -e "${RED}Error: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN required in ${ENV_FILE}${NC}" >&2
    exit 1
fi

AUTH="${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}"

echo -e "${CYAN}Provisioning ephemeral resources (prefix: validation-${TIMESTAMP})...${NC}"

# Track created SIDs for cleanup
EPHEMERAL_SIDS=""

# --- Sync Service ---
SYNC_JSON=$(curl -s -X POST "https://sync.twilio.com/v1/Services" \
    -u "$AUTH" \
    -d "FriendlyName=validation-sync-${TIMESTAMP}" \
    2>/dev/null || echo '{}')

SYNC_SID=$(echo "$SYNC_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sid',''))" 2>/dev/null || echo "")

if [ -n "$SYNC_SID" ] && [[ "$SYNC_SID" == IS* ]]; then
    echo -e "  ${GREEN}Sync service: ${SYNC_SID}${NC}"
    echo "TWILIO_SYNC_SERVICE_SID=${SYNC_SID}" >> "$ENV_FILE"
    EPHEMERAL_SIDS="${EPHEMERAL_SIDS}SYNC:${SYNC_SID},"
else
    echo -e "  ${RED}Failed to create Sync service${NC}" >&2
fi

# --- Verify Service (alpha-only FriendlyName to avoid 60200 error) ---
VERIFY_ALPHA_ID=$(echo "$TIMESTAMP" | md5 | tr '0-9' 'g-p' | head -c 8)
VERIFY_JSON=$(curl -s -X POST "https://verify.twilio.com/v2/Services" \
    -u "$AUTH" \
    -d "FriendlyName=validation-verify-${VERIFY_ALPHA_ID}" \
    -d "CodeLength=6" \
    2>/dev/null || echo '{}')

VERIFY_SID=$(echo "$VERIFY_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sid',''))" 2>/dev/null || echo "")

if [ -n "$VERIFY_SID" ] && [[ "$VERIFY_SID" == VA* ]]; then
    echo -e "  ${GREEN}Verify service: ${VERIFY_SID}${NC}"
    echo "TWILIO_VERIFY_SERVICE_SID=${VERIFY_SID}" >> "$ENV_FILE"
    EPHEMERAL_SIDS="${EPHEMERAL_SIDS}VERIFY:${VERIFY_SID},"
else
    echo -e "  ${RED}Failed to create Verify service${NC}" >&2
fi

# --- Messaging Service ---
MSG_JSON=$(curl -s -X POST "https://messaging.twilio.com/v1/Services" \
    -u "$AUTH" \
    -d "FriendlyName=validation-messaging-${TIMESTAMP}" \
    2>/dev/null || echo '{}')

MESSAGING_SID=$(echo "$MSG_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sid',''))" 2>/dev/null || echo "")

if [ -n "$MESSAGING_SID" ] && [[ "$MESSAGING_SID" == MG* ]]; then
    echo -e "  ${GREEN}Messaging service: ${MESSAGING_SID}${NC}"
    echo "TWILIO_MESSAGING_SERVICE_SID=${MESSAGING_SID}" >> "$ENV_FILE"
    EPHEMERAL_SIDS="${EPHEMERAL_SIDS}MESSAGING:${MESSAGING_SID},"
else
    echo -e "  ${RED}Failed to create Messaging service${NC}" >&2
fi

# --- TaskRouter Workspace (cascading: includes queue + workflow) ---
WS_JSON=$(curl -s -X POST "https://taskrouter.twilio.com/v1/Workspaces" \
    -u "$AUTH" \
    -d "FriendlyName=validation-workspace-${TIMESTAMP}" \
    2>/dev/null || echo '{}')

WORKSPACE_SID=$(echo "$WS_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sid',''))" 2>/dev/null || echo "")

if [ -n "$WORKSPACE_SID" ] && [[ "$WORKSPACE_SID" == WS* ]]; then
    echo -e "  ${GREEN}TaskRouter workspace: ${WORKSPACE_SID}${NC}"
    echo "TWILIO_TASKROUTER_WORKSPACE_SID=${WORKSPACE_SID}" >> "$ENV_FILE"
    EPHEMERAL_SIDS="${EPHEMERAL_SIDS}WORKSPACE:${WORKSPACE_SID},"
else
    echo -e "  ${RED}Failed to create TaskRouter workspace${NC}" >&2
fi

# Write ephemeral SID manifest for cleanup
echo "# Ephemeral resources created by provision-ephemeral.sh at $(date -Iseconds)" >> "$ENV_FILE"
echo "EPHEMERAL_SIDS=${EPHEMERAL_SIDS}" >> "$ENV_FILE"

echo -e "${CYAN}Ephemeral provisioning complete.${NC}"
