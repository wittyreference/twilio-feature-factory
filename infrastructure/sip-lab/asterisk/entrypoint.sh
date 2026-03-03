#!/bin/sh
# ABOUTME: Docker entrypoint that generates TLS certs and templates Asterisk config files.
# ABOUTME: Creates self-signed cert for SIP/TLS, runs envsubst on .template files, then starts Asterisk.

set -e

# Default values if not set
export EXTERNAL_IP="${EXTERNAL_IP:-127.0.0.1}"
export LOCAL_NET="${LOCAL_NET:-10.0.0.0/8}"
export TWILIO_TRUNK_DOMAIN="${TWILIO_TRUNK_DOMAIN:-placeholder.pstn.twilio.com}"
export SIP_CREDENTIAL_USERNAME="${SIP_CREDENTIAL_USERNAME:-siplab}"
export SIP_CREDENTIAL_PASSWORD="${SIP_CREDENTIAL_PASSWORD:-placeholder}"

# ── Generate self-signed TLS certificate ──────────────────────────────────
# Twilio accepts self-signed certs from the PBX side.
# The PBX must trust Twilio's CA (DigiCert) — handled by ca-certificates package.

TLS_DIR="/etc/asterisk/tls"
TLS_CERT="$TLS_DIR/asterisk.pem"
TLS_KEY="$TLS_DIR/asterisk.key"
TLS_CA="$TLS_DIR/ca-bundle.pem"

if [ ! -f "$TLS_CERT" ] || [ ! -f "$TLS_KEY" ]; then
  echo "Generating self-signed TLS certificate..."
  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "$TLS_KEY" \
    -out "$TLS_CERT" \
    -days 3650 \
    -subj "/CN=sip-lab/O=SIP Lab/C=US" \
    -addext "subjectAltName=IP:${EXTERNAL_IP}"
  echo "TLS certificate generated (valid 10 years, CN=sip-lab, SAN=IP:${EXTERNAL_IP})"
else
  echo "TLS certificate exists, skipping generation"
fi

# Copy system CA bundle so Asterisk can verify Twilio's DigiCert certificate
# Alpine uses /etc/ssl/certs/ca-certificates.crt, Ubuntu uses the same path
for ca_path in /etc/ssl/certs/ca-certificates.crt /etc/ssl/cert.pem; do
  if [ -f "$ca_path" ]; then
    cp "$ca_path" "$TLS_CA"
    break
  fi
done

# Fix ownership
chown -R asterisk:asterisk "$TLS_DIR"
chmod 600 "$TLS_KEY"

# Export TLS paths for envsubst
export TLS_CERT TLS_KEY TLS_CA

# ── Template pjsip.conf ──────────────────────────────────────────────────

if [ -f /etc/asterisk/pjsip.conf.template ]; then
  envsubst < /etc/asterisk/pjsip.conf.template > /etc/asterisk/pjsip.conf
  echo "Generated pjsip.conf (EXTERNAL_IP=$EXTERNAL_IP, TRUNK=$TWILIO_TRUNK_DOMAIN)"
fi

# Ensure correct ownership
chown -R asterisk:asterisk /etc/asterisk /var/log/asterisk

exec "$@"
