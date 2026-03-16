#!/usr/bin/env bash
# ABOUTME: Lightweight environment diagnostic that detects shell vs .env conflicts.
# ABOUTME: Run after cloning to catch auth failures before they happen.

set -euo pipefail

# Colors (matching check-demo-health.sh pattern)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"

PASS=0
FAIL=0
WARN=0

check() {
    local name="$1"
    local result="$2"  # 0=pass, 1=fail, 2=warn
    local msg="${3:-}"

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

# Read a value from the .env file (ignores comments and blank lines)
# Always returns exit 0 — outputs empty string if key not found.
env_file_value() {
    local key="$1"
    local val
    val=$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | sed "s/^${key}=//" | sed 's/^"//' | sed 's/"$//' | sed "s/^'//" | sed "s/'$//") || true
    echo "$val"
}

# Mask a SID/token for display (first 6, last 4)
mask() {
    local val="$1"
    local len=${#val}
    if [ "$len" -gt 10 ]; then
        echo "${val:0:6}...${val: -4}"
    else
        echo "$val"
    fi
}

echo -e "${BOLD}Twilio Environment Doctor${NC}"
echo ""

# ─── Check 1: .env file exists ────────────────────────────────────────────
echo -e "${BOLD}1. Project .env${NC}"
if [ -f "$ENV_FILE" ]; then
    check ".env file exists" 0
else
    check ".env file exists" 1 "not found — run: cp .env.example .env"
    echo ""
    echo -e "${RED}Cannot continue without .env file.${NC}"
    exit 1
fi
echo ""

# ─── Check 2: Credential conflicts (shell vs .env) ────────────────────────
echo -e "${BOLD}2. Credential Conflicts${NC}"
echo -e "   ${DIM}Compares your current shell env vars against .env file values${NC}"
echo ""

CRITICAL_VARS=(TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_PHONE_NUMBER)

for var in "${CRITICAL_VARS[@]}"; do
    shell_val="${!var:-}"
    file_val=$(env_file_value "$var")

    if [ -n "$shell_val" ] && [ -n "$file_val" ]; then
        if [ "$shell_val" != "$file_val" ]; then
            check "$var MISMATCH" 1 "shell=$(mask "$shell_val") .env=$(mask "$file_val")"
            echo -e "    ${DIM}Shell value will override .env in MCP server and Claude Code${NC}"
            echo -e "    ${DIM}Fix: unset $var${NC}"
        else
            check "$var" 0
        fi
    elif [ -n "$shell_val" ] && [ -z "$file_val" ]; then
        check "$var" 2 "set in shell ($(mask "$shell_val")) but not in .env — shell value will be used"
    elif [ -z "$shell_val" ] && [ -n "$file_val" ]; then
        # Check if file value is still a placeholder
        if echo "$file_val" | grep -qE '^(ACx{30}|your_|SK)'; then
            check "$var" 2 ".env has placeholder value — update with real credentials"
        else
            check "$var" 0
        fi
    else
        check "$var" 1 "not set anywhere — add to .env"
    fi
done
echo ""

# ─── Check 3: Regional contamination ──────────────────────────────────────
echo -e "${BOLD}3. Regional Routing${NC}"
echo -e "   ${DIM}The Twilio SDK auto-reads TWILIO_REGION and TWILIO_EDGE from process.env${NC}"
echo ""

REGION_SHELL="${TWILIO_REGION:-}"
REGION_FILE=$(env_file_value "TWILIO_REGION")
EDGE_SHELL="${TWILIO_EDGE:-}"
EDGE_FILE=$(env_file_value "TWILIO_EDGE")

if [ -n "$REGION_SHELL" ] && [ -z "$REGION_FILE" ]; then
    check "TWILIO_REGION" 1 "set to '$REGION_SHELL' in shell but NOT in .env — all API calls will route to ${REGION_SHELL} endpoints"
    echo -e "    ${DIM}This causes 401 errors if your credentials are for US1 (default region)${NC}"
    echo -e "    ${DIM}Fix: unset TWILIO_REGION${NC}"
elif [ -n "$REGION_SHELL" ] && [ -n "$REGION_FILE" ] && [ "$REGION_SHELL" != "$REGION_FILE" ]; then
    check "TWILIO_REGION" 1 "shell='$REGION_SHELL' .env='$REGION_FILE' — mismatch"
elif [ -n "$REGION_SHELL" ]; then
    check "TWILIO_REGION" 2 "set to '$REGION_SHELL' — API calls will use regional endpoint"
else
    check "TWILIO_REGION" 0
fi

if [ -n "$EDGE_SHELL" ] && [ -z "$EDGE_FILE" ]; then
    check "TWILIO_EDGE" 1 "set to '$EDGE_SHELL' in shell but NOT in .env"
    echo -e "    ${DIM}Fix: unset TWILIO_EDGE${NC}"
elif [ -n "$EDGE_SHELL" ] && [ -n "$EDGE_FILE" ] && [ "$EDGE_SHELL" != "$EDGE_FILE" ]; then
    check "TWILIO_EDGE" 1 "shell='$EDGE_SHELL' .env='$EDGE_FILE' — mismatch"
elif [ -n "$EDGE_SHELL" ]; then
    check "TWILIO_EDGE" 2 "set to '$EDGE_SHELL' — API calls will use edge location"
else
    check "TWILIO_EDGE" 0
fi
echo ""

# ─── Check 4: API key auth conflicts ──────────────────────────────────────
echo -e "${BOLD}4. API Key Auth${NC}"

APIKEY_SHELL="${TWILIO_API_KEY:-}"
APIKEY_FILE=$(env_file_value "TWILIO_API_KEY")
APISECRET_SHELL="${TWILIO_API_SECRET:-}"
APISECRET_FILE=$(env_file_value "TWILIO_API_SECRET")

if [ -n "$APIKEY_SHELL" ] && [ -n "$APIKEY_FILE" ] && [ "$APIKEY_SHELL" != "$APIKEY_FILE" ]; then
    check "TWILIO_API_KEY" 1 "shell=$(mask "$APIKEY_SHELL") .env=$(mask "$APIKEY_FILE") — mismatch"
    echo -e "    ${DIM}Fix: unset TWILIO_API_KEY TWILIO_API_SECRET${NC}"
elif [ -n "$APIKEY_SHELL" ] && [ -z "$APIKEY_FILE" ]; then
    check "TWILIO_API_KEY" 2 "set in shell but not in .env — may authenticate against wrong account"
    echo -e "    ${DIM}Fix: unset TWILIO_API_KEY TWILIO_API_SECRET${NC}"
elif [ -n "$APIKEY_SHELL" ]; then
    check "TWILIO_API_KEY" 0
else
    check "TWILIO_API_KEY" 0
fi
echo ""

# ─── Check 5: direnv status ──────────────────────────────────────────────
echo -e "${BOLD}5. Environment Isolation${NC}"

if command -v direnv &>/dev/null; then
    if [ -f "$PROJECT_DIR/.envrc" ]; then
        # Check if direnv is allowed for this directory
        if direnv status 2>/dev/null | grep -q "Found RC allowed true"; then
            check "direnv active" 0
        else
            check "direnv" 2 ".envrc exists but not allowed — run: direnv allow"
        fi
    else
        check "direnv" 2 ".envrc not found — environment isolation disabled"
    fi
else
    # Distinguish conscious opt-out (bootstrap asked, user declined) from never-asked
    if [ -f "$ENV_FILE" ] && grep -q "DIRENV_OPTED_OUT=true" "$ENV_FILE" 2>/dev/null; then
        check "direnv" 2 "not installed (opted out during bootstrap) — shell vars can leak between projects"
    else
        check "direnv" 1 "not installed and never configured — credential conflicts likely"
        echo -e "    ${DIM}Install: brew install direnv${NC}"
        echo -e "    ${DIM}Then:    echo 'eval \"\$(direnv hook zsh)\"' >> ~/.zshrc && direnv allow${NC}"
        echo -e "    ${DIM}Or run ./scripts/bootstrap.sh to set up interactively${NC}"
    fi
fi
echo ""

# ─── Summary ──────────────────────────────────────────────────────────────
echo -e "${BOLD}Summary${NC}"
TOTAL=$((PASS + FAIL + WARN))
echo -e "  ${GREEN}$PASS passed${NC}  ${RED}$FAIL failed${NC}  ${YELLOW}$WARN warnings${NC}  (${TOTAL} checks)"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}Environment has conflicts that will cause auth failures.${NC}"
    echo ""
    echo -e "Quick fix (unset all inherited Twilio vars):"
    echo -e "  ${CYAN}unset TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_API_KEY TWILIO_API_SECRET TWILIO_REGION TWILIO_EDGE${NC}"
    echo ""
    echo -e "Permanent fix (direnv auto-isolates per project):"
    echo -e "  ${CYAN}brew install direnv && echo 'eval \"\$(direnv hook zsh)\"' >> ~/.zshrc && direnv allow${NC}"
    echo ""
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo -e "${YELLOW}Environment mostly clean — review warnings above.${NC}"
    exit 0
else
    echo -e "${GREEN}Environment clean!${NC}"
    exit 0
fi
