#!/usr/bin/env bash
# ABOUTME: One-command demo launcher that starts local server with ngrok, verifies
# ABOUTME: environment, and prints a formatted banner with all demo URLs.

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

# ─── Preflight checks ───────────────────────────────────────────────

echo -e "${BOLD}Preflight checks...${NC}"

# Check .env exists
if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: .env file not found${NC}"
    echo "Run 'npm run setup' to configure credentials."
    exit 1
fi

# Source .env
set -a
source .env
set +a

# Verify critical env vars
MISSING=()
[ -z "${TWILIO_ACCOUNT_SID:-}" ] && MISSING+=("TWILIO_ACCOUNT_SID")
[ -z "${TWILIO_AUTH_TOKEN:-}" ] && MISSING+=("TWILIO_AUTH_TOKEN")
[ -z "${TWILIO_PHONE_NUMBER:-}" ] && MISSING+=("TWILIO_PHONE_NUMBER")

if [ ${#MISSING[@]} -gt 0 ]; then
    echo -e "${RED}ERROR: Missing required env vars: ${MISSING[*]}${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Credentials configured"

# Check Twilio CLI
if ! command -v twilio &> /dev/null; then
    echo -e "${RED}ERROR: Twilio CLI not installed${NC}"
    echo "Install: npm install -g twilio-cli"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Twilio CLI available"

# Check serverless plugin
if ! twilio plugins 2>/dev/null | grep -q "serverless"; then
    echo -e "${YELLOW}WARNING: Serverless plugin may not be installed${NC}"
    echo "Install: twilio plugins:install @twilio-labs/plugin-serverless"
fi

# Verify CLI profile matches .env
CLI_ACCOUNT=$(twilio profiles:list -o json 2>/dev/null | python3 -c "
import sys, json
profiles = json.load(sys.stdin)
for p in profiles:
    if p.get('active'):
        print(p.get('accountSid', ''))
        break
" 2>/dev/null || echo "unknown")

if [ "$CLI_ACCOUNT" != "$TWILIO_ACCOUNT_SID" ]; then
    echo -e "${YELLOW}WARNING: CLI profile account ($CLI_ACCOUNT) differs from .env ($TWILIO_ACCOUNT_SID)${NC}"
    echo "  This may be expected if using API key auth."
fi
echo -e "  ${GREEN}✓${NC} CLI profile checked"

echo ""

# ─── Start server ────────────────────────────────────────────────────

echo -e "${BOLD}Starting server with ngrok tunnel...${NC}"
echo ""

# Kill any existing serverless process on port 3000
if lsof -ti:3000 &>/dev/null; then
    echo -e "${YELLOW}Port 3000 in use — stopping existing process${NC}"
    kill $(lsof -ti:3000) 2>/dev/null || true
    sleep 1
fi

# Start server in background, capture output
LOG_FILE=$(mktemp /tmp/twilio-demo-XXXXXX.log)
twilio serverless:start --ngrok 2>&1 | tee "$LOG_FILE" &
SERVER_PID=$!

# Cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down demo server...${NC}"
    kill $SERVER_PID 2>/dev/null || true
    rm -f "$LOG_FILE"
    echo -e "${GREEN}Done.${NC}"
}
trap cleanup EXIT SIGINT SIGTERM

# Wait for server to be ready
echo -n "  Waiting for server"
READY=false
for i in $(seq 1 30); do
    if curl -s -o /dev/null -w "" "http://localhost:3000/voice/ivr-welcome" 2>/dev/null; then
        READY=true
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

if [ "$READY" != "true" ]; then
    echo -e "${RED}ERROR: Server did not start within 30 seconds${NC}"
    echo "Check output above for errors."
    exit 1
fi

# Extract ngrok URL from log output
sleep 2  # Give ngrok a moment to register
NGROK_URL=""
for i in $(seq 1 10); do
    NGROK_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.ngrok[a-zA-Z0-9.-]*\.[a-z]+' "$LOG_FILE" | head -1 || true)
    if [ -n "$NGROK_URL" ]; then
        break
    fi
    sleep 1
done

if [ -z "$NGROK_URL" ]; then
    NGROK_URL="(ngrok URL not detected — check server output)"
fi

# ─── Print banner ────────────────────────────────────────────────────

DEPLOYED_URL="${TWILIO_CALLBACK_BASE_URL:-https://prototype-2617-dev.sydney.au1.twil.io}"

echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}   TWILIO FEATURE FACTORY — DEMO READY${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Local:${NC}     http://localhost:3000"
echo -e "  ${BOLD}Tunnel:${NC}    ${NGROK_URL}"
echo -e "  ${BOLD}Deployed:${NC}  ${DEPLOYED_URL}"
echo ""
echo -e "${BOLD}${BLUE}  DEMO ENDPOINTS${NC}"
echo -e "  ┌─────────────────────────────┬──────────────────────────────────────────┐"
echo -e "  │ ${BOLD}Feature${NC}                     │ ${BOLD}Local URL${NC}                                │"
echo -e "  ├─────────────────────────────┼──────────────────────────────────────────┤"
echo -e "  │ Voice IVR                   │ /voice/ivr-welcome                       │"
echo -e "  │ Incoming SMS                │ /messaging/incoming-sms                  │"
echo -e "  │ Outbound Dialer             │ /voice/outbound-dialer                   │"
echo -e "  │ ConversationRelay AI        │ /conversation-relay/ai-assistant-inbound │"
echo -e "  │ Contact Center              │ /taskrouter/contact-center-welcome       │"
echo -e "  │ Voice SDK Token             │ /voice/token                             │"
echo -e "  │ Verification (start)        │ /verify/start-verification               │"
echo -e "  │ Verification (check)        │ /verify/check-verification               │"
echo -e "  └─────────────────────────────┴──────────────────────────────────────────┘"
echo ""
echo -e "  ${BOLD}Phone Number:${NC}  ${TWILIO_PHONE_NUMBER}"
echo ""
echo -e "${BOLD}${BLUE}  QUICK DEMOS${NC}"
echo -e "  ${GREEN}Voice IVR:${NC}        Call ${TWILIO_PHONE_NUMBER}"
echo -e "  ${GREEN}SMS:${NC}              Text ${TWILIO_PHONE_NUMBER}"
echo -e "  ${GREEN}AI Voice:${NC}         Call ${TWILIO_PHONE_NUMBER} (needs ConversationRelay webhook)"
echo ""
echo -e "${BOLD}${BLUE}  MCP TOOLS${NC}"
echo -e "  310 tools available in Claude Code via MCP server"
echo -e "  Quick test: ${CYAN}validate_call${NC}, ${CYAN}validate_message${NC}, ${CYAN}send_sms${NC}"
echo ""
echo -e "  ${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Keep running until interrupted
wait $SERVER_PID
