# SIP & BYOC Development Skill

Comprehensive guide for Twilio SIP Trunking (Elastic SIP Trunking) and Bring Your Own Carrier (BYOC) connectivity. Load this skill when working with enterprise telephony, SIP infrastructure, or carrier migration.

---

## Quick Decision: SIP Trunking vs BYOC

| Question | SIP Trunking | BYOC |
|----------|-------------|------|
| Who provides the carrier? | Twilio IS the carrier | You keep your existing carrier |
| Who provides phone numbers? | Twilio | Your carrier |
| PSTN connectivity via? | Twilio's network | Your carrier's network |
| When to use? | Replacing legacy PBX/carrier | Already have carrier contracts, want Twilio programmability |
| Pricing model? | Twilio per-minute rates | Your carrier rates + Twilio platform fee |

**Default recommendation:** SIP Trunking. Simpler setup, single vendor, Twilio handles PSTN. Only recommend BYOC when the customer has existing carrier contracts they can't or won't migrate.

---

## Elastic SIP Trunking

### What It Is

Elastic SIP Trunking connects your IP communications infrastructure (PBX, SBC, contact center) directly to Twilio's PSTN network. It replaces traditional ISDN/PRI trunks with SIP over the internet.

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
// Add origination URL to trunk
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

### Security

**IP Access Control Lists** — whitelist your SBC IPs:
```javascript
// Create ACL
const acl = await client.sip.ipAccessControlLists.create({
  friendlyName: 'Production SBCs',
});

// Add IP address
await client.sip.ipAccessControlLists(acl.sid)
  .ipAddresses.create({
    friendlyName: 'Primary SBC',
    ipAddress: '203.0.113.10',
  });

// Associate with trunk
await client.trunking.v1.trunks(trunkSid)
  .ipAccessControlLists.create({ ipAccessControlListSid: acl.sid });
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

await client.trunking.v1.trunks(trunkSid)
  .credentialLists.create({ credentialListSid: credList.sid });
```

### Recording

Trunk-level recording records ALL traffic through the trunk:

```javascript
// Get current recording settings
const recording = await client.trunking.v1
  .trunks(trunkSid).recording().fetch();

// Enable recording on all calls
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

Numbers on a trunk route inbound calls through the trunk's origination URLs instead of the number's voiceUrl.

---

## BYOC (Bring Your Own Carrier)

### What It Is

BYOC lets you route calls through your existing carrier while using Twilio's programmable features (TwiML, Studio, TaskRouter). Your carrier handles PSTN; Twilio handles application logic.

### Architecture

```
PSTN ──► Your Carrier ──SIP──► Twilio BYOC Trunk ──► TwiML/Functions
                                       │
                                 Connection Policy
                                 (routes back to carrier)
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
  voiceUrl: 'https://your-app.com/voice/incoming',  // TwiML for inbound
  voiceMethod: 'POST',
  statusCallbackUrl: 'https://your-app.com/callbacks/call-status',
});
```

3. **Configure your carrier** to send SIP INVITE to Twilio's BYOC endpoint.

### BYOC vs SIP Trunking Key Differences

| Aspect | SIP Trunking | BYOC |
|--------|-------------|------|
| Phone numbers | Must be Twilio numbers | Can be your carrier's numbers |
| PSTN routing | Twilio handles | Your carrier handles |
| voiceUrl on trunk | N/A (uses origination URLs) | Yes (TwiML for inbound) |
| Connection Policy | N/A | Required for outbound |
| Billing | Twilio minute rates | Carrier rates + Twilio fee |
| Emergency calling | Twilio handles | Your carrier handles |

---

## Common Gotchas

1. **IP ACL vs Credentials**: Use IP ACLs for static infrastructure (SBCs). Use credentials for dynamic/cloud infrastructure where IPs change.

2. **Origination priority/weight confusion**: Priority is tried in ORDER (low first). Weight is RANDOM distribution within same priority. Don't set weight=100 thinking it means "100% traffic" — it's relative.

3. **Number on trunk loses voiceUrl**: When a phone number is assigned to a SIP trunk, inbound calls route through the trunk's origination URLs, NOT the number's voiceUrl. Remove from trunk to restore webhook behavior.

4. **BYOC requires carrier cooperation**: Your carrier must be able to send SIP to Twilio's endpoints. Not all carriers support this.

5. **Recording on trunks is ALL or NOTHING**: Trunk-level recording records every call. For selective recording, use per-call `<Start><Recording>` in your TwiML instead.

6. **Codec support**: Twilio SIP supports G.711 (PCMU/PCMA) and Opus. If your PBX uses other codecs (G.729, G.722), ensure transcoding is available.

## MCP Tools Available

SIP: `list/get/create/update/delete_sip_ip_access_control_list`, `list/get/create/update/delete_sip_ip_address`, `list/get/create/update/delete_sip_credential_list`, `list/get/create/update/delete_sip_credential`

Trunking: `list/get/create/update/delete_sip_trunk`, `list/create/update/delete_origination_url`, IP ACL and credential list association, phone number association, recording settings

BYOC: `list/get/create/update/delete_byoc_trunk`, `list/create/get/delete_connection_policy`, `list/create/delete_connection_policy_target`
