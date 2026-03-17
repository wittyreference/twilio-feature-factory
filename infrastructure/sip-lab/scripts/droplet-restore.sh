#!/usr/bin/env bash
# ABOUTME: Restores a SIP Lab droplet from a snapshot and re-attaches the firewall.
# ABOUTME: Updates local .env.sip-lab and remote EXTERNAL_IP with the new droplet IP.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIP_LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SIP_LAB_DIR/.env.sip-lab"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[sip-lab]${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; }

[[ ! -f "$ENV_FILE" ]] && { err "No .env.sip-lab found."; exit 1; }
source "$ENV_FILE"

SNAPSHOT_ID="${1:-${DO_SNAPSHOT_ID:-}}"
if [[ -z "$SNAPSHOT_ID" ]]; then
  err "No snapshot ID. Usage: ./droplet-restore.sh [snapshot-id]"
  echo "  Available snapshots:"
  doctl compute snapshot list --format ID,Name,CreatedAt --no-header | grep "sip-lab" || echo "  (none)"
  exit 1
fi

FIREWALL_ID="${DO_FIREWALL_ID:-}"
SSH_KEY_ID="${DO_SSH_KEY_ID:-}"
SSH_KEY_PATH="${SIP_LAB_SSH_KEY:-$HOME/.ssh/sip-lab}"

log "Restoring from snapshot $SNAPSHOT_ID..."

DROPLET_ID=$(doctl compute droplet create "sip-lab" \
  --region nyc3 \
  --size s-1vcpu-1gb \
  --image "$SNAPSHOT_ID" \
  --ssh-keys "$SSH_KEY_ID" \
  --tag-name sip-lab \
  --wait \
  --format ID --no-header)

DROPLET_IP=$(doctl compute droplet get "$DROPLET_ID" --format PublicIPv4 --no-header)
ok "Droplet: $DROPLET_ID ($DROPLET_IP)"

if [[ -n "$FIREWALL_ID" ]]; then
  doctl compute firewall add-droplets "$FIREWALL_ID" --droplet-ids "$DROPLET_ID"
  ok "Firewall re-attached"

  # Update SSH rule for current IP
  HOME_IP=$(curl -s https://api.ipify.org || true)
  if [[ -n "$HOME_IP" ]] && [[ -x "$SCRIPT_DIR/update-firewall-ip.sh" ]]; then
    log "Updating firewall SSH rule for $HOME_IP..."
    DO_FIREWALL_ID="$FIREWALL_ID" "$SCRIPT_DIR/update-firewall-ip.sh" "$HOME_IP"
  fi
fi

# Update local state
sed -i.bak "s/^DO_DROPLET_ID=.*/DO_DROPLET_ID=$DROPLET_ID/" "$ENV_FILE"
sed -i.bak "s/^SIP_LAB_DROPLET_IP=.*/SIP_LAB_DROPLET_IP=$DROPLET_IP/" "$ENV_FILE"
sed -i.bak "s/^EXTERNAL_IP=.*/EXTERNAL_IP=$DROPLET_IP/" "$ENV_FILE"
rm -f "${ENV_FILE}.bak"

# Update remote EXTERNAL_IP and restart Asterisk
log "Updating remote config..."
ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no siplab@"$DROPLET_IP" \
  "sed -i 's/^EXTERNAL_IP=.*/EXTERNAL_IP=$DROPLET_IP/' ~/sip-lab/.env.sip-lab && \
   cd ~/sip-lab && docker compose restart asterisk" 2>/dev/null || true

# Update Twilio IP ACL if IP changed
OLD_IP="${EXTERNAL_IP:-161.35.130.80}"
ACL_SID="${SIP_LAB_IP_ACL_SID:-}"
IP_SID="${SIP_LAB_IP_ADDRESS_SID:-}"

if [[ "$DROPLET_IP" != "$OLD_IP" ]] && [[ -n "$ACL_SID" ]] && [[ -n "$IP_SID" ]]; then
  log "IP changed ($OLD_IP → $DROPLET_IP). Updating Twilio IP ACL + origination URL..."

  # Source main .env for Twilio credentials (needed for REST API call)
  PROJECT_ROOT="$(cd "$SIP_LAB_DIR/../.." && pwd)"
  if [[ -f "$PROJECT_ROOT/.env" ]]; then
    source "$PROJECT_ROOT/.env"
  fi

  # Update IP ACL via REST API (CLI silently fails for this endpoint)
  if [[ -n "$TWILIO_ACCOUNT_SID" ]] && [[ -n "$TWILIO_AUTH_TOKEN" ]]; then
    curl -s -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/SIP/IpAccessControlLists/$ACL_SID/IpAddresses/$IP_SID.json" \
      -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
      -d "IpAddress=$DROPLET_IP" > /dev/null 2>&1 && ok "Twilio IP ACL updated to $DROPLET_IP" \
      || warn "Failed to update IP ACL — update manually"
  else
    warn "No Twilio credentials found — update IP ACL manually for $DROPLET_IP"
  fi

  # Update origination URL
  ORIG_SID="${SIP_LAB_ORIGINATION_URL_SID:-}"
  TRUNK_SID="${SIP_LAB_TRUNK_SID:-}"
  if [[ -n "$ORIG_SID" ]] && [[ -n "$TRUNK_SID" ]]; then
    curl -s -X POST "https://trunking.twilio.com/v1/Trunks/$TRUNK_SID/OriginationUrls/$ORIG_SID" \
      -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
      -d "SipUrl=sip:$DROPLET_IP:5060" > /dev/null 2>&1 && ok "Origination URL updated to sip:$DROPLET_IP:5060" \
      || warn "Failed to update origination URL — update manually"
  fi
else
  if [[ "$DROPLET_IP" == "$OLD_IP" ]]; then
    ok "IP unchanged ($DROPLET_IP) — no ACL update needed"
  else
    warn "Missing ACL SIDs in .env.sip-lab — update IP ACL manually for $DROPLET_IP"
  fi
fi

echo ""
echo "  Droplet: $DROPLET_ID ($DROPLET_IP)"
echo "  SSH:     ssh -i $SSH_KEY_PATH siplab@$DROPLET_IP"
echo ""
