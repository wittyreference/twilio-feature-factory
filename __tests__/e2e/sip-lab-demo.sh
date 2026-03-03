#!/bin/bash
# ABOUTME: One-command demo script for SIP Lab — verifies PBX, shows trunk info, originates calls.
# ABOUTME: Demonstrates Elastic SIP Trunking with Asterisk PBX in both termination and origination modes.

set -euo pipefail

source .env 2>/dev/null || true
source infrastructure/sip-lab/.env.sip-lab 2>/dev/null || true

SSH_KEY="${SIP_LAB_SSH_KEY:-~/.ssh/sip-lab}"
DROPLET_IP="${SIP_LAB_DROPLET_IP}"
TRUNK_NUMBER="${SIP_LAB_TRUNK_NUMBER:-+12293635283}"
TRUNK_DOMAIN="${SIP_LAB_TRUNK_DOMAIN:-sip-lab-e7f2a9.pstn.twilio.com}"
TRUNK_SID="${SIP_LAB_TRUNK_SID}"
ACCOUNT_SID="${TWILIO_ACCOUNT_SID}"
AUTH_TOKEN="${TWILIO_AUTH_TOKEN}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
info() { echo -e "  ${CYAN}→${NC} $1"; }

usage() {
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  status     Check PBX health and show trunk info (default)"
    echo "  call-me    PBX originates a call to your phone via Twilio"
    echo "  call-agent PBX calls the AI restaurant hostess (Sam) via Twilio"
    echo ""
    echo "Examples:"
    echo "  $0                          # Show status"
    echo "  $0 call-me +15551234567     # PBX calls your phone"
    echo "  $0 call-agent               # PBX calls Sam (hostess AI agent)"
    echo ""
    exit 0
}

# ── Health Check ──────────────────────────────────────────────────────────

check_pbx() {
    echo ""
    echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  SIP Lab — Elastic SIP Trunk Demo                ║${NC}"
    echo -e "${BOLD}╠══════════════════════════════════════════════════╣${NC}"
    echo -e "${BOLD}║  Droplet: ${DROPLET_IP}                       ║${NC}"
    echo -e "${BOLD}║  Trunk:   ${TRUNK_DOMAIN}  ║${NC}"
    echo -e "${BOLD}║  Number:  ${TRUNK_NUMBER}                        ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
    echo ""

    echo -e "${BOLD}Checking PBX health...${NC}"

    # SSH connectivity
    if ssh -i "$SSH_KEY" -o ConnectTimeout=5 -o StrictHostKeyChecking=no "siplab@$DROPLET_IP" "echo ok" &>/dev/null; then
        ok "SSH to droplet"
    else
        fail "Cannot reach droplet at $DROPLET_IP"
        echo ""
        echo "  Restore from snapshot:"
        echo "    cd infrastructure/sip-lab && ./scripts/droplet-restore.sh"
        return 1
    fi

    # Asterisk container
    CONTAINER_STATUS=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "siplab@$DROPLET_IP" \
        "docker ps --filter name=sip-lab-asterisk --format '{{.Status}}'" 2>/dev/null)
    if [[ "$CONTAINER_STATUS" == *"Up"* ]]; then
        ok "Asterisk container: $CONTAINER_STATUS"
    else
        fail "Asterisk container not running"
        echo "    ssh -i $SSH_KEY siplab@$DROPLET_IP 'cd sip-lab && docker compose up -d'"
        return 1
    fi

    # SIP registration to Twilio
    PJSIP_STATUS=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "siplab@$DROPLET_IP" \
        "docker exec sip-lab-asterisk asterisk -rx 'pjsip show aor twilio-trunk' 2>/dev/null | grep 'contact.*sip:' | head -1" 2>/dev/null || echo "")
    if [[ -n "$PJSIP_STATUS" ]]; then
        ok "PJSIP trunk contact: $(echo "$PJSIP_STATUS" | xargs)"
    else
        info "PJSIP trunk status: no contact (normal for INVITE-only auth)"
    fi

    # Twilio trunk API check (Trunking API is on trunking.twilio.com, not api.twilio.com)
    TRUNK_STATUS=$(curl -s "https://trunking.twilio.com/v1/Trunks/$TRUNK_SID" \
        -u "$ACCOUNT_SID:$AUTH_TOKEN" | jq -r '.friendly_name // "ERROR"')
    if [[ "$TRUNK_STATUS" != "ERROR" ]]; then
        ok "Twilio trunk: $TRUNK_STATUS"
    else
        fail "Cannot reach Twilio trunk API"
    fi

    echo ""
    echo -e "${BOLD}SIP Resource Chain:${NC}"
    info "IP ACL → Credential List → SIP Trunk → Origination URL → Phone Number"
    info "PBX IP ${DROPLET_IP} whitelisted in ACL"
    info "Origination URL: sip:${DROPLET_IP}:5060"
    info "Trunk number: ${TRUNK_NUMBER}"
    echo ""
    echo -e "${BOLD}Demo options:${NC}"
    echo ""
    echo -e "  ${CYAN}1. Termination (you → PBX):${NC}"
    echo "     Call ${TRUNK_NUMBER} from your phone"
    echo "     Asterisk answers, plays audio, hangs up"
    echo ""
    echo -e "  ${CYAN}2. Origination (PBX → you):${NC}"
    echo "     $0 call-me +1XXXXXXXXXX"
    echo "     Asterisk calls your phone through Twilio"
    echo ""
    echo -e "  ${CYAN}3. Origination (PBX → AI Agent):${NC}"
    echo "     $0 call-agent"
    echo "     Asterisk calls Sam the restaurant hostess via Twilio"
    echo "     (requires hostess WebSocket server running)"
    echo ""
}

# ── Origination: PBX calls your phone ────────────────────────────────────

call_me() {
    local DEST_NUMBER="${1:?Usage: $0 call-me +1XXXXXXXXXX}"

    echo ""
    echo -e "${BOLD}Originating call from PBX → Twilio → ${DEST_NUMBER}${NC}"
    echo ""
    info "Path: Asterisk → SIP INVITE → ${TRUNK_DOMAIN} → PSTN → ${DEST_NUMBER}"
    echo ""

    # Originate the call from Asterisk via the Twilio trunk
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "siplab@$DROPLET_IP" \
        "docker exec sip-lab-asterisk asterisk -rx 'channel originate PJSIP/${DEST_NUMBER}@twilio-trunk application Playback tt-weasels'"

    echo ""
    ok "Call originated — your phone should ring"
    echo "  Asterisk will play the weasels audio when you answer"
    echo ""
}

# ── Origination: PBX calls AI Agent ──────────────────────────────────────

call_agent() {
    local HOSTESS_NUMBER="${SIP_LAB_HOSTESS_NUMBER:-+15077365398}"

    echo ""
    echo -e "${BOLD}Originating call from PBX → Twilio → AI Hostess (Sam)${NC}"
    echo ""
    info "Path: Asterisk → SIP INVITE → ${TRUNK_DOMAIN} → ${HOSTESS_NUMBER} → ConversationRelay → Claude"
    echo ""
    echo -e "${YELLOW}Requires: hostess WebSocket server running on port 8091 + ngrok tunnel${NC}"
    echo ""

    # Originate the call from Asterisk via the Twilio trunk
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "siplab@$DROPLET_IP" \
        "docker exec sip-lab-asterisk asterisk -rx 'channel originate PJSIP/${HOSTESS_NUMBER}@twilio-trunk application Playback tt-weasels'"

    echo ""
    ok "Call originated — Sam's phone should ring"
    echo "  The hostess agent will answer via ConversationRelay"
    echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────

CMD="${1:-status}"

case "$CMD" in
    status)     check_pbx ;;
    call-me)    call_me "${2:-}" ;;
    call-agent) call_agent ;;
    -h|--help)  usage ;;
    *)          echo "Unknown command: $CMD"; usage ;;
esac
