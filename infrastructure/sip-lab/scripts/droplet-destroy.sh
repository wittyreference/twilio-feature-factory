#!/usr/bin/env bash
# ABOUTME: Destroys the SIP Lab DigitalOcean droplet and optionally snapshots it first.
# ABOUTME: Also offers to tear down Twilio SIP resources.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIP_LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SIP_LAB_DIR/.env.sip-lab"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[sip-lab]${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; }

if [[ ! -f "$ENV_FILE" ]]; then
  err "No .env.sip-lab found. Nothing to destroy."
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

DROPLET_ID="${DO_DROPLET_ID:-}"
FIREWALL_ID="${DO_FIREWALL_ID:-}"

if [[ -z "$DROPLET_ID" && -z "$FIREWALL_ID" ]]; then
  err "No droplet or firewall IDs in .env.sip-lab."
  exit 1
fi

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  SIP Lab — Destroy"
echo "══════════════════════════════════════════════════════════"
echo ""
[[ -n "$DROPLET_ID" ]] && echo "  Droplet: $DROPLET_ID (${SIP_LAB_DROPLET_IP:-?})"
[[ -n "$FIREWALL_ID" ]] && echo "  Firewall: $FIREWALL_ID"
echo ""

# Offer snapshot
read -p "  Snapshot before destroying? [y/N] " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]] && [[ -n "$DROPLET_ID" ]]; then
  log "Creating snapshot..."
  SNAPSHOT_NAME="sip-lab-$(date +%Y%m%d-%H%M%S)"
  doctl compute droplet-action snapshot "$DROPLET_ID" --snapshot-name "$SNAPSHOT_NAME" --wait
  SNAPSHOT_ID=$(doctl compute snapshot list --format ID,Name --no-header | grep "$SNAPSHOT_NAME" | awk '{print $1}')
  ok "Snapshot: $SNAPSHOT_NAME ($SNAPSHOT_ID)"
fi

# Confirm
warn "This is IRREVERSIBLE (unless you made a snapshot)."
read -p "  Type 'destroy' to confirm: " -r
[[ "$REPLY" != "destroy" ]] && { echo "Aborted."; exit 0; }

[[ -n "$DROPLET_ID" ]] && {
  log "Destroying droplet..."
  doctl compute droplet delete "$DROPLET_ID" --force 2>/dev/null && ok "Droplet destroyed" || warn "Droplet may already be gone"
}

[[ -n "$FIREWALL_ID" ]] && {
  log "Destroying firewall..."
  doctl compute firewall delete "$FIREWALL_ID" --force 2>/dev/null && ok "Firewall destroyed" || warn "Firewall may already be gone"
}

cat > "$ENV_FILE" << 'ENVEOF'
# SIP Lab — Destroyed
# Run droplet-setup.sh to create new, or droplet-restore.sh from snapshot.
DO_DROPLET_ID=
DO_FIREWALL_ID=
DO_SSH_KEY_ID=
SIP_LAB_DROPLET_IP=
ENVEOF

ok "State cleared"
echo ""
echo "  Billing stopped."
[[ -n "${SNAPSHOT_ID:-}" ]] && echo "  Snapshot: $SNAPSHOT_ID — restore with: ./scripts/droplet-restore.sh"
echo ""
