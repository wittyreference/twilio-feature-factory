#!/usr/bin/env bash
# ABOUTME: Snapshots the SIP Lab droplet and destroys it to stop billing.
# ABOUTME: Snapshots cost ~$0.06/GB/mo vs $6/mo for a running droplet.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIP_LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SIP_LAB_DIR/.env.sip-lab"

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[sip-lab]${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; }

[[ ! -f "$ENV_FILE" ]] && { err "No .env.sip-lab found."; exit 1; }
source "$ENV_FILE"

DROPLET_ID="${DO_DROPLET_ID:-}"
[[ -z "$DROPLET_ID" ]] && { err "No droplet ID in .env.sip-lab."; exit 1; }

SNAPSHOT_NAME="sip-lab-$(date +%Y%m%d-%H%M%S)"
log "Snapshotting $DROPLET_ID as $SNAPSHOT_NAME..."
doctl compute droplet-action snapshot "$DROPLET_ID" --snapshot-name "$SNAPSHOT_NAME" --wait
SNAPSHOT_ID=$(doctl compute snapshot list --format ID,Name --no-header | grep "$SNAPSHOT_NAME" | awk '{print $1}')
ok "Snapshot: $SNAPSHOT_ID"

log "Destroying droplet..."
doctl compute droplet delete "$DROPLET_ID" --force
ok "Billing stopped"

# Update local state
sed -i.bak "s/^DO_DROPLET_ID=.*/DO_DROPLET_ID=/" "$ENV_FILE"
sed -i.bak "s/^SIP_LAB_DROPLET_IP=.*/SIP_LAB_DROPLET_IP=/" "$ENV_FILE"
rm -f "${ENV_FILE}.bak"
if grep -q "^DO_SNAPSHOT_ID=" "$ENV_FILE"; then
  sed -i.bak "s/^DO_SNAPSHOT_ID=.*/DO_SNAPSHOT_ID=$SNAPSHOT_ID/" "$ENV_FILE"
  rm -f "${ENV_FILE}.bak"
else
  echo "DO_SNAPSHOT_ID=$SNAPSHOT_ID" >> "$ENV_FILE"
fi

echo ""
echo "  Snapshot: $SNAPSHOT_ID (~\$0.30/mo storage)"
echo "  Restore:  ./scripts/droplet-restore.sh"
echo ""
