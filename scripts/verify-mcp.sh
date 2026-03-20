#!/usr/bin/env bash
# ABOUTME: Verify the MCP server can start with current credentials.
# ABOUTME: Checks dist build, .mcp.json config, env vars, and dry-run startup.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MCP_DIR="$PROJECT_DIR/agents/mcp-servers/twilio"
MCP_DIST="$MCP_DIR/dist/serve.js"
ENV_FILE="$PROJECT_DIR/.env"

PASS=0
FAIL=0

check() {
    local name="$1"
    local result="$2"
    local msg="${3:-}"

    if [ "$result" -eq 0 ]; then
        echo -e "  ${GREEN}✓${NC} $name"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}✗${NC} $name — $msg"
        FAIL=$((FAIL + 1))
    fi
}

echo -e "${BOLD}MCP Server Verification${NC}"
echo ""

# ─── Check 0: Node.js version ─────────────────────────────────────────
echo -e "${BOLD}0. Runtime${NC}"
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/' || echo "0")
if [ "$NODE_MAJOR" -eq 20 ] || [ "$NODE_MAJOR" -eq 22 ]; then
    check "Node.js $(node -v)" 0
elif [ "$NODE_MAJOR" -eq 0 ]; then
    check "Node.js" 1 "not found — install Node.js 22: brew install fnm && fnm install 22"
else
    check "Node.js $(node -v)" 1 "supported: 20.x, 22.x — use fnm or nvm to switch: fnm install 22 && fnm use 22"
fi
echo ""

# ─── Check 1: dist/serve.js exists ──────────────────────────────────────
echo -e "${BOLD}1. Build Artifacts${NC}"
if [ -f "$MCP_DIST" ]; then
    check "dist/serve.js exists" 0
else
    check "dist/serve.js exists" 1 "not found — run: cd agents/mcp-servers/twilio && npm install && npm run build"
fi

# Check index.js also exists (needed for dry-run)
if [ -f "$MCP_DIR/dist/index.js" ]; then
    check "dist/index.js exists" 0
else
    check "dist/index.js exists" 1 "not found — rebuild: cd agents/mcp-servers/twilio && npm run build"
fi
echo ""

# ─── Check 2: .mcp.json exists and is valid ─────────────────────────────
echo -e "${BOLD}2. MCP Configuration${NC}"
MCP_JSON="$PROJECT_DIR/.mcp.json"
if [ -f "$MCP_JSON" ]; then
    check ".mcp.json exists" 0
    if node -e "JSON.parse(require('fs').readFileSync('$MCP_JSON', 'utf8'))" 2>/dev/null; then
        check ".mcp.json is valid JSON" 0
    else
        check ".mcp.json is valid JSON" 1 "parse error — check file syntax"
    fi
    # Check for ${VAR} references to undefined env vars (kills MCP startup)
    UNDEFINED_VARS=""
    for VAR_REF in $(grep -oE '\$\{[A-Z_]+\}' "$MCP_JSON" 2>/dev/null | sort -u); do
        VAR_NAME=$(echo "$VAR_REF" | tr -d '${}')
        # Check both shell env and .env file
        SHELL_VAL="${!VAR_NAME:-}"
        FILE_VAL=$(grep -E "^${VAR_NAME}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"' | tr -d "'" || true)
        if [ -z "$SHELL_VAL" ] && [ -z "$FILE_VAL" ]; then
            UNDEFINED_VARS="${UNDEFINED_VARS} ${VAR_NAME}"
        fi
    done
    if [ -n "$UNDEFINED_VARS" ]; then
        check ".mcp.json env var references" 1 "undefined:${UNDEFINED_VARS} — MCP server will fail to start"
    else
        check ".mcp.json env var references" 0
    fi
else
    check ".mcp.json exists" 1 "not found — Claude Code cannot discover the MCP server"
fi
echo ""

# ─── Check 3: Critical env vars ─────────────────────────────────────────
echo -e "${BOLD}3. Environment Variables${NC}"
echo -e "   ${DIM}Checking .env for credentials the MCP server needs at startup${NC}"
echo ""

# Source .env if it exists (without overriding existing shell vars)
if [ -f "$ENV_FILE" ]; then
    check ".env file exists" 0
    # Read values from .env file directly
    FILE_SID=$(grep -E "^TWILIO_ACCOUNT_SID=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"' | tr -d "'" || true)
    FILE_TOKEN=$(grep -E "^TWILIO_AUTH_TOKEN=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"' | tr -d "'" || true)
    FILE_APIKEY=$(grep -E "^TWILIO_API_KEY=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"' | tr -d "'" || true)
    FILE_PHONE=$(grep -E "^TWILIO_PHONE_NUMBER=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"' | tr -d "'" || true)

    # Use env var if set, otherwise fall back to .env file value
    SID="${TWILIO_ACCOUNT_SID:-$FILE_SID}"
    TOKEN="${TWILIO_AUTH_TOKEN:-$FILE_TOKEN}"
    APIKEY="${TWILIO_API_KEY:-$FILE_APIKEY}"
    PHONE="${TWILIO_PHONE_NUMBER:-$FILE_PHONE}"
else
    check ".env file exists" 1 "not found — run: cp .env.example .env"
    SID="${TWILIO_ACCOUNT_SID:-}"
    TOKEN="${TWILIO_AUTH_TOKEN:-}"
    APIKEY="${TWILIO_API_KEY:-}"
    PHONE="${TWILIO_PHONE_NUMBER:-}"
fi

# Validate TWILIO_ACCOUNT_SID
if [ -n "$SID" ] && [[ "$SID" == AC* ]] && [ ${#SID} -eq 34 ]; then
    check "TWILIO_ACCOUNT_SID" 0
elif [ -n "$SID" ] && [[ "$SID" == ACx* ]]; then
    check "TWILIO_ACCOUNT_SID" 1 "still has placeholder value"
elif [ -z "$SID" ]; then
    check "TWILIO_ACCOUNT_SID" 1 "not set — add to .env"
else
    check "TWILIO_ACCOUNT_SID" 1 "invalid format (expected AC + 32 hex chars)"
fi

# Validate auth (token OR api key)
if [ -n "$TOKEN" ] && [ "$TOKEN" != "your_auth_token_here" ]; then
    check "Auth credentials" 0
elif [ -n "$APIKEY" ] && [[ "$APIKEY" == SK* ]]; then
    check "Auth credentials (API key)" 0
else
    check "Auth credentials" 1 "TWILIO_AUTH_TOKEN or TWILIO_API_KEY not set — add to .env"
fi

# Validate phone number (optional — server starts without it, but call/SMS tools need it)
if [ -n "$PHONE" ] && [[ "$PHONE" == +* ]] && [[ "$PHONE" != +1xxxxxxxxxx* ]]; then
    check "TWILIO_PHONE_NUMBER" 0
elif [ -z "$PHONE" ] || [[ "$PHONE" == +1xxxxxxxxxx* ]]; then
    echo -e "  ${YELLOW}⚠${NC} TWILIO_PHONE_NUMBER — not set (optional — tools that send SMS or make calls will need it)"
    WARN=${WARN:-0}
    WARN=$((WARN + 1))
fi
echo ""

# ─── Check 4: Dry-run startup ───────────────────────────────────────────
echo -e "${BOLD}4. Dry-Run Startup${NC}"
echo -e "   ${DIM}Attempts to construct the MCP server (no API calls)${NC}"
echo ""

if [ -f "$MCP_DIR/dist/index.js" ] && [ -n "$SID" ] && [ -n "${TOKEN:-${APIKEY:-}}" ]; then
    # Export the vars so Node can see them
    export TWILIO_ACCOUNT_SID="$SID"
    [ -n "$TOKEN" ] && export TWILIO_AUTH_TOKEN="$TOKEN"
    [ -n "$APIKEY" ] && export TWILIO_API_KEY="$APIKEY"
    [ -n "$PHONE" ] && export TWILIO_PHONE_NUMBER="$PHONE"

    DRYRUN_OUTPUT=$(cd "$PROJECT_DIR" && node -e "
        try {
            require('$MCP_DIR/dist/index.js').createTwilioMcpServer();
            console.log('OK');
        } catch(e) {
            console.error(e.message);
            process.exit(1);
        }
    " 2>&1) || true

    if [ "$DRYRUN_OUTPUT" = "OK" ]; then
        check "Server constructor succeeded" 0
    else
        check "Server constructor failed" 1 "$DRYRUN_OUTPUT"
    fi
else
    check "Dry-run startup" 1 "skipped — missing build artifacts or credentials"
fi
echo ""

# ─── Summary ──────────────────────────────────────────────────────────
echo -e "${BOLD}Summary${NC}"
TOTAL=$((PASS + FAIL))
echo -e "  ${GREEN}$PASS passed${NC}  ${RED}$FAIL failed${NC}  (${TOTAL} checks)"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}MCP server will not start correctly. Fix the issues above.${NC}"
    echo ""
    echo -e "Common fixes:"
    echo -e "  ${DIM}Build:  cd agents/mcp-servers/twilio && npm install && npm run build${NC}"
    echo -e "  ${DIM}Creds:  Edit .env with your Twilio Account SID and Auth Token${NC}"
    echo -e "  ${DIM}Reload: Exit Claude Code and relaunch after fixing${NC}"
    exit 1
else
    echo -e "${GREEN}MCP server is ready. Claude Code will discover it via .mcp.json.${NC}"
    exit 0
fi
