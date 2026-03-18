---
name: sip-byoc
description: Twilio SIP connectivity guide (SIP Interface, Elastic Trunking, BYOC). Use when working with enterprise telephony, SIP trunks, carrier connectivity, or PSTN integration.
---

# SIP Connectivity Development Skill

Comprehensive guide for Twilio's three SIP connectivity options: SIP Interface (Programmable SIP), Elastic SIP Trunking, and BYOC. Load this skill when working with enterprise telephony, SIP infrastructure, or carrier connectivity.

---

## Three Products, One Goal

Twilio offers three ways for SIP infrastructure to connect. They serve different purposes:

```
Twilio Voice SIP Connectivity
├── SIP Interface (= SIP Domains = Programmable SIP)
│   ├── Connects SIP infra TO Programmable Voice
│   ├── Full TwiML + API surface area
│   ├── SIP leg at $0.004/min, PSTN leg at PV rates
│   └── BYOC (subtype): carrier sends SIP for non-ported numbers
├── Elastic SIP Trunking
│   ├── Pure PSTN conduit — bypasses Programmable Voice entirely
│   ├── Cheapest option (no PV infrastructure involved)
│   └── Limited upstack: Voice Insights + trunk-level recording only
└── Shared Resources
    ├── IP Access Control Lists (AL) — account-level, reusable
    └── Credential Lists (CL) — account-level, reusable
```

## Quick Decision Matrix

| Question | SIP Interface | Elastic SIP Trunking | BYOC |
|----------|--------------|---------------------|------|
| What is it? | Bridge SIP → Programmable Voice | Dumb PSTN conduit | A type of SIP Interface |
| PV capabilities? | Full (TwiML, APIs, everything) | None (bypasses PV) | Full (TwiML, APIs, everything) |
| Why choose it? | Extend/replace PBX with TwiML | Just need cheap PSTN pipe | Don't want to (or can't) port numbers |
| Who handles PSTN? | Twilio | Twilio | Your carrier |
| Phone numbers? | Twilio numbers | Twilio numbers | Your carrier's numbers |
| SIP Registration? | Yes (agents, desk phones) | No (INVITE-only) | No |
| Pricing | SIP leg $0.004 + PSTN leg at PV rates | Flat trunk rate (cheapest) | Carrier rates + Twilio platform fee |

**Choosing the right one:**

- Customer has PBX/SBC and wants TwiML control over call flows → **SIP Interface**
- Customer has PBX/SBC and just needs a PSTN pipe (no TwiML needed) → **Elastic SIP Trunking**
- Customer has a carrier with numbers they can't/won't port, but wants Twilio PV features → **BYOC**

---

## SIP Interface (Programmable SIP)

### What It Is

SIP Interface connects existing SIP infrastructure (PBXs, SBCs, contact centers) to Twilio's Programmable Voice platform. Calls traverse SIP to/from Twilio, where they can use the full TwiML and API surface: IVRs, call recording, conferencing, TaskRouter, ConversationRelay, etc.

The terms "SIP Interface," "SIP Domains," and "Programmable SIP" are synonyms used interchangeably in Twilio documentation.

### Why It Matters

Enterprise SIP infrastructure (PBX, SBC) is complex — often only one or two people in an organization have the access and knowledge to make changes. SIP Interface lets developers build call logic with TwiML and HTTP APIs instead of wrestling with PBX configuration. A coding bootcamp graduate can write an application to A/B test IVR containment rates, set up call forwarding, or build a voicemail system.

### Architecture

**Inbound (PBX → Twilio → TwiML):**
```
Your PBX/SBC ──SIP INVITE──► Twilio SIP Domain ──► voiceUrl (TwiML)
                                                        │
                                                   Full PV surface:
                                                   TwiML, Studio,
                                                   TaskRouter, etc.
```

**Outbound (TwiML → Twilio → PBX):**
```
TwiML: <Dial><Sip>sip:ext@your-pbx.com</Sip></Dial>
                         │
               Twilio sends SIP INVITE ──► Your PBX/SBC
```

### Key Components

| Component | Purpose | SID Prefix |
|-----------|---------|------------|
| SIP Domain | Entry point for inbound SIP traffic | `SD` |
| IP Access Control List | Whitelist SBC IPs for auth | `AL` |
| Credential List | SIP digest auth credentials | `CL` |

### Inbound Setup (PBX → Twilio)

1. **Create a SIP Domain** with a voiceUrl:
```javascript
const domain = await client.sip.domains.create({
  domainName: 'mycompany.sip.twilio.com',
  voiceUrl: 'https://your-app.com/voice/sip-incoming',
  voiceMethod: 'POST',
});
```

2. **Associate auth** (IP ACL and/or credentials):
```javascript
// IP ACL mapping
await client.sip.domains(domain.sid)
  .auth.calls.ipAccessControlListMappings.create({
    ipAccessControlListSid: aclSid,
  });

// Credential list mapping
await client.sip.domains(domain.sid)
  .auth.calls.credentialListMappings.create({
    credentialListSid: credListSid,
  });
```

3. **Configure your PBX/SBC** to send SIP INVITEs to `mycompany.sip.twilio.com`.

### Outbound (Twilio → PBX)

No SIP Domain setup required for outbound. Use `<Dial><Sip>` in your TwiML:

```xml
<Response>
  <Dial>
    <Sip>sip:extension@your-pbx.com:5060</Sip>
  </Dial>
</Response>
```

Twilio sends the SIP INVITE directly to the target URI.

### SIP Registration

SIP Registration allows users (agents, desk phones, softphone apps) to register a SIP username with Twilio. Registered endpoints can then receive calls via `<Dial><Sip>`.

Use cases: agent logging into desk phone with an extension, user with a SIP VoIP app (e.g., Linphone) on their mobile device.

SIP Registration is a **SIP Interface feature only** — not available with Elastic SIP Trunking.

### Pricing

The SIP leg of the call is charged at $0.004/min. The PSTN leg (if any) is charged at standard PV inbound/outbound rates. This makes SIP Interface calls cheaper than pure PSTN PV calls because one leg avoids PSTN entirely — Twilio communicates directly with authenticated SIP infrastructure.

---

## Elastic SIP Trunking

### What It Is

Elastic SIP Trunking connects SIP infrastructure directly to the PSTN via Twilio's network. It replaces traditional ISDN/PRI trunks with SIP over the internet. Calls bypass Programmable Voice entirely — no TwiML, no APIs, no call flows.

### When To Use

The driving force for Elastic SIP Trunking is cost. It's the cheapest connectivity option because calls skip the PV infrastructure. Use it when the customer has already built their call flows in their PBX/SBC and just needs a reliable, elastic PSTN conduit.

### Architecture

```
Your PBX/SBC ──SIP──► Twilio SIP Trunk ──► PSTN
                           │
                     ┌─────┴──────┐
                     │ Origination │ (inbound: PSTN → your PBX)
                     │ Termination │ (outbound: your PBX → PSTN)
                     └────────────┘
```

### Key Components

| Component | Purpose | SID Prefix |
|-----------|---------|------------|
| SIP Trunk | Container for configuration | `TK` |
| Origination URL | Where inbound calls route to (your SBC/PBX) | — |
| Termination | Outbound via Twilio PSTN | — |
| IP Access Control List | Whitelist your SBC IPs | `AL` |
| Credential List | SIP auth credentials | `CL` |

### Origination (Inbound: PSTN → You)

Calls from PSTN arrive at Twilio, route to your infrastructure:

```javascript
await client.trunking.v1
  .trunks(trunkSid)
  .originationUrls.create({
    friendlyName: 'Primary SBC',
    sipUrl: 'sip:edge.your-sbc.com:5060',
    weight: 10,
    priority: 10,
    enabled: true,
  });
```

**Priority/Weight routing:**
- Lower `priority` value = tried first
- Equal priority → `weight` determines distribution (higher = more traffic)
- Use for failover: primary (priority 10) → backup (priority 20)

### Termination (Outbound: You → PSTN)

Your PBX sends SIP to Twilio, Twilio routes to PSTN:

```
Your PBX → sip:{number}@{trunkSid}.pstn.twilio.com → PSTN
```

Requires authentication via IP ACL or credentials.

### Limited Upstack Features

SIP Trunking bypasses PV, but two upstack features are available:

- **Voice Insights Advanced Features** — enabled at the account level (all-or-nothing). Monitors call quality: jitter, packet loss, latency, codec issues.
- **Trunk-level recording** — enabled per trunk (all-or-nothing, records every call on the trunk). Recorded calls can technically be sent to Conversational Intelligence for transcription, but this is uncommon since cost is usually the driving factor for choosing trunking.

### Recording

Trunk-level recording records ALL traffic through the trunk:

```javascript
await client.trunking.v1.trunks(trunkSid).recording().update({
  mode: 'record-from-ringing',  // or 'record-from-answer', 'do-not-record'
  trim: 'trim-silence',
});
```

### Phone Number Assignment

Associate Twilio phone numbers with the trunk:

```javascript
await client.trunking.v1.trunks(trunkSid)
  .phoneNumbers.create({ phoneNumberSid: 'PNxxxxxxxx' });
```

A phone number can be assigned to either a trunk or Programmable Voice, not both. Numbers on a trunk route inbound calls through the trunk's origination URLs instead of the number's voiceUrl. Remove from trunk to restore webhook behavior.

---

## BYOC (Bring Your Own Carrier)

### What It Is

BYOC is a type of SIP Interface where the customer's existing carrier sends SIP traffic to Twilio. The customer keeps their phone numbers with the carrier and gets full Programmable Voice capabilities through Twilio. BYOC exists because customers sometimes can't or won't port numbers — the carrier won't allow it, the customer doesn't trust Twilio yet, or it's simply not worth the hassle.

### Architecture

```
PSTN ──► Your Carrier ──SIP──► Twilio BYOC Trunk ──► TwiML/Functions
                                       │
                                 Connection Policy
                                 (routes outbound back to carrier)
```

### Key Components

| Component | Purpose | SID Prefix |
|-----------|---------|------------|
| BYOC Trunk | Represents your carrier connection | `BY` |
| Connection Policy | Routing rules for outbound | `NY` |
| Connection Policy Target | Carrier SIP endpoint | `NE` |

### Setup Flow

1. **Create Connection Policy** (where outbound calls route to your carrier):
```javascript
const policy = await client.voice.v1.connectionPolicies.create({
  friendlyName: 'My Carrier Outbound',
});

await client.voice.v1.connectionPolicies(policy.sid)
  .targets.create({
    friendlyName: 'Carrier Primary',
    target: 'sip:carrier-sbc.example.com:5060',
    weight: 10,
    priority: 10,
    enabled: true,
  });
```

2. **Create BYOC Trunk**:
```javascript
const trunk = await client.voice.v1.byocTrunks.create({
  friendlyName: 'My Carrier',
  connectionPolicySid: policy.sid,
  voiceUrl: 'https://your-app.com/voice/incoming',
  voiceMethod: 'POST',
  statusCallbackUrl: 'https://your-app.com/callbacks/call-status',
});
```

3. **Configure your carrier** to send SIP INVITE to Twilio's BYOC endpoint. The carrier must agree to and be able to do this — most will, some can't, some won't.

---

## Shared Resources: IP ACLs and Credential Lists

IP Access Control Lists and Credential Lists are **account-level resources**, not subresources of trunks or domains. They can be associated with both SIP Domains (SIP Interface) and SIP Trunks (Elastic SIP Trunking). A customer might reuse the same ACL/credentials across both, or maintain separate ones per use case. Each account can have up to 1000 of each.

**IP Access Control Lists** — whitelist your SBC IPs:
```javascript
const acl = await client.sip.ipAccessControlLists.create({
  friendlyName: 'Production SBCs',
});

await client.sip.ipAccessControlLists(acl.sid)
  .ipAddresses.create({
    friendlyName: 'Primary SBC',
    ipAddress: '203.0.113.10',
  });
```

**Credential Lists** — SIP digest auth:
```javascript
const credList = await client.sip.credentialLists.create({
  friendlyName: 'SBC Credentials',
});

await client.sip.credentialLists(credList.sid)
  .credentials.create({
    username: 'sbc-primary',
    password: 'secure-password-here',
  });
```

**Use IP ACLs** for static infrastructure (SBCs with fixed IPs). **Use credentials** for dynamic/cloud infrastructure where IPs change.

---

## Common Gotchas

1. **SIP Interface ≠ Elastic SIP Trunking**: SIP Interface gives you Programmable Voice. Elastic SIP Trunking bypasses it. They solve different problems.

2. **Origination priority/weight confusion**: Priority is tried in ORDER (low first). Weight is RANDOM distribution within same priority. Don't set weight=100 thinking it means "100% traffic" — it's relative.

3. **Number on trunk loses voiceUrl**: A phone number can only be assigned to a trunk OR Programmable Voice, not both. When assigned to a trunk, inbound calls route through origination URLs. Remove from trunk to restore webhook behavior.

4. **BYOC requires carrier cooperation**: Your carrier must agree and be able to send SIP INVITEs to Twilio's endpoints. Most will, some can't, some won't. YMMV.

5. **Recording on trunks is ALL or NOTHING**: Trunk-level recording records every call. For selective recording, use per-call `<Start><Recording>` in your TwiML (SIP Interface only — trunking has no TwiML).

6. **Codec support**: Twilio SIP supports G.711 (PCMU/PCMA) and Opus. If your PBX uses other codecs (G.729, G.722), ensure transcoding is available.

7. **SIP Registration is SIP Interface only**: Elastic SIP Trunking is INVITE-only. No registration required or supported.

## Common Misconceptions

Outdated tutorials (especially pre-2020 Asterisk guides) propagate these incorrect patterns:

| Misconception | Reality |
|---------------|---------|
| Use `sip.us1.twilio.com` endpoint | Endpoint is `{trunkSid}.pstn.twilio.com` — trunk-specific since Elastic SIP Trunking |
| Configure `auth_realm` | Not a Twilio concept. Twilio uses IP ACL + Credential List auth, not realm-based digest |
| SIP REGISTER required for trunking | Elastic SIP Trunking is INVITE-only. Registration is a SIP Interface feature for endpoints like desk phones |
| Single global SIP endpoint | Each trunk has its own endpoint. Multiple trunks = multiple endpoints |
| `sips:` requires special setup | Set `secure: true` on trunk creation and use `sips:` scheme in origination URLs |
| BYOC is the alternative to SIP Trunking | BYOC is a type of SIP Interface. The real choice is SIP Interface vs Elastic SIP Trunking |

## MCP Tools Available

**SIP Domains (SIP Interface):** `list/get/create/update/delete_sip_domain`, legacy top-level IP ACL and credential list mappings on domains

**SIP Domain Auth (v2):** Separate auth for calls vs registrations:
- Calls (credential): `list/create/delete_sip_domain_auth_calls_credential_list_mapping`
- Calls (IP ACL): `list/create/delete_sip_domain_auth_calls_ip_acl_mapping`
- Registrations: `list/create/delete_sip_domain_auth_registrations_credential_list_mapping`

**IP ACLs & Credentials (shared):** `list/get/create/update/delete_sip_ip_access_control_list`, `list/get/create/update/delete_sip_ip_address`, `list/get/create/update/delete_sip_credential_list`, `list/get/create/update/delete_sip_credential`

**Trunking:** `list/get/create/update/delete_sip_trunk`, `list/create/update/delete_origination_url`, IP ACL and credential list association, phone number association, recording settings

**BYOC:** `list/get/create/update/delete_byoc_trunk`, `list/create/get/delete_connection_policy`, `list/create/delete_connection_policy_target`

**Validation:** `validate_sip(trunkSid, domainSid, expectedPbxIp)` — deep validation checking trunk, IP ACLs, credentials, origination URLs, phone numbers, and debugger for SIP errors
