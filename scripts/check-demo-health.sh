#!/usr/bin/env bash
# ABOUTME: Pre-demo health check that verifies ngrok tunnel, local server, API keys,
# ABOUTME: and Twilio credentials before a live demo.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

PASS=0
FAIL=0
WARN=0

check() {
    local name="$1"
    local result="$2"  # 0=pass, 1=fail, 2=warn
    local msg="$3"

    if [ "$result" -eq 0 ]; then
        echo -e "  ${GREEN}✓${NC} $name"
        PASS=$((PASS + 1))
    elif [ "$result" -eq 2 ]; then
        echo -e "  ${YELLOW}⚠${NC} $name — $msg"
        WARN=$((WARN + 1))
    else
        echo -e "  ${RED}✗${NC} $name — $msg"
        FAIL=$((FAIL + 1))
    fi
}

echo -e "${BOLD}Demo Health Check${NC}"
echo ""

# 1. .env exists and has credentials
echo -e "${BOLD}Credentials${NC}"
if [ -f ".env" ]; then
    set -a; source .env; set +a
    check ".env file" 0 ""
else
    check ".env file" 1 "not found"
fi

[ -n "${TWILIO_ACCOUNT_SID:-}" ] && check "TWILIO_ACCOUNT_SID" 0 "" || check "TWILIO_ACCOUNT_SID" 1 "not set"
[ -n "${TWILIO_AUTH_TOKEN:-}" ] && check "TWILIO_AUTH_TOKEN" 0 "" || check "TWILIO_AUTH_TOKEN" 1 "not set"
[ -n "${TWILIO_PHONE_NUMBER:-}" ] && check "TWILIO_PHONE_NUMBER" 0 "" || check "TWILIO_PHONE_NUMBER" 1 "not set"
[ -n "${ANTHROPIC_API_KEY:-}" ] && check "ANTHROPIC_API_KEY" 0 "" || check "ANTHROPIC_API_KEY" 1 "not set (ConversationRelay needs this)"

echo ""

# 2. Local server
echo -e "${BOLD}Local Server${NC}"
if curl -s -o /dev/null -w "" "http://localhost:3000/voice/ivr-welcome" 2>/dev/null; then
    check "Local server (port 3000)" 0 ""
else
    check "Local server (port 3000)" 2 "not running — start with 'npm run demo'"
fi

echo ""

# 3. ngrok tunnel
echo -e "${BOLD}ngrok Tunnel${NC}"
NGROK_STATUS=$(curl -s "http://localhost:4040/api/tunnels" 2>/dev/null || echo "")
if [ -n "$NGROK_STATUS" ] && echo "$NGROK_STATUS" | python3 -c "import sys,json; t=json.load(sys.stdin).get('tunnels',[]); sys.exit(0 if t else 1)" 2>/dev/null; then
    NGROK_URL=$(echo "$NGROK_STATUS" | python3 -c "import sys,json; t=json.load(sys.stdin)['tunnels']; print(t[0]['public_url'])" 2>/dev/null || echo "unknown")
    check "ngrok tunnel active" 0 ""
    echo -e "    URL: $NGROK_URL"
else
    check "ngrok tunnel" 2 "not running — ConversationRelay will not work"
fi

echo ""

# 4. Twilio API connectivity
echo -e "${BOLD}Twilio API${NC}"
if [ -n "${TWILIO_API_KEY:-}" ] && [ -n "${TWILIO_API_SECRET:-}" ]; then
    REGION_FLAG=""
    [ -n "${TWILIO_REGION:-}" ] && REGION_FLAG=".${TWILIO_REGION}"
    API_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
        -u "${TWILIO_API_KEY}:${TWILIO_API_SECRET}" \
        "https://api${REGION_FLAG:+.${TWILIO_EDGE:-}${REGION_FLAG}}.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json" 2>/dev/null || echo "000")

    if [ "$API_CHECK" = "200" ]; then
        check "Twilio API (API key auth)" 0 ""
    else
        check "Twilio API (API key auth)" 1 "HTTP $API_CHECK — check API key/secret"
    fi
else
    API_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
        -u "${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}" \
        "https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json" 2>/dev/null || echo "000")

    if [ "$API_CHECK" = "200" ]; then
        check "Twilio API (auth token)" 0 ""
    else
        check "Twilio API (auth token)" 1 "HTTP $API_CHECK — check credentials"
    fi
fi

echo ""

# 5. Deployed functions
echo -e "${BOLD}Deployed Functions${NC}"
DEPLOYED_URL="${TWILIO_CALLBACK_BASE_URL:-}"
if [ -n "$DEPLOYED_URL" ]; then
    DEPLOY_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "${DEPLOYED_URL}/voice/ivr-welcome" 2>/dev/null || echo "000")
    if [ "$DEPLOY_CHECK" = "200" ]; then
        check "Deployed IVR endpoint" 0 ""
        echo -e "    URL: ${DEPLOYED_URL}/voice/ivr-welcome"
    else
        check "Deployed IVR endpoint" 1 "HTTP $DEPLOY_CHECK at ${DEPLOYED_URL}"
    fi
else
    check "TWILIO_CALLBACK_BASE_URL" 2 "not set — deployed functions unknown"
fi

echo ""

# Summary
echo -e "${BOLD}Summary${NC}"
TOTAL=$((PASS + FAIL + WARN))
echo -e "  ${GREEN}$PASS passed${NC}  ${RED}$FAIL failed${NC}  ${YELLOW}$WARN warnings${NC}  (${TOTAL} total)"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}Demo has issues — see failures above${NC}"
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo -e "${YELLOW}Demo mostly ready — see warnings above${NC}"
    exit 0
else
    echo -e "${GREEN}Demo ready!${NC}"
    exit 0
fi
