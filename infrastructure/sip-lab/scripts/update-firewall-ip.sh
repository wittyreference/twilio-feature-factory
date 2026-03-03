#!/usr/bin/env bash
# ABOUTME: Updates the SIP Lab firewall SSH rule when your home IP changes.
# ABOUTME: Run after ISP assigns a new IP or when connecting from a new network.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIP_LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SIP_LAB_DIR/.env.sip-lab"

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[sip-lab]${NC} $1"; }
ok()  { echo -e "${GREEN}✓${NC} $1"; }
err() { echo -e "${RED}✗${NC} $1"; }

# Accept firewall ID from env var (for use by other scripts) or from .env.sip-lab
FIREWALL_ID="${DO_FIREWALL_ID:-}"
if [[ -z "$FIREWALL_ID" ]] && [[ -f "$ENV_FILE" ]]; then
  source "$ENV_FILE"
  FIREWALL_ID="${DO_FIREWALL_ID:-}"
fi
[[ -z "$FIREWALL_ID" ]] && { err "No firewall ID found."; exit 1; }

# Get new IP from argument or auto-detect
NEW_IP="${1:-}"
if [[ -z "$NEW_IP" ]]; then
  log "Detecting current public IP..."
  NEW_IP=$(curl -s https://api.ipify.org || curl -s https://ifconfig.me)
fi
[[ -z "$NEW_IP" ]] && { err "Could not detect IP. Usage: ./update-firewall-ip.sh 1.2.3.4"; exit 1; }

log "Updating SSH rule to: $NEW_IP/32"

# Twilio IPs — must match droplet-setup.sh
TWILIO_SIGNALING_IPS=(
  "54.172.60.0/30" "54.172.60.4/30" "54.244.51.0/30" "34.203.250.0/30"
  "54.171.127.192/30" "35.156.191.128/30" "3.112.80.0/30" "54.65.63.192/30"
  "54.252.254.64/30" "108.141.162.0/30" "54.246.7.128/30" "20.125.63.48/30"
)

inbound="protocol:tcp,ports:22,address:${NEW_IP}/32"
for cidr in "${TWILIO_SIGNALING_IPS[@]}"; do
  inbound="${inbound} protocol:udp,ports:5060,address:${cidr}"
  inbound="${inbound} protocol:tcp,ports:5061,address:${cidr}"
done
inbound="${inbound} protocol:udp,ports:10000-10100,address:168.86.128.0/18"

outbound="protocol:udp,ports:5060,address:0.0.0.0/0"
outbound="${outbound} protocol:tcp,ports:5061,address:0.0.0.0/0"
outbound="${outbound} protocol:udp,ports:10000-10100,address:0.0.0.0/0"
outbound="${outbound} protocol:tcp,ports:443,address:0.0.0.0/0"
outbound="${outbound} protocol:tcp,ports:80,address:0.0.0.0/0"
outbound="${outbound} protocol:udp,ports:53,address:0.0.0.0/0"
outbound="${outbound} protocol:tcp,ports:53,address:0.0.0.0/0"

doctl compute firewall update "$FIREWALL_ID" \
  --name "sip-lab-firewall" \
  --inbound-rules "$inbound" \
  --outbound-rules "$outbound"

ok "Firewall updated. SSH allowed from $NEW_IP only."
