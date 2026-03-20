#!/usr/bin/env bash
# ABOUTME: Complete post-clone setup wizard — checks prerequisites, configures credentials,
# ABOUTME: provisions Twilio resources, verifies MCP server, and confirms environment readiness.

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Flags
CHECK_ONLY=false
NON_INTERACTIVE=false
SKIP_PROVISIONING=false

for arg in "$@"; do
    case "$arg" in
        --check-only) CHECK_ONLY=true ;;
        --non-interactive) NON_INTERACTIVE=true ;;
        --skip-provisioning) SKIP_PROVISIONING=true ;;
        --help|-h)
            echo "Usage: $0 [--check-only] [--non-interactive] [--skip-provisioning]"
            echo ""
            echo "Complete setup wizard for Twilio Feature Factory."
            echo ""
            echo "  --check-only         Dry run: check everything, change nothing"
            echo "  --non-interactive    Read all values from env vars (for CI/validation)"
            echo "  --skip-provisioning  Skip Twilio resource creation (Sync, Verify, etc.)"
            echo ""
            echo "Environment variables for --non-interactive mode:"
            echo "  TWILIO_ACCOUNT_SID    Required"
            echo "  TWILIO_AUTH_TOKEN     Required"
            echo "  TWILIO_PHONE_NUMBER   Optional (will use existing if set)"
            echo "  TEST_PHONE_NUMBER     Optional (your personal number for smoke tests)"
            exit 0
            ;;
    esac
done

PASS=0
FAIL=0
WARN=0
TOTAL=0

check_pass() {
    local name="$1"
    TOTAL=$((TOTAL + 1))
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}PASS${NC} $name"
}

check_fail() {
    local name="$1"
    local fix="${2:-}"
    TOTAL=$((TOTAL + 1))
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}FAIL${NC} $name"
    if [ -n "$fix" ]; then
        echo -e "       ${DIM}fix: $fix${NC}"
    fi
}

check_warn() {
    local name="$1"
    local note="${2:-}"
    TOTAL=$((TOTAL + 1))
    WARN=$((WARN + 1))
    echo -e "  ${YELLOW}WARN${NC} $name"
    if [ -n "$note" ]; then
        echo -e "       ${DIM}$note${NC}"
    fi
}

check_install() {
    local name="$1"
    local cmd="$2"
    TOTAL=$((TOTAL + 1))
    if $CHECK_ONLY; then
        FAIL=$((FAIL + 1))
        echo -e "  ${YELLOW}NEED${NC} $name"
        echo -e "       ${DIM}install: $cmd${NC}"
        return 1
    fi
    echo -e "  ${CYAN}INST${NC} $name — installing..."
    if eval "$cmd" > /dev/null 2>&1; then
        PASS=$((PASS + 1))
        echo -e "  ${GREEN}PASS${NC} $name (installed)"
    else
        FAIL=$((FAIL + 1))
        echo -e "  ${RED}FAIL${NC} $name — install failed"
        echo -e "       ${DIM}run manually: $cmd${NC}"
        return 1
    fi
}

prompt_value() {
    local prompt_text="$1"
    local var_name="$2"
    local hide="${3:-false}"

    if $NON_INTERACTIVE; then
        # Value must already be in env
        return
    fi

    if [ "$hide" = "true" ]; then
        echo -n "$prompt_text"
        read -rs value
        echo ""
        eval "$var_name=\"\$value\""
    else
        echo -n "$prompt_text"
        read -r value
        eval "$var_name=\"\$value\""
    fi
}

# ─────────────────────────────────────────────────────────
# Resolve project root
# ─────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║      Twilio Feature Factory — Bootstrap                   ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if $CHECK_ONLY; then
    echo -e "${DIM}Running in check-only mode (no changes will be made)${NC}"
    echo ""
fi

# ─────────────────────────────────────────────────────────
# Phase 1: Prerequisites
# ─────────────────────────────────────────────────────────
echo -e "${BOLD}Phase 1: Prerequisites${NC}"
echo ""

# Node.js version-switching helpers (used by check below)
ensure_node_version() {
    local target="22"
    if command -v fnm > /dev/null 2>&1; then
        fnm install "$target" > /dev/null 2>&1 && fnm use "$target" > /dev/null 2>&1
        return $?
    elif command -v nvm > /dev/null 2>&1; then
        nvm install "$target" > /dev/null 2>&1 && nvm use "$target" > /dev/null 2>&1
        return $?
    fi
    return 1
}

install_fnm() {
    if ! command -v brew > /dev/null 2>&1; then
        return 1
    fi
    brew install fnm > /dev/null 2>&1 || return 1
    # Add shell hook
    local shell_rc=""
    if [ -f "$HOME/.zshrc" ]; then
        shell_rc="$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then
        shell_rc="$HOME/.bashrc"
    fi
    if [ -n "$shell_rc" ] && ! grep -q "fnm env" "$shell_rc" 2>/dev/null; then
        echo "" >> "$shell_rc"
        echo "# fnm — fast Node.js version manager" >> "$shell_rc"
        echo 'eval "$(fnm env --use-on-cd --shell '"'"'"$(basename "$SHELL")"'"'"')"' >> "$shell_rc"
    fi
    eval "$(fnm env --use-on-cd --shell "$(basename "$SHELL")")" 2>/dev/null || true
    fnm install 22 > /dev/null 2>&1 && fnm use 22 > /dev/null 2>&1
    return $?
}

# 1. Node.js (pinned to 22 via .node-version)
if command -v node > /dev/null 2>&1; then
    NODE_VERSION=$(node --version | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
    if [ "$NODE_MAJOR" -eq 20 ] || [ "$NODE_MAJOR" -eq 22 ]; then
        check_pass "Node.js $NODE_VERSION"
    else
        # Wrong version — attempt auto-switch
        if ! $CHECK_ONLY && ensure_node_version; then
            NODE_VERSION=$(node --version | sed 's/v//')
            check_pass "Node.js $NODE_VERSION (auto-switched from v${NODE_MAJOR})"
        elif ! $CHECK_ONLY && ! $NON_INTERACTIVE; then
            echo -e "  ${YELLOW}WARN${NC} Node.js $NODE_VERSION (need 20.x or 22.x)"
            echo -n "  Install fnm (fast Node manager) to auto-switch? [Y/n] "
            read -r install_fnm_answer
            if [[ -z "$install_fnm_answer" ]] || [[ "$install_fnm_answer" =~ ^[Yy] ]]; then
                if install_fnm; then
                    NODE_VERSION=$(node --version | sed 's/v//')
                    check_pass "Node.js $NODE_VERSION (fnm installed, auto-switched)"
                else
                    check_fail "fnm installation failed" "Install manually: brew install fnm && fnm install 22 && fnm use 22"
                fi
            else
                check_fail "Node.js $NODE_VERSION (need 20.x or 22.x)" "fnm install 22 && fnm use 22"
            fi
        elif ! $CHECK_ONLY && $NON_INTERACTIVE; then
            # Non-interactive: try harder — install fnm if brew available
            if install_fnm; then
                NODE_VERSION=$(node --version | sed 's/v//')
                check_pass "Node.js $NODE_VERSION (fnm auto-installed)"
            else
                check_fail "Node.js $NODE_VERSION (need 20.x or 22.x)" "Install fnm: brew install fnm && fnm install 22"
            fi
        else
            check_fail "Node.js $NODE_VERSION (need 20.x or 22.x)" "Install fnm: brew install fnm && fnm install 22"
        fi
    fi
else
    if ! $CHECK_ONLY && ! $NON_INTERACTIVE; then
        echo -e "  ${RED}FAIL${NC} Node.js not found"
        echo -n "  Install fnm (fast Node manager) to get Node 22? [Y/n] "
        read -r install_fnm_answer
        if [[ -z "$install_fnm_answer" ]] || [[ "$install_fnm_answer" =~ ^[Yy] ]]; then
            if install_fnm; then
                NODE_VERSION=$(node --version | sed 's/v//')
                check_pass "Node.js $NODE_VERSION (fnm installed)"
            else
                check_fail "Node.js not found" "Install fnm: brew install fnm && fnm install 22"
            fi
        else
            check_fail "Node.js not found" "Install from https://nodejs.org or: brew install fnm && fnm install 22"
        fi
    else
        check_fail "Node.js not found" "Install fnm: brew install fnm && fnm install 22"
    fi
fi

# 2. npm
if command -v npm > /dev/null 2>&1; then
    NPM_VERSION=$(npm --version)
    check_pass "npm $NPM_VERSION"
else
    check_fail "npm not found" "Comes with Node.js"
fi

# 3. git
if command -v git > /dev/null 2>&1; then
    check_pass "git $(git --version | awk '{print $3}')"
else
    check_fail "git not found" "Install from https://git-scm.com"
fi

# 4. Twilio CLI
if command -v twilio > /dev/null 2>&1; then
    TWILIO_VERSION=$(twilio --version 2>/dev/null | head -1 || echo "unknown")
    check_pass "Twilio CLI ($TWILIO_VERSION)"
else
    check_install "Twilio CLI" "npm install -g twilio-cli" || true
fi

# 5. Twilio Serverless plugin
if command -v twilio > /dev/null 2>&1; then
    if twilio plugins 2>/dev/null | grep -q "@twilio-labs/plugin-serverless"; then
        check_pass "Twilio Serverless plugin"
    else
        check_install "Twilio Serverless plugin" "twilio plugins:install @twilio-labs/plugin-serverless" || true
    fi
else
    check_warn "Twilio Serverless plugin (CLI not installed yet)"
fi

# 6. direnv — checked in Phase 4 (Environment Isolation)
#    Not a blocking prerequisite, but critical for credential safety

# 7. jq
if command -v jq > /dev/null 2>&1; then
    check_pass "jq"
else
    check_warn "jq not installed" "Some hooks use jq. Install: brew install jq"
fi

# 8. Claude Code
if command -v claude > /dev/null 2>&1; then
    check_pass "Claude Code"
else
    check_warn "Claude Code not found" "Install from https://claude.ai/download"
fi

echo ""

# In non-check mode, stop if blocking prerequisites failed
if [ $FAIL -gt 0 ] && ! $CHECK_ONLY; then
    echo -e "${BOLD}Phase 1: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$WARN warnings${NC}"
    echo ""
    echo -e "Fix the failures above and re-run ${CYAN}./scripts/bootstrap.sh${NC}"
    exit 1
fi

# ─────────────────────────────────────────────────────────
# Phase 2: Dependencies & MCP Server
# ─────────────────────────────────────────────────────────
echo -e "${BOLD}Phase 2: Dependencies${NC}"
echo ""

if [ -d "node_modules" ]; then
    check_pass "node_modules/ exists"
else
    if $CHECK_ONLY; then
        check_fail "node_modules/ missing" "Run: npm install"
    else
        echo -e "  ${CYAN}INST${NC} Running npm install..."
        if npm install 2>&1 | tail -3; then
            check_pass "npm install"
        else
            check_fail "npm install failed" "Check output above for errors"
        fi
    fi
fi

# MCP server build
MCP_DIST="agents/mcp-servers/twilio/dist/serve.js"
if [ -f "$MCP_DIST" ]; then
    check_pass "MCP server built ($MCP_DIST)"
else
    if $CHECK_ONLY; then
        check_fail "MCP server not built" "Run: cd agents/mcp-servers/twilio && npm run build"
    else
        echo -e "  ${CYAN}INST${NC} Building MCP server..."
        if (cd agents/mcp-servers/twilio && npm install && npm run build) 2>&1 | tail -3; then
            if [ -f "$MCP_DIST" ]; then
                check_pass "MCP server built"
            else
                check_fail "MCP server build produced no output" "Run manually: cd agents/mcp-servers/twilio && npm run build"
            fi
        else
            check_fail "MCP server build failed" "Run manually: cd agents/mcp-servers/twilio && npm run build"
        fi
    fi
fi

# .mcp.json exists (Claude Code auto-discovers this)
if [ -f ".mcp.json" ]; then
    check_pass ".mcp.json present (Claude Code auto-discovers MCP server)"
else
    check_fail ".mcp.json missing" "This file should exist in the repo — re-clone or restore from git"
fi

echo ""

# ─────────────────────────────────────────────────────────
# Phase 3: Credentials
# ─────────────────────────────────────────────────────────
echo -e "${BOLD}Phase 3: Credentials${NC}"
echo ""

# Create .env from template if needed
if [ -f ".env" ]; then
    check_pass ".env file exists"
else
    if $CHECK_ONLY; then
        check_fail ".env file missing" "Run: cp .env.example .env"
    else
        if [ -f ".env.example" ]; then
            cp .env.example .env
            check_pass ".env created from template"
        else
            check_fail ".env.example not found" "This file should exist in the repo"
        fi
    fi
fi

# Load existing env
if [ -f ".env" ]; then
    # shellcheck disable=SC1091
    set -a && source .env && set +a
fi

# Check/collect Account SID
ACCOUNT_SID="${TWILIO_ACCOUNT_SID:-}"
if [ -z "$ACCOUNT_SID" ] || [[ "$ACCOUNT_SID" == ACxxxx* ]]; then
    if $CHECK_ONLY || $NON_INTERACTIVE; then
        check_fail "TWILIO_ACCOUNT_SID not configured" "Add to .env or export before running"
    else
        echo -e "  ${YELLOW}NEED${NC} TWILIO_ACCOUNT_SID"
        echo -e "       ${DIM}Find at https://console.twilio.com/${NC}"
        prompt_value "  Account SID: " ACCOUNT_SID
        if [ -n "$ACCOUNT_SID" ]; then
            sed -i '' "s|^TWILIO_ACCOUNT_SID=.*|TWILIO_ACCOUNT_SID=$ACCOUNT_SID|" .env 2>/dev/null || \
                echo "TWILIO_ACCOUNT_SID=$ACCOUNT_SID" >> .env
            export TWILIO_ACCOUNT_SID="$ACCOUNT_SID"
            check_pass "TWILIO_ACCOUNT_SID saved to .env"
        else
            check_fail "TWILIO_ACCOUNT_SID not provided"
        fi
    fi
else
    check_pass "TWILIO_ACCOUNT_SID configured (${ACCOUNT_SID:0:10}...)"
fi

# Check/collect Auth Token
AUTH_TOKEN="${TWILIO_AUTH_TOKEN:-}"
if [ -z "$AUTH_TOKEN" ] || [ "$AUTH_TOKEN" = "your_auth_token_here" ]; then
    if $CHECK_ONLY || $NON_INTERACTIVE; then
        check_fail "TWILIO_AUTH_TOKEN not configured" "Add to .env or export before running"
    else
        echo -e "  ${YELLOW}NEED${NC} TWILIO_AUTH_TOKEN"
        prompt_value "  Auth Token (hidden): " AUTH_TOKEN true
        if [ -n "$AUTH_TOKEN" ]; then
            sed -i '' "s|^TWILIO_AUTH_TOKEN=.*|TWILIO_AUTH_TOKEN=$AUTH_TOKEN|" .env 2>/dev/null || \
                echo "TWILIO_AUTH_TOKEN=$AUTH_TOKEN" >> .env
            export TWILIO_AUTH_TOKEN="$AUTH_TOKEN"
            check_pass "TWILIO_AUTH_TOKEN saved to .env"
        else
            check_fail "TWILIO_AUTH_TOKEN not provided"
        fi
    fi
else
    check_pass "TWILIO_AUTH_TOKEN configured"
fi

# Validate credentials with Twilio API
ACCOUNT_SID="${TWILIO_ACCOUNT_SID:-}"
AUTH_TOKEN="${TWILIO_AUTH_TOKEN:-}"
if [ -n "$ACCOUNT_SID" ] && [ -n "$AUTH_TOKEN" ] && [[ "$ACCOUNT_SID" != ACxxxx* ]] && [ "$AUTH_TOKEN" != "your_auth_token_here" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -u "$ACCOUNT_SID:$AUTH_TOKEN" \
        "https://api.twilio.com/2010-04-01/Accounts/$ACCOUNT_SID.json" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        check_pass "Twilio API reachable (HTTP $HTTP_CODE)"
    elif [ "$HTTP_CODE" = "401" ]; then
        check_fail "Twilio credentials invalid (HTTP 401)" "Verify SID and token at console.twilio.com"
    elif [ "$HTTP_CODE" = "000" ]; then
        check_warn "Could not reach Twilio API" "Check your internet connection"
    else
        check_fail "Twilio API returned HTTP $HTTP_CODE" "Check credentials"
    fi
else
    if ! $CHECK_ONLY; then
        check_warn "Skipping API validation (credentials not fully configured)"
    fi
fi

# Check phone number
PHONE_NUMBER="${TWILIO_PHONE_NUMBER:-}"
if [ -z "$PHONE_NUMBER" ] || [[ "$PHONE_NUMBER" == +1xxxxxxxxxx* ]] || [[ "$PHONE_NUMBER" == "+15551234567" ]]; then
    if $CHECK_ONLY; then
        check_fail "TWILIO_PHONE_NUMBER not configured" "Add a Twilio phone number to .env"
    elif $NON_INTERACTIVE; then
        check_warn "TWILIO_PHONE_NUMBER not configured" "Will need manual configuration"
    else
        echo -e "  ${YELLOW}NEED${NC} TWILIO_PHONE_NUMBER"
        echo -e "       ${DIM}Enter your Twilio phone number in E.164 format (+1XXXXXXXXXX)${NC}"
        echo -e "       ${DIM}Don't have one? The provisioning step can purchase one for you.${NC}"
        prompt_value "  Phone Number (or press Enter to skip): " PHONE_NUMBER
        if [ -n "$PHONE_NUMBER" ]; then
            sed -i '' "s|^TWILIO_PHONE_NUMBER=.*|TWILIO_PHONE_NUMBER=$PHONE_NUMBER|" .env 2>/dev/null || \
                echo "TWILIO_PHONE_NUMBER=$PHONE_NUMBER" >> .env
            export TWILIO_PHONE_NUMBER="$PHONE_NUMBER"
            check_pass "TWILIO_PHONE_NUMBER saved to .env"
        else
            check_warn "TWILIO_PHONE_NUMBER skipped" "Provisioning step can purchase one"
        fi
    fi
else
    check_pass "TWILIO_PHONE_NUMBER configured ($PHONE_NUMBER)"
fi

echo ""

# ─────────────────────────────────────────────────────────
# Phase 4: Environment Isolation
# ─────────────────────────────────────────────────────────
echo -e "${BOLD}Phase 4: Environment Isolation${NC}"
echo ""

if command -v direnv > /dev/null 2>&1; then
    if [ -f ".envrc" ]; then
        if ! $CHECK_ONLY; then
            direnv allow . 2>/dev/null || true
        fi
        check_pass "direnv configured (.envrc present and allowed)"
    else
        check_warn ".envrc missing" "Expected in repo root"
    fi
else
    echo ""
    echo -e "  ${YELLOW}${BOLD}┌──────────────────────────────────────────────────────────┐${NC}"
    echo -e "  ${YELLOW}${BOLD}│  direnv is NOT installed                                 │${NC}"
    echo -e "  ${YELLOW}${BOLD}│                                                          │${NC}"
    echo -e "  ${YELLOW}${BOLD}│${NC}  Without direnv, shell env vars from other Twilio${YELLOW}${BOLD}        │${NC}"
    echo -e "  ${YELLOW}${BOLD}│${NC}  projects WILL silently override your .env file.${YELLOW}${BOLD}         │${NC}"
    echo -e "  ${YELLOW}${BOLD}│${NC}  This causes auth failures and wrong-account bugs.${YELLOW}${BOLD}       │${NC}"
    echo -e "  ${YELLOW}${BOLD}└──────────────────────────────────────────────────────────┘${NC}"
    echo ""
    if ! $CHECK_ONLY && ! $NON_INTERACTIVE; then
        echo -n "  Install direnv now? (brew install direnv) [Y/n] "
        read -r install_direnv
        if [[ -z "$install_direnv" ]] || [[ "$install_direnv" =~ ^[Yy] ]]; then
            echo -e "  ${CYAN}INST${NC} Installing direnv..."
            if brew install direnv 2>&1 | tail -3; then
                # Detect shell and add hook
                SHELL_RC=""
                if [ -f "$HOME/.zshrc" ]; then
                    SHELL_RC="$HOME/.zshrc"
                elif [ -f "$HOME/.bashrc" ]; then
                    SHELL_RC="$HOME/.bashrc"
                fi
                if [ -n "$SHELL_RC" ]; then
                    HOOK_LINE='eval "$(direnv hook '"$(basename "$SHELL")"')"'
                    if ! grep -q "direnv hook" "$SHELL_RC" 2>/dev/null; then
                        echo "" >> "$SHELL_RC"
                        echo "# direnv — auto-load .envrc per-directory" >> "$SHELL_RC"
                        echo "$HOOK_LINE" >> "$SHELL_RC"
                        echo -e "  ${GREEN}PASS${NC} direnv hook added to $SHELL_RC"
                    fi
                fi
                # Allow the .envrc
                if [ -f ".envrc" ]; then
                    eval "$(direnv hook "$(basename "$SHELL")")" 2>/dev/null || true
                    direnv allow . 2>/dev/null || true
                fi
                check_pass "direnv installed and configured"
            else
                check_fail "direnv installation failed" "Install manually: brew install direnv"
            fi
        else
            # User opted out — record it
            if [ -f ".env" ] && ! grep -q "DIRENV_OPTED_OUT" .env 2>/dev/null; then
                echo "" >> .env
                echo "# DIRENV_OPTED_OUT=true  (user chose to skip direnv during bootstrap)" >> .env
            fi
            check_warn "direnv skipped (opted out)" \
                "Run before each session: set -a && source .env && set +a"
        fi
    elif $NON_INTERACTIVE; then
        # Non-interactive: auto-install direnv if brew available
        if command -v brew > /dev/null 2>&1; then
            echo -e "  ${CYAN}INST${NC} Installing direnv (non-interactive)..."
            if brew install direnv > /dev/null 2>&1; then
                eval "$(direnv hook "$(basename "$SHELL")")" 2>/dev/null || true
                if [ -f ".envrc" ]; then
                    direnv allow . 2>/dev/null || true
                fi
                check_pass "direnv auto-installed and allowed"
            else
                check_warn "direnv auto-install failed" "Install manually: brew install direnv"
            fi
        else
            check_warn "direnv not installed (brew not available)" \
                "Install manually: brew install direnv"
        fi
    else
        check_warn "direnv not installed" \
            "Install: brew install direnv"
    fi
fi

# Run env-doctor
if [ -f "scripts/env-doctor.sh" ]; then
    if bash scripts/env-doctor.sh > /dev/null 2>&1; then
        check_pass "env-doctor: no credential conflicts"
    else
        check_warn "env-doctor detected issues" "Run ./scripts/env-doctor.sh for details"
    fi
fi

# MCP server startup verification
if [ -f "scripts/verify-mcp.sh" ]; then
    if bash scripts/verify-mcp.sh > /dev/null 2>&1; then
        check_pass "MCP server verified (can start with current credentials)"
    else
        check_warn "MCP server may not start correctly" "Run: ./scripts/verify-mcp.sh for details"
    fi
fi

echo ""

# ─────────────────────────────────────────────────────────
# Phase 5: Provisioning (optional)
# ─────────────────────────────────────────────────────────
if ! $CHECK_ONLY && ! $SKIP_PROVISIONING; then
    echo -e "${BOLD}Phase 5: Twilio Resource Provisioning${NC}"
    echo ""

    # Check if resources already exist
    SYNC_SID="${TWILIO_SYNC_SERVICE_SID:-}"
    VERIFY_SID="${TWILIO_VERIFY_SERVICE_SID:-}"
    MESSAGING_SID="${TWILIO_MESSAGING_SERVICE_SID:-}"

    HAS_RESOURCES=false
    if [ -n "$SYNC_SID" ] && [[ "$SYNC_SID" != your_* ]]; then HAS_RESOURCES=true; fi
    if [ -n "$VERIFY_SID" ] && [[ "$VERIFY_SID" != your_* ]]; then HAS_RESOURCES=true; fi
    if [ -n "$MESSAGING_SID" ] && [[ "$MESSAGING_SID" != your_* ]]; then HAS_RESOURCES=true; fi

    RUN_PROVISIONING=false
    if $HAS_RESOURCES; then
        echo -e "  ${GREEN}✓${NC} Some Twilio resources already configured"
        if ! $NON_INTERACTIVE; then
            echo -n "  Run provisioning anyway? [y/N] "
            read -r answer
            if [[ "$answer" =~ ^[Yy] ]]; then
                RUN_PROVISIONING=true
            fi
        fi
    else
        if $NON_INTERACTIVE; then
            RUN_PROVISIONING=true
        else
            echo -e "  No Twilio resources configured yet."
            echo -n "  Provision resources now (Sync, Verify, Messaging, TaskRouter)? [Y/n] "
            read -r answer
            if [[ -z "$answer" ]] || [[ "$answer" =~ ^[Yy] ]]; then
                RUN_PROVISIONING=true
            fi
        fi
    fi

    if $RUN_PROVISIONING; then
        echo ""
        if $NON_INTERACTIVE; then
            node scripts/setup.js --auto-yes
        else
            node scripts/setup.js
        fi
        # Reload .env after setup.js updates it
        if [ -f ".env" ]; then
            set -a && source .env && set +a
        fi
        echo ""
    else
        echo -e "  ${DIM}Skipping provisioning. Run later with: npm run setup${NC}"
        echo ""
    fi
fi

# ─────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────
echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}${BOLD}All checks passed!${NC}  ${GREEN}$PASS passed${NC}, ${YELLOW}$WARN warnings${NC}"
else
    echo -e "${RED}${BOLD}$FAIL issue(s) found.${NC}  ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$WARN warnings${NC}"
fi

echo ""

if [ $FAIL -eq 0 ] && ! $CHECK_ONLY; then
    echo -e "${BOLD}${CYAN}┌──────────────────────────────────────────────────────────┐${NC}"
    echo -e "${BOLD}${CYAN}│                                                          │${NC}"
    echo -e "${BOLD}${CYAN}│  ${NC}${BOLD}IMPORTANT: If Claude Code is already open, you MUST:${NC}${BOLD}${CYAN}    │${NC}"
    echo -e "${BOLD}${CYAN}│                                                          │${NC}"
    echo -e "${BOLD}${CYAN}│  ${NC}  1. Close Claude Code completely (Ctrl+C or /exit)${BOLD}${CYAN}     │${NC}"
    echo -e "${BOLD}${CYAN}│  ${NC}  2. Re-open it in this directory: ${BOLD}claude${NC}${BOLD}${CYAN}              │${NC}"
    echo -e "${BOLD}${CYAN}│                                                          │${NC}"
    echo -e "${BOLD}${CYAN}│  ${NC}${DIM}This loads MCP tools with your new credentials.${NC}${BOLD}${CYAN}         │${NC}"
    echo -e "${BOLD}${CYAN}│                                                          │${NC}"
    echo -e "${BOLD}${CYAN}└──────────────────────────────────────────────────────────┘${NC}"
    echo ""
    echo -e "  ${BOLD}Quick test${NC} — ask Claude:"
    echo -e "  ${DIM}\"Use the make_call MCP tool to call +1XXXXXXXXXX.${NC}"
    echo -e "  ${DIM} Say Hello from the Feature Factory.\"${NC}"
    echo ""
    echo -e "  ${DIM}If MCP tools aren't working: ./scripts/verify-mcp.sh${NC}"
    echo ""
fi

if [ $FAIL -gt 0 ]; then
    exit 1
fi
