#!/usr/bin/env bash
# ABOUTME: Pre-flight infrastructure setup for headless validation sessions.
# ABOUTME: Deploys functions, starts ngrok/agent-servers, optionally provisions SIP Lab droplet.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

log()  { echo -e "${CYAN}[preflight]${NC} $1"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
err()  { echo -e "  ${RED}✗${NC} $1"; }

# --- Flags ---

SIP_LAB=false
SKIP_DEPLOY=false
SNAPSHOT_AFTER=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --sip-lab)       SIP_LAB=true; shift ;;
        --skip-deploy)   SKIP_DEPLOY=true; shift ;;
        --snapshot-after) SNAPSHOT_AFTER=true; shift ;;
        --help)
            echo "Usage: headless-preflight.sh [--sip-lab] [--skip-deploy] [--snapshot-after]"
            echo "  --sip-lab        Restore/provision SIP Lab droplet for PSTN testing"
            echo "  --skip-deploy    Skip serverless deployment (if already deployed)"
            echo "  --snapshot-after Snapshot SIP Lab droplet after completion (saves cost)"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

cd "$PROJECT_DIR"

REPORT="{}"
ERRORS=0

# ============================================================================
# Step 1: Environment Verification
# ============================================================================

log "Step 1: Environment verification"

if [ -f ".env" ]; then
    set -a
    source .env
    set +a
    ok "Sourced .env"
else
    err ".env not found"
    ERRORS=$((ERRORS + 1))
fi

REQUIRED_VARS=(TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_PHONE_NUMBER TEST_PHONE_NUMBER)
for var in "${REQUIRED_VARS[@]}"; do
    val="${!var:-}"
    if [ -z "$val" ]; then
        err "$var is not set"
        ERRORS=$((ERRORS + 1))
    else
        ok "$var set"
    fi
done

# Verify optional SIDs are live (warnings only — MCP auto-resolves defaults)
if [ -n "${TWILIO_SYNC_SERVICE_SID:-}" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        "https://sync.twilio.com/v1/Services/$TWILIO_SYNC_SERVICE_SID" \
        -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "404" ]; then
        warn "TWILIO_SYNC_SERVICE_SID=$TWILIO_SYNC_SERVICE_SID returns 404 — MCP defaults will be used"
    elif [ "$HTTP_CODE" = "200" ]; then
        ok "TWILIO_SYNC_SERVICE_SID is live"
    fi
fi
if [ -n "${TWILIO_TASKROUTER_WORKSPACE_SID:-}" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        "https://taskrouter.twilio.com/v1/Workspaces/$TWILIO_TASKROUTER_WORKSPACE_SID" \
        -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "404" ]; then
        warn "TWILIO_TASKROUTER_WORKSPACE_SID=$TWILIO_TASKROUTER_WORKSPACE_SID returns 404 — MCP defaults will be used"
    elif [ "$HTTP_CODE" = "200" ]; then
        ok "TWILIO_TASKROUTER_WORKSPACE_SID is live"
    fi
fi

if [ "$ERRORS" -gt 0 ]; then
    err "Missing $ERRORS required env vars. Cannot proceed."
    exit 1
fi

# Verify Twilio auth works
AUTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
    -u "${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}" \
    "https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json" 2>/dev/null || echo "000")

if [ "$AUTH_CHECK" = "200" ]; then
    ok "Twilio auth verified (HTTP 200)"
else
    err "Twilio auth failed (HTTP $AUTH_CHECK)"
    exit 1
fi

# Verify CLI profile
ACTIVE_PROFILE=$(twilio profiles:list 2>/dev/null | grep -E '^\*|Active' | head -1 || echo "")
if [ -n "$ACTIVE_PROFILE" ]; then
    ok "CLI profile: $ACTIVE_PROFILE"
else
    warn "Could not determine active Twilio CLI profile"
fi

# ============================================================================
# Step 2: Deploy Serverless Functions
# ============================================================================

SERVERLESS_DOMAIN=""

if [ "$SKIP_DEPLOY" = true ]; then
    log "Step 2: Skipping deploy (--skip-deploy)"
else
    log "Step 2: Deploying serverless functions"
    DEPLOY_OUTPUT=$(npm run deploy:dev 2>&1) || {
        err "Deploy failed"
        echo "$DEPLOY_OUTPUT" | tail -5
        exit 1
    }
    SERVERLESS_DOMAIN=$(echo "$DEPLOY_OUTPUT" | grep -oE '[a-z0-9-]+-dev\.twil\.io' | head -1 || echo "")
    if [ -n "$SERVERLESS_DOMAIN" ]; then
        ok "Deployed: $SERVERLESS_DOMAIN"
    else
        warn "Deploy succeeded but could not extract domain"
    fi
fi

export SERVERLESS_DOMAIN

# ============================================================================
# Step 3: Ngrok Tunnels
# ============================================================================

NGROK_A_UP=false
NGROK_B_UP=false

if [ -n "${NGROK_DOMAIN_A:-}" ] && [ -n "${NGROK_DOMAIN_B:-}" ]; then
    log "Step 3: Starting ngrok tunnels"

    # Kill orphan ngrok processes
    pkill -f "ngrok http" 2>/dev/null || true
    sleep 1

    # Start tunnel A
    nohup ngrok http 8080 --domain="$NGROK_DOMAIN_A" --log=/tmp/ngrok-a.log >/dev/null 2>&1 &
    sleep 3

    # Start tunnel B
    nohup ngrok http 8081 --domain="$NGROK_DOMAIN_B" --log=/tmp/ngrok-b.log >/dev/null 2>&1 &
    sleep 4

    # Verify tunnels via ngrok API first (authoritative), then HTTP fallback
    NGROK_API_TUNNELS=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null || echo "{}")
    NGROK_TUNNEL_A_FOUND=$(echo "$NGROK_API_TUNNELS" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    for t in data.get('tunnels', []):
        if '$NGROK_DOMAIN_A' in t.get('public_url', ''):
            addr = t.get('config', {}).get('addr', 'unknown')
            # Extract just the port number
            port = addr.split(':')[-1] if ':' in addr else addr
            print(f'port={port}')
            sys.exit(0)
    print('not_found')
except: print('api_error')
" 2>/dev/null || echo "api_error")

    NGROK_TUNNEL_B_FOUND=$(echo "$NGROK_API_TUNNELS" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    for t in data.get('tunnels', []):
        if '$NGROK_DOMAIN_B' in t.get('public_url', ''):
            addr = t.get('config', {}).get('addr', 'unknown')
            port = addr.split(':')[-1] if ':' in addr else addr
            print(f'port={port}')
            sys.exit(0)
    print('not_found')
except: print('api_error')
" 2>/dev/null || echo "api_error")

    # Tunnel A verification
    if [[ "$NGROK_TUNNEL_A_FOUND" == port=* ]]; then
        NGROK_A_UP=true
        ok "Ngrok A: https://$NGROK_DOMAIN_A ($NGROK_TUNNEL_A_FOUND) — verified via API"
    else
        # Fallback: HTTP check (502 expected — no server yet)
        HTTP_A=$(curl -s -o /dev/null -w "%{http_code}" "https://${NGROK_DOMAIN_A}" 2>/dev/null || echo "000")
        if [ "$HTTP_A" = "502" ] || [ "$HTTP_A" = "200" ]; then
            NGROK_A_UP=true
            ok "Ngrok A: https://$NGROK_DOMAIN_A (HTTP $HTTP_A)"
        else
            warn "Ngrok A not found — domain $NGROK_DOMAIN_A not in running tunnels (HTTP $HTTP_A)"
        fi
    fi

    # Tunnel B verification
    if [[ "$NGROK_TUNNEL_B_FOUND" == port=* ]]; then
        NGROK_B_UP=true
        ok "Ngrok B: https://$NGROK_DOMAIN_B ($NGROK_TUNNEL_B_FOUND) — verified via API"
    else
        HTTP_B=$(curl -s -o /dev/null -w "%{http_code}" "https://${NGROK_DOMAIN_B}" 2>/dev/null || echo "000")
        if [ "$HTTP_B" = "502" ] || [ "$HTTP_B" = "200" ]; then
            NGROK_B_UP=true
            ok "Ngrok B: https://$NGROK_DOMAIN_B (HTTP $HTTP_B)"
        else
            warn "Ngrok B not found — domain $NGROK_DOMAIN_B not in running tunnels (HTTP $HTTP_B)"
        fi
    fi
else
    log "Step 3: Skipping ngrok (NGROK_DOMAIN_A/B not set)"
fi

export NGROK_A_UP NGROK_B_UP

# ============================================================================
# Step 4: Agent Servers
# ============================================================================

AGENT_SERVERS_UP=false

if [ "$NGROK_A_UP" = true ] || [ "$NGROK_B_UP" = true ]; then
    log "Step 4: Starting agent servers"

    # Kill orphan agent servers
    pkill -f "agent-server-template" 2>/dev/null || true
    sleep 1

    AGENT_TEMPLATE="$PROJECT_DIR/__tests__/e2e/agent-server-template.js"

    if [ -f "$AGENT_TEMPLATE" ]; then
        # Start Agent A (questioner, port 8080)
        PORT=8080 AGENT_ROLE=questioner AGENT_ID=preflight-agent-a \
            nohup node "$AGENT_TEMPLATE" >/tmp/agent-a.log 2>&1 &
        sleep 2

        # Start Agent B (answerer, port 8081)
        PORT=8081 AGENT_ROLE=answerer AGENT_ID=preflight-agent-b \
            nohup node "$AGENT_TEMPLATE" >/tmp/agent-b.log 2>&1 &
        sleep 2

        # Verify agent servers are listening
        if lsof -i :8080 >/dev/null 2>&1 && lsof -i :8081 >/dev/null 2>&1; then
            AGENT_SERVERS_UP=true
            ok "Agent A (questioner) on :8080"
            ok "Agent B (answerer) on :8081"
        else
            warn "Agent servers failed to start — check /tmp/agent-a.log and /tmp/agent-b.log"
        fi
    else
        warn "Agent server template not found at $AGENT_TEMPLATE"
    fi
else
    log "Step 4: Skipping agent servers (no ngrok tunnels)"
fi

export AGENT_SERVERS_UP

# ============================================================================
# Step 5: SIP Lab Lifecycle
# ============================================================================

SIP_LAB_READY=false
SIP_LAB_ENV="$PROJECT_DIR/infrastructure/sip-lab/.env.sip-lab"

if [ "$SIP_LAB" = true ]; then
    log "Step 5: SIP Lab lifecycle"

    if [ ! -f "$SIP_LAB_ENV" ]; then
        err "SIP Lab env not found: $SIP_LAB_ENV"
        err "Run: node infrastructure/sip-lab/scripts/setup-sip-lab.js"
    else
        set -a
        source "$SIP_LAB_ENV"
        set +a

        DROPLET_IP="${SIP_LAB_DROPLET_IP:-}"
        SNAPSHOT_ID="${DO_SNAPSHOT_ID:-}"
        SSH_KEY="${SIP_LAB_SSH_KEY:-$HOME/.ssh/sip-lab}"

        DROPLET_ALIVE=false

        # Check if droplet is reachable
        if [ -n "$DROPLET_IP" ] && [ -f "$SSH_KEY" ]; then
            if ssh -i "$SSH_KEY" -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
               "siplab@$DROPLET_IP" "echo ok" &>/dev/null; then
                DROPLET_ALIVE=true
                ok "Droplet reachable at $DROPLET_IP"
            fi
        fi

        # Restore from snapshot if needed
        if [ "$DROPLET_ALIVE" = false ] && [ -n "$SNAPSHOT_ID" ]; then
            log "  Restoring droplet from snapshot $SNAPSHOT_ID..."
            if (cd "$PROJECT_DIR/infrastructure/sip-lab" && ./scripts/droplet-restore.sh "$SNAPSHOT_ID"); then
                # Re-source env to get new IP
                set -a
                source "$SIP_LAB_ENV"
                set +a
                DROPLET_IP="${SIP_LAB_DROPLET_IP:-}"
                ok "Droplet restored at $DROPLET_IP"
                DROPLET_ALIVE=true
                # Give it time to fully boot
                sleep 10
            else
                err "Droplet restore failed"
            fi
        fi

        # Full provision if no snapshot
        if [ "$DROPLET_ALIVE" = false ] && [ -z "$SNAPSHOT_ID" ]; then
            log "  No snapshot found. Full provisioning..."
            if command -v doctl &>/dev/null; then
                if (cd "$PROJECT_DIR/infrastructure/sip-lab" && ./scripts/droplet-setup.sh); then
                    set -a
                    source "$SIP_LAB_ENV"
                    set +a
                    DROPLET_IP="${SIP_LAB_DROPLET_IP:-}"
                    ok "Droplet provisioned at $DROPLET_IP"
                    DROPLET_ALIVE=true
                    # Full setup takes longer
                    sleep 15
                else
                    err "Droplet setup failed"
                fi
            else
                err "doctl not installed — cannot provision SIP Lab"
                err "Install with: brew install doctl && doctl auth init"
            fi
        fi

        # Verify Asterisk container is running
        if [ "$DROPLET_ALIVE" = true ] && [ -f "$SSH_KEY" ]; then
            CONTAINER_STATUS=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
                "siplab@$DROPLET_IP" \
                "docker ps --filter name=sip-lab-asterisk --format '{{.Status}}'" 2>/dev/null || echo "")

            if [[ "$CONTAINER_STATUS" == *"Up"* ]]; then
                ok "Asterisk container running"
            else
                log "  Asterisk not running — starting..."
                ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no \
                    "siplab@$DROPLET_IP" \
                    "cd ~/sip-lab && docker compose up -d" 2>/dev/null || true
                sleep 5

                # Re-check
                CONTAINER_STATUS=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no \
                    "siplab@$DROPLET_IP" \
                    "docker ps --filter name=sip-lab-asterisk --format '{{.Status}}'" 2>/dev/null || echo "")
                if [[ "$CONTAINER_STATUS" == *"Up"* ]]; then
                    ok "Asterisk container started"
                else
                    err "Failed to start Asterisk container"
                fi
            fi

            # SIP-level health check — docker ps is not enough
            # Verify Asterisk is actually accepting SIP traffic on port 5060
            if [[ "$CONTAINER_STATUS" == *"Up"* ]]; then
                # Get the actual container name (may or may not have -1 suffix depending on compose version)
                SIP_CONTAINER=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
                    "siplab@$DROPLET_IP" \
                    "docker ps --filter name=sip-lab-asterisk --format '{{.Names}}' | head -1" \
                    2>/dev/null || echo "sip-lab-asterisk")

                SIP_HEALTHY=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
                    "siplab@$DROPLET_IP" \
                    "docker exec $SIP_CONTAINER asterisk -rx 'core show channels count' 2>/dev/null && echo SIP_OK || echo SIP_FAIL" \
                    2>/dev/null || echo "SIP_FAIL")

                if [[ "$SIP_HEALTHY" == *"SIP_OK"* ]]; then
                    ok "Asterisk SIP responding (core show channels)"
                else
                    warn "Asterisk container up but SIP not responding — restarting..."
                    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no \
                        "siplab@$DROPLET_IP" \
                        "cd ~/sip-lab && docker compose restart asterisk" 2>/dev/null || true
                    sleep 8

                    # Retry SIP health check after restart
                    SIP_HEALTHY=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
                        "siplab@$DROPLET_IP" \
                        "docker exec $SIP_CONTAINER asterisk -rx 'core show channels count' 2>/dev/null && echo SIP_OK || echo SIP_FAIL" \
                        2>/dev/null || echo "SIP_FAIL")

                    if [[ "$SIP_HEALTHY" == *"SIP_OK"* ]]; then
                        ok "Asterisk SIP responding after restart"
                    else
                        err "Asterisk SIP still not responding after restart"
                    fi
                fi

                # Verify SIP port is externally reachable (from inside the droplet)
                SIP_PORT_OPEN=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
                    "siplab@$DROPLET_IP" \
                    "timeout 3 bash -c 'echo | nc -u -w1 127.0.0.1 5060 && echo PORT_OK || echo PORT_FAIL'" \
                    2>/dev/null || echo "PORT_FAIL")

                if [[ "$SIP_PORT_OPEN" == *"PORT_OK"* ]]; then
                    ok "SIP port 5060/UDP open"
                else
                    warn "SIP port 5060/UDP check inconclusive (nc may not be available)"
                fi

                # Final determination: container up AND SIP responding
                if [[ "$SIP_HEALTHY" == *"SIP_OK"* ]]; then
                    SIP_LAB_READY=true
                fi
            fi
        fi

        if [ "$SIP_LAB_READY" = true ]; then
            ok "SIP Lab ready (trunk: ${SIP_LAB_TRUNK_SID:-unknown})"
        else
            err "SIP Lab NOT ready — UC9 PSTN validation will FAIL"
        fi
    fi
else
    log "Step 5: Skipping SIP Lab (use --sip-lab to enable)"
fi

export SIP_LAB_READY

# ============================================================================
# Step 6: Write Preflight Report
# ============================================================================

log "Step 6: Writing preflight report"

REPORT_DIR="$PROJECT_DIR/.meta"
mkdir -p "$REPORT_DIR"

python3 -c "
import json, os
from datetime import datetime

report = {
    'timestamp': datetime.now().isoformat(),
    'envVerified': True,
    'serverlessDomain': os.environ.get('SERVERLESS_DOMAIN', ''),
    'ngrokA': os.environ.get('NGROK_A_UP', 'false') == 'true',
    'ngrokB': os.environ.get('NGROK_B_UP', 'false') == 'true',
    'agentServers': os.environ.get('AGENT_SERVERS_UP', 'false') == 'true',
    'sipLabReady': os.environ.get('SIP_LAB_READY', 'false') == 'true',
}

with open('$REPORT_DIR/preflight-report.json', 'w') as f:
    json.dump(report, f, indent=2)
print('Report written to .meta/preflight-report.json')
"

# ============================================================================
# Summary
# ============================================================================

echo ""
echo -e "${CYAN}══════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Preflight Complete${NC}"
echo -e "${CYAN}══════════════════════════════════════════════${NC}"
echo ""
echo -e "  Domain:     ${SERVERLESS_DOMAIN:-not deployed}"
echo -e "  Ngrok A:    $([ "$NGROK_A_UP" = true ] && echo "${GREEN}UP${NC}" || echo "${DIM}down${NC}")"
echo -e "  Ngrok B:    $([ "$NGROK_B_UP" = true ] && echo "${GREEN}UP${NC}" || echo "${DIM}down${NC}")"
echo -e "  Agents:     $([ "$AGENT_SERVERS_UP" = true ] && echo "${GREEN}UP${NC}" || echo "${DIM}down${NC}")"
echo -e "  SIP Lab:    $([ "$SIP_LAB_READY" = true ] && echo "${GREEN}READY${NC}" || echo "${DIM}not enabled${NC}")"
echo ""
