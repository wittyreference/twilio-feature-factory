#!/usr/bin/env bash
# ABOUTME: Provisions a hardened DigitalOcean droplet for SIP Lab testing.
# ABOUTME: Creates firewall + droplet, provisions over SSH (not cloud-init), deploys Docker + Asterisk.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIP_LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$SIP_LAB_DIR/../.." && pwd)"
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

# Twilio SIP signaling IPs — from https://www.twilio.com/docs/sip-trunking/ip-addresses
TWILIO_SIGNALING_IPS=(
  "54.172.60.0/30"    "54.172.60.4/30"    "54.244.51.0/30"    "34.203.250.0/30"
  "54.171.127.192/30" "35.156.191.128/30" "3.112.80.0/30"     "54.65.63.192/30"
  "54.252.254.64/30"  "108.141.162.0/30"  "54.246.7.128/30"   "20.125.63.48/30"
)
TWILIO_MEDIA_CIDR="168.86.128.0/18"

# ── Prerequisites ──────────────────────────────────────────────────────────

check_prerequisites() {
  log "Checking prerequisites..."

  if ! command -v doctl &>/dev/null; then
    err "doctl not found. Install with: brew install doctl"
    echo "  Then authenticate: doctl auth init"
    exit 1
  fi

  if ! doctl account get &>/dev/null; then
    err "doctl not authenticated. Run: doctl auth init"
    echo "  Create API token at: https://cloud.digitalocean.com/account/api/tokens"
    exit 1
  fi

  ok "Prerequisites satisfied"
}

# ── SSH Key ────────────────────────────────────────────────────────────────

setup_ssh_key() {
  log "Setting up SSH key..."

  local key_path="$HOME/.ssh/sip-lab"

  if [[ -f "$key_path" ]]; then
    ok "SSH key exists: $key_path"
  else
    log "Generating new SSH key pair..."
    ssh-keygen -t ed25519 -f "$key_path" -N "" -C "sip-lab-droplet"
    ok "SSH key generated: $key_path"
  fi

  SSH_PUBLIC_KEY=$(cat "${key_path}.pub")
  SSH_PRIVATE_KEY_PATH="$key_path"

  local key_name="sip-lab-$(hostname -s)"
  local existing_key
  existing_key=$(doctl compute ssh-key list --format ID,Name --no-header | grep "$key_name" | awk '{print $1}' || true)

  if [[ -n "$existing_key" ]]; then
    SSH_KEY_ID="$existing_key"
    ok "SSH key registered in DO: $key_name (ID: $SSH_KEY_ID)"
  else
    log "Registering SSH key in DigitalOcean..."
    SSH_KEY_ID=$(doctl compute ssh-key create "$key_name" \
      --public-key "$SSH_PUBLIC_KEY" \
      --format ID --no-header)
    ok "SSH key registered: $key_name (ID: $SSH_KEY_ID)"
  fi
}

# ── Detect Home IP ─────────────────────────────────────────────────────────

detect_home_ip() {
  log "Detecting your public IP..."
  HOME_IP=$(curl -s https://api.ipify.org || curl -s https://ifconfig.me || true)

  if [[ -z "$HOME_IP" ]]; then
    err "Could not detect public IP. Enter manually:"
    read -r HOME_IP
  fi

  ok "Your public IP: $HOME_IP"
  echo ""
  warn "SSH access will be restricted to this IP only."
  warn "If your IP changes, run: ./scripts/update-firewall-ip.sh"
  echo ""
}

# ── Create Firewall ───────────────────────────────────────────────────────

create_firewall() {
  log "Creating DigitalOcean cloud firewall..."

  local existing_fw
  existing_fw=$(doctl compute firewall list --format ID,Name --no-header | grep "sip-lab-firewall" | awk '{print $1}' || true)

  if [[ -n "$existing_fw" ]]; then
    warn "Existing firewall found (ID: $existing_fw). Deleting..."
    doctl compute firewall delete "$existing_fw" --force
  fi

  local inbound="protocol:tcp,ports:22,address:${HOME_IP}/32"
  for cidr in "${TWILIO_SIGNALING_IPS[@]}"; do
    inbound="${inbound} protocol:udp,ports:5060,address:${cidr}"
    inbound="${inbound} protocol:tcp,ports:5061,address:${cidr}"
  done
  inbound="${inbound} protocol:udp,ports:10000-60000,address:${TWILIO_MEDIA_CIDR}"

  local outbound="protocol:udp,ports:5060,address:0.0.0.0/0"
  outbound="${outbound} protocol:tcp,ports:5061,address:0.0.0.0/0"
  outbound="${outbound} protocol:udp,ports:10000-60000,address:0.0.0.0/0"
  outbound="${outbound} protocol:tcp,ports:443,address:0.0.0.0/0"
  outbound="${outbound} protocol:tcp,ports:80,address:0.0.0.0/0"
  outbound="${outbound} protocol:udp,ports:53,address:0.0.0.0/0"
  outbound="${outbound} protocol:tcp,ports:53,address:0.0.0.0/0"

  FIREWALL_ID=$(doctl compute firewall create \
    --name "sip-lab-firewall" \
    --inbound-rules "$inbound" \
    --outbound-rules "$outbound" \
    --format ID --no-header)

  ok "Firewall created: $FIREWALL_ID"
  log "Firewall rules:"
  echo "  INBOUND:  SSH(22)←${HOME_IP} | SIP(5060,5061)←Twilio | RTP(10000-60000)←${TWILIO_MEDIA_CIDR}"
  echo "  OUTBOUND: SIP, RTP, HTTPS, HTTP, DNS"
}

# ── Create Droplet ────────────────────────────────────────────────────────

create_droplet() {
  log "Creating DigitalOcean droplet..."

  local existing_droplet
  existing_droplet=$(doctl compute droplet list --format ID,Name --no-header | grep "sip-lab" | awk '{print $1}' || true)

  if [[ -n "$existing_droplet" ]]; then
    err "Existing sip-lab droplet found (ID: $existing_droplet)."
    echo "  Destroy it first: ./scripts/droplet-destroy.sh"
    exit 1
  fi

  # Create droplet with just the SSH key — no cloud-init.
  # All provisioning happens over SSH in provision_droplet() below.
  # This avoids cloud-init YAML parsing issues that silently fail.
  DROPLET_ID=$(doctl compute droplet create "sip-lab" \
    --region nyc3 \
    --size s-1vcpu-1gb \
    --image ubuntu-24-04-x64 \
    --ssh-keys "$SSH_KEY_ID" \
    --tag-name sip-lab \
    --wait \
    --format ID --no-header)

  DROPLET_IP=$(doctl compute droplet get "$DROPLET_ID" --format PublicIPv4 --no-header)

  ok "Droplet created: $DROPLET_ID (IP: $DROPLET_IP)"

  log "Associating firewall..."
  doctl compute firewall add-droplets "$FIREWALL_ID" --droplet-ids "$DROPLET_ID"
  ok "Firewall attached"
}

# ── Wait for SSH ──────────────────────────────────────────────────────────

wait_for_ssh() {
  log "Waiting for SSH to become available..."

  local attempts=0
  while [[ $attempts -lt 30 ]]; do
    if ssh -i "$SSH_PRIVATE_KEY_PATH" -o StrictHostKeyChecking=no -o ConnectTimeout=5 \
       root@"$DROPLET_IP" "echo ok" &>/dev/null 2>&1; then
      ok "SSH ready"
      return 0
    fi
    attempts=$((attempts + 1))
    echo -n "."
    sleep 5
  done

  err "SSH timed out after $((attempts * 5)) seconds."
  exit 1
}

# ── Provision Droplet (over SSH, not cloud-init) ─────────────────────────
# cloud-init is unreliable: YAML parsing silently fails if the SSH key
# contains characters that break the template substitution. We do all
# provisioning over SSH as root, which is deterministic and debuggable.

provision_droplet() {
  log "Provisioning droplet over SSH (user, Docker, security hardening)..."

  ssh -i "$SSH_PRIVATE_KEY_PATH" -o StrictHostKeyChecking=no root@"$DROPLET_IP" 'bash -s' << 'PROVISION_EOF'
set -e

echo "[1/7] Creating siplab user..."
if ! id siplab &>/dev/null; then
  useradd -m -s /bin/bash siplab
  echo "siplab ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/siplab
  chmod 440 /etc/sudoers.d/siplab
fi

echo "[2/7] Configuring SSH key for siplab..."
mkdir -p /home/siplab/.ssh
cp /root/.ssh/authorized_keys /home/siplab/.ssh/authorized_keys
chmod 700 /home/siplab/.ssh
chmod 600 /home/siplab/.ssh/authorized_keys
chown -R siplab:siplab /home/siplab/.ssh

echo "[3/7] Installing packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq docker.io docker-compose-v2 fail2ban ufw unattended-upgrades sngrep

echo "[4/7] Adding siplab to docker group..."
usermod -aG docker siplab

echo "[5/7] Hardening SSH..."
cat > /etc/ssh/sshd_config.d/hardening.conf << 'SSHCONF'
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
ClientAliveInterval 300
ClientAliveCountMax 2
MaxAuthTries 3
LoginGraceTime 30
SSHCONF
systemctl restart ssh

echo "[6/7] Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << 'F2B'
[sshd]
enabled = true
maxretry = 3
bantime = 3600
findtime = 600

[asterisk]
enabled = true
filter = asterisk
logpath = /var/log/asterisk/messages
maxretry = 3
bantime = 86400
findtime = 600
F2B

# Asterisk fail2ban filter
cat > /etc/fail2ban/filter.d/asterisk.conf << 'F2BFILTER'
[Definition]
failregex = NOTICE.* .*: Registration from '.*' failed for '<HOST>:.*' - Wrong password
            NOTICE.* .*: Registration from '.*' failed for '<HOST>:.*' - No matching peer found
            SECURITY.* SecurityEvent="FailedACL".*RemoteAddress="IPV4/UDP/<HOST>/.*"
            SECURITY.* SecurityEvent="InvalidPassword".*RemoteAddress="IPV4/UDP/<HOST>/.*"
ignoreregex =
F2BFILTER

systemctl enable fail2ban
systemctl restart fail2ban

echo "[7/7] Configuring UFW (Twilio IPs only) + Docker + auto-updates..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp

# SIP signaling — Twilio IPs only (not open to the internet)
# Source: https://www.twilio.com/docs/sip-trunking/ip-addresses
for cidr in \
  "54.172.60.0/30"    "54.172.60.4/30"    "54.244.51.0/30"    "34.203.250.0/30" \
  "54.171.127.192/30" "35.156.191.128/30" "3.112.80.0/30"     "54.65.63.192/30" \
  "54.252.254.64/30"  "108.141.162.0/30"  "54.246.7.128/30"   "20.125.63.48/30"; do
  ufw allow from "$cidr" to any port 5060 proto udp comment "Twilio SIP"
  ufw allow from "$cidr" to any port 5061 proto tcp comment "Twilio SIP TLS"
done

# RTP media — Twilio media range only
ufw allow from "168.86.128.0/18" to any port 10000:60000 proto udp comment "Twilio RTP"

ufw --force enable

systemctl enable docker
systemctl start docker

# Auto security updates
cat > /etc/apt/apt.conf.d/20auto-upgrades << 'AUTOUPGRADE'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
AUTOUPGRADE

# Create SIP Lab working directory
mkdir -p /home/siplab/sip-lab
chown siplab:siplab /home/siplab/sip-lab

echo "Provisioning complete"
PROVISION_EOF

  ok "Droplet provisioned"
}

# ── Verify siplab User ────────────────────────────────────────────────────

verify_siplab_user() {
  log "Verifying siplab user SSH access..."

  if ssh -i "$SSH_PRIVATE_KEY_PATH" -o StrictHostKeyChecking=no siplab@"$DROPLET_IP" "whoami" &>/dev/null 2>&1; then
    ok "siplab user SSH access works"
  else
    err "Cannot SSH as siplab. Check provisioning logs."
    exit 1
  fi
}

# ── Deploy Docker Configs ─────────────────────────────────────────────────

deploy_configs() {
  log "Deploying Docker configs to droplet..."

  local ssh_opts="-i $SSH_PRIVATE_KEY_PATH -o StrictHostKeyChecking=no"
  local remote="siplab@$DROPLET_IP"

  ssh $ssh_opts "$remote" "mkdir -p ~/sip-lab/asterisk/config ~/sip-lab/sipp/scenarios"

  scp $ssh_opts "$SIP_LAB_DIR/docker-compose.yml" "$remote:~/sip-lab/"
  scp $ssh_opts "$SIP_LAB_DIR/asterisk/Dockerfile" "$remote:~/sip-lab/asterisk/"
  scp $ssh_opts "$SIP_LAB_DIR/asterisk/entrypoint.sh" "$remote:~/sip-lab/asterisk/"
  scp $ssh_opts "$SIP_LAB_DIR/asterisk/config/"* "$remote:~/sip-lab/asterisk/config/"

  if [[ -f "$SIP_LAB_DIR/sipp/Dockerfile" ]]; then
    scp $ssh_opts "$SIP_LAB_DIR/sipp/Dockerfile" "$remote:~/sip-lab/sipp/"
  fi

  ok "Configs deployed"
}

# ── Create Remote Env ─────────────────────────────────────────────────────

create_remote_env() {
  log "Creating .env.sip-lab on droplet..."

  local ssh_opts="-i $SSH_PRIVATE_KEY_PATH -o StrictHostKeyChecking=no"
  local remote="siplab@$DROPLET_IP"

  ssh $ssh_opts "$remote" "cat > ~/sip-lab/.env.sip-lab << ENVEOF
# SIP Lab Docker environment — populated by setup-sip-lab.js
TWILIO_TRUNK_DOMAIN=
SIP_CREDENTIAL_USERNAME=
SIP_CREDENTIAL_PASSWORD=
EXTERNAL_IP=$DROPLET_IP
LOCAL_NET=10.0.0.0/8
ENVEOF
chmod 600 ~/sip-lab/.env.sip-lab"

  ok "Remote .env.sip-lab created (chmod 600)"
}

# ── Start Docker ──────────────────────────────────────────────────────────

start_docker() {
  log "Building and starting Asterisk container..."

  local ssh_opts="-i $SSH_PRIVATE_KEY_PATH -o StrictHostKeyChecking=no"
  local remote="siplab@$DROPLET_IP"

  ssh $ssh_opts "$remote" "cd ~/sip-lab && docker compose up -d --build asterisk"

  log "Waiting for Asterisk healthcheck..."
  local attempts=0
  while [[ $attempts -lt 18 ]]; do
    local status
    status=$(ssh $ssh_opts "$remote" "docker inspect --format='{{.State.Health.Status}}' sip-lab-asterisk 2>/dev/null" || echo "starting")
    if [[ "$status" == "healthy" ]]; then
      ok "Asterisk is healthy"
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 5
  done

  warn "Asterisk health check inconclusive after 90s. Check with:"
  echo "  ssh -i $SSH_PRIVATE_KEY_PATH siplab@$DROPLET_IP 'docker logs sip-lab-asterisk'"
}

# ── Save State ────────────────────────────────────────────────────────────

save_state() {
  log "Saving state to $ENV_FILE..."

  cat > "$ENV_FILE" << ENVEOF
# SIP Lab — DigitalOcean Droplet State
# Created: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# DigitalOcean Resources
DO_DROPLET_ID=$DROPLET_ID
DO_FIREWALL_ID=$FIREWALL_ID
DO_SSH_KEY_ID=$SSH_KEY_ID
SIP_LAB_DROPLET_IP=$DROPLET_IP

# SSH Access
SIP_LAB_SSH_KEY=$SSH_PRIVATE_KEY_PATH
SIP_LAB_SSH_CMD="ssh -i $SSH_PRIVATE_KEY_PATH siplab@$DROPLET_IP"

# Docker environment (also on droplet at ~/sip-lab/.env.sip-lab)
TWILIO_TRUNK_DOMAIN=
SIP_CREDENTIAL_USERNAME=
SIP_CREDENTIAL_PASSWORD=
EXTERNAL_IP=$DROPLET_IP
LOCAL_NET=10.0.0.0/8

# Twilio SIP Resources (set by setup-sip-lab.js)
SIP_LAB_TRUNK_SID=
SIP_LAB_IP_ACL_SID=
SIP_LAB_CREDENTIAL_LIST_SID=
SIP_LAB_ORIGINATION_URL_SID=
SIP_LAB_PHONE_NUMBER_SID=
ENVEOF

  ok "State saved"
}

# ── Summary ───────────────────────────────────────────────────────────────

print_summary() {
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  SIP Lab Droplet Ready"
  echo "══════════════════════════════════════════════════════════"
  echo ""
  echo "  Droplet:  $DROPLET_ID ($DROPLET_IP)"
  echo "  Firewall: $FIREWALL_ID"
  echo "  SSH:      ssh -i $SSH_PRIVATE_KEY_PATH siplab@$DROPLET_IP"
  echo ""
  echo "  Security: SSH←${HOME_IP} | SIP←Twilio | fail2ban | UFW | key-only"
  echo ""
  echo "  Next:"
  echo "    1. node infrastructure/sip-lab/scripts/setup-sip-lab.js"
  echo "    2. Update droplet .env.sip-lab with trunk domain + credentials"
  echo "    3. Restart Asterisk: ssh ... 'cd ~/sip-lab && docker compose restart'"
  echo ""
  echo "  Cost: ~\$6/mo running, ~\$0.30/mo as snapshot"
  echo "  Pause: ./scripts/droplet-snapshot.sh"
  echo "  Resume: ./scripts/droplet-restore.sh"
  echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  SIP Lab — DigitalOcean Droplet Setup"
  echo "══════════════════════════════════════════════════════════"
  echo ""
  echo "  Creates: Cloud firewall + 1vCPU/1GB droplet (~\$6/mo, nyc3)"
  echo "  Installs: Docker + fail2ban + UFW + Asterisk PBX"
  echo ""
  read -p "  Continue? [y/N] " -n 1 -r
  echo ""
  [[ ! $REPLY =~ ^[Yy]$ ]] && { echo "Aborted."; exit 0; }

  check_prerequisites
  setup_ssh_key
  detect_home_ip
  create_firewall
  create_droplet
  wait_for_ssh
  provision_droplet
  verify_siplab_user
  deploy_configs
  create_remote_env
  start_docker
  save_state
  print_summary
}

main "$@"
