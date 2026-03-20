#!/usr/bin/env bash
# ABOUTME: Delete ephemeral Twilio resources created by provision-ephemeral.sh.
# ABOUTME: Reads EPHEMERAL_SIDS from the specified env file and deletes each resource.

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${DIM}No env file at ${ENV_FILE} — nothing to clean up${NC}"
    exit 0
fi

# Source credentials
set -a
source "$ENV_FILE"
set +a

if [ -z "${TWILIO_ACCOUNT_SID:-}" ] || [ -z "${TWILIO_AUTH_TOKEN:-}" ]; then
    echo -e "${RED}Error: Credentials not found in ${ENV_FILE}${NC}" >&2
    exit 1
fi

AUTH="${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}"

if [ -z "${EPHEMERAL_SIDS:-}" ]; then
    echo -e "${DIM}No EPHEMERAL_SIDS found in ${ENV_FILE} — nothing to clean up${NC}"
    exit 0
fi

echo -e "${CYAN}Cleaning up ephemeral resources...${NC}"

CLEANED=0
FAILED=0

# Parse comma-separated TYPE:SID pairs
IFS=',' read -ra SID_PAIRS <<< "$EPHEMERAL_SIDS"
for pair in "${SID_PAIRS[@]}"; do
    [ -z "$pair" ] && continue

    TYPE="${pair%%:*}"
    SID="${pair#*:}"
    [ -z "$SID" ] && continue

    case "$TYPE" in
        SYNC)
            echo -e "  Deleting Sync service ${SID}..."
            if curl -s -X DELETE "https://sync.twilio.com/v1/Services/${SID}" -u "$AUTH" > /dev/null 2>&1; then
                echo -e "  ${GREEN}Deleted${NC}"
                CLEANED=$((CLEANED + 1))
            else
                echo -e "  ${RED}Failed to delete Sync service ${SID}${NC}"
                FAILED=$((FAILED + 1))
            fi
            ;;
        VERIFY)
            echo -e "  Deleting Verify service ${SID}..."
            if curl -s -X DELETE "https://verify.twilio.com/v2/Services/${SID}" -u "$AUTH" > /dev/null 2>&1; then
                echo -e "  ${GREEN}Deleted${NC}"
                CLEANED=$((CLEANED + 1))
            else
                echo -e "  ${RED}Failed to delete Verify service ${SID}${NC}"
                FAILED=$((FAILED + 1))
            fi
            ;;
        MESSAGING)
            echo -e "  Deleting Messaging service ${SID}..."
            if curl -s -X DELETE "https://messaging.twilio.com/v1/Services/${SID}" -u "$AUTH" > /dev/null 2>&1; then
                echo -e "  ${GREEN}Deleted${NC}"
                CLEANED=$((CLEANED + 1))
            else
                echo -e "  ${RED}Failed to delete Messaging service ${SID}${NC}"
                FAILED=$((FAILED + 1))
            fi
            ;;
        WORKSPACE)
            echo -e "  Deleting TaskRouter workspace ${SID} (cascades queue + workflow)..."
            if curl -s -X DELETE "https://taskrouter.twilio.com/v1/Workspaces/${SID}" -u "$AUTH" > /dev/null 2>&1; then
                echo -e "  ${GREEN}Deleted${NC}"
                CLEANED=$((CLEANED + 1))
            else
                echo -e "  ${RED}Failed to delete TaskRouter workspace ${SID}${NC}"
                FAILED=$((FAILED + 1))
            fi
            ;;
        *)
            echo -e "  ${DIM}Unknown resource type: ${TYPE} (SID: ${SID})${NC}"
            ;;
    esac
done

echo -e "${CYAN}Cleanup complete: ${CLEANED} deleted, ${FAILED} failed${NC}"

if [ $FAILED -gt 0 ]; then
    exit 1
fi
