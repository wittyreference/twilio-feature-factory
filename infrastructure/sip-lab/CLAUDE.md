# SIP Lab — Local PBX for Twilio SIP Testing

Dockerized Asterisk PBX on a hardened DigitalOcean droplet for testing Twilio Elastic SIP Trunking and Programmable Voice SIP Domains with real SIP/RTP traffic.

## Quick Start

```bash
# 1. One-time: Install doctl and authenticate
brew install doctl
doctl auth init  # Paste your API token from cloud.digitalocean.com/account/api/tokens

# 2. Create hardened droplet (~$6/mo, nyc3)
./scripts/droplet-setup.sh

# 3. Provision Twilio SIP resources (trunk, ACL, credentials)
node scripts/setup-sip-lab.js

# 4. Update droplet with trunk credentials, restart Asterisk
ssh -i ~/.ssh/sip-lab siplab@<DROPLET_IP>
# Edit ~/sip-lab/.env.sip-lab with TWILIO_TRUNK_DOMAIN, SIP_CREDENTIAL_USERNAME, SIP_CREDENTIAL_PASSWORD
docker compose restart asterisk

# 5. Test: Make a call to your trunk-associated number
# Twilio routes to Asterisk, which answers and plays audio
```

## Architecture

| Component | Purpose | Port |
|-----------|---------|------|
| Asterisk (Docker) | SIP PBX — answers/originates calls | 5060/UDP, 5061/TCP |
| SIPp (Docker, optional) | SIP traffic generation | - |
| sngrep (Docker, optional) | SIP message debugging | - |
| DigitalOcean Firewall | Network perimeter — Twilio IPs only | - |

## TLS / Secure Trunking

Asterisk generates a **self-signed TLS certificate** at first startup (10-year validity, RSA 2048-bit). Twilio accepts self-signed certs from the PBX side.

| Mode | Transport | Media | Trunk `secure` flag | Dialplan context |
|------|-----------|-------|---------------------|-----------------|
| Plain | UDP 5060 | RTP | `false` (default) | `outbound-via-twilio` |
| Secure | TLS 5061 | SRTP | `true` | `outbound-via-twilio-secure` |

**How it works:**
- `entrypoint.sh` generates cert + key in `/etc/asterisk/tls/` if they don't exist
- `pjsip.conf` defines both `[transport-udp]` and `[transport-tls]`
- Secure trunk endpoint uses `media_encryption=sdes` for SRTP
- System CA bundle (`ca-certificates`) is copied so Asterisk can verify Twilio's DigiCert cert (`verify_server=yes`)
- Cert persists across container restarts via the Docker volume (regenerated only on first run)

**To enable secure trunking:**
1. Set `secure: true` on the Twilio trunk (via MCP: `update_sip_trunk`)
2. Add `transport=tls` to your origination URL: `sips:<IP>:5061;transport=tls`
3. Use the `outbound-via-twilio-secure` dialplan context for outbound

## Security (4 Layers)

1. **Cloud Firewall**: SSH from your IP only, SIP from Twilio IPs only, RTP from Twilio media range
2. **UFW**: Host firewall mirrors cloud rules (defense if cloud firewall misconfigured)
3. **fail2ban**: Auto-bans brute force on SSH (3 attempts) and Asterisk SIP auth
4. **SSH hardening**: Key-only auth, no root login, idle timeout

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/droplet-setup.sh` | Create DO droplet + firewall + deploy configs |
| `scripts/droplet-destroy.sh` | Destroy droplet (optional snapshot first) |
| `scripts/droplet-snapshot.sh` | Snapshot + destroy (pause billing to ~$0.30/mo) |
| `scripts/droplet-restore.sh` | Restore from snapshot |
| `scripts/update-firewall-ip.sh` | Update SSH rule when your home IP changes |
| `scripts/setup-sip-lab.js` | Provision Twilio SIP resources |
| `scripts/teardown-sip-lab.js` | Tear down Twilio SIP resources |

## Test Phases

### Phase A: Termination (Twilio→PBX)

Twilio receives inbound PSTN call on trunk-associated number, sends SIP INVITE to Asterisk.

**Asterisk dialplan** (`[from-twilio]`):
- Default: Answer, play audio, hangup
- Extension 600: Echo test (latency)
- Extension 700: DTMF test (read digits, say back)
- Extension 800: Record and playback

### Phase B: Origination (PBX→Twilio→PSTN)

Asterisk sends SIP INVITE to `{trunk}.pstn.twilio.com` with digest auth.

```bash
# From the droplet:
docker exec sip-lab-asterisk asterisk -rx "channel originate PJSIP/+1NXXNXXXXXX@twilio-trunk application Playback tt-weasels"
```

### Phase C: SIP Domains (Programmable Voice)

SIP UA registers to Twilio SIP Domain. Requires additional MCP tools (see below).

### Phase D: Full PSTN Connectivity Validation (automated)

End-to-end test proving the complete call path works with recording and transcription.

```bash
# Run all SIP Lab E2E tests
npm run test:sip-lab
# Or directly
./scripts/run-sip-lab-e2e.sh
```

**Test file**: `__tests__/e2e/sip-lab/pstn-connectivity.test.js`

**What it validates**:
1. Outbound API call from a Twilio number TO the trunk-associated number
2. Call routes through SIP trunk to Asterisk, is answered, audio plays
3. Call recording captured via `record: true` on API call
4. Voice Intelligence transcript created from recording SID
5. No SIP errors (13xxx, 64xxx) in debugger during test window

**Prerequisites**: Running droplet with Asterisk, provisioned trunk with phone number, Voice Intelligence service (auto-discovered if `TWILIO_INTELLIGENCE_SERVICE_SID` not set).

## Twilio SIP Resource Lifecycle

Provisioned by `setup-sip-lab.js` in this order:

1. IP ACL → Add PBX IP
2. Credential List → Add credential (12+ chars, mixed case + digit)
3. SIP Trunk → Associate ACL + Credentials
4. Origination URL → PBX IP:5060
5. (Optional) Phone number → Associate with trunk

Torn down in reverse by `teardown-sip-lab.js`.

## Gotchas

- **Trunk phone number loses voice webhook**: Associating a number with a SIP trunk removes its voice URL. Use a separate number.
- **Twilio SIP IPs change**: Check https://www.twilio.com/docs/sip-trunking/ip-addresses periodically. Update `pjsip.conf.template` identify section and DO firewall.
- **One-way audio**: Usually NAT. Verify `EXTERNAL_IP` in `.env.sip-lab` matches the droplet's public IP.
- **Docker Desktop macOS**: `network_mode: host` maps to Linux VM, not macOS. Use the DO droplet for real SIP traffic.
- **SIP REGISTER not supported**: Elastic SIP Trunking uses INVITE-only auth. Don't configure SIP registration.
- **Twilio sends E.164 numbers with `+` prefix**: The dialplan must match `_+.` not just `_X.` — Asterisk's `X` pattern only matches digits 0-9, not `+`. A mismatch causes a SIP 404 with zero Twilio-side diagnostics (no debugger alerts, no call notifications). Voice Insights `last_sip_response_num: 404` is the only clue.
- **UFW must restrict SIP to Twilio IPs**: A wide-open `ufw allow 5060/udp` invites SIP scanner spam that floods Asterisk logs, making real call debugging nearly impossible. Use per-CIDR rules for each Twilio signaling IP range.
- **Playback() needs absolute path for volume-mounted sounds**: `Playback(custom/careless-whisper)` returns instantly (0ms, no audio) even when the file exists. Asterisk's sound search path doesn't traverse volume-mounted subdirectories. Use `Playback(/usr/share/asterisk/sounds/custom/careless-whisper)` with full absolute path.
- **`external_media_address` must match current droplet IP**: After snapshot/restore, the droplet gets a new IP but the Asterisk config still has the old one. SIP signaling works (200 OK) but RTP goes to a dead address — caller hears silence. Fix: update `.env.sip-lab` and `docker compose up --build --force-recreate` (restart alone doesn't regenerate config).
- **Cloud firewall loses droplet association on snapshot/restore**: `droplet_ids` becomes empty. Re-associate after every restore: `doctl compute firewall add-droplets <FW_ID> --droplet-ids <DROPLET_ID>`.
- **Twilio RTP port range is 10000-60000**: Asterisk's `rtp.conf` range (10000-10100) is for outbound only. Twilio sends inbound RTP from 10000-60000. Firewall must allow the full range from `168.86.128.0/18`.
- **Trunking API is on `trunking.twilio.com`**: REST endpoint is `https://trunking.twilio.com/v1/Trunks/{SID}`, not `api.twilio.com`.

## Cost Control

| State | Monthly Cost |
|-------|-------------|
| Running droplet | ~$6 |
| Snapshot only | ~$0.30 |
| Destroyed | $0 |

Set billing alert at $10: https://cloud.digitalocean.com/account/billing

## Files

```
infrastructure/sip-lab/
├── CLAUDE.md                    # This file
├── docker-compose.yml           # Asterisk + SIPp + sngrep
├── cloud-init.yml               # Droplet provisioning template
├── .env.sip-lab.example         # Env var template
├── asterisk/
│   ├── Dockerfile
│   ├── entrypoint.sh            # envsubst config templating
│   └── config/
│       ├── pjsip.conf.template  # PJSIP trunk config (templated)
│       ├── extensions.conf      # Dialplan
│       ├── modules.conf         # Minimal module loading
│       ├── rtp.conf             # Port range 10000-10100
│       ├── asterisk.conf        # Core settings
│       └── logger.conf          # Logging config
├── sipp/
│   ├── Dockerfile
│   └── scenarios/               # SIPp test XML scenarios
└── scripts/                     # Setup, teardown, droplet management
```
