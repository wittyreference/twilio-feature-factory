# Compliance & Regulatory Skill

Guide for Twilio regulatory compliance: A2P 10DLC messaging registration, regulatory bundles for phone numbers, TrustHub identity verification, and end-user management. Load this skill when dealing with number compliance, brand registration, or carrier requirements.

---

## Quick Decision: What Compliance Do You Need?

| Scenario | Required Compliance | Urgency |
|----------|-------------------|---------|
| Sending SMS in the US via local numbers | A2P 10DLC registration | **Critical** — unregistered = blocked |
| Sending SMS via toll-free numbers | Toll-free verification | **High** — required for production |
| Buying phone numbers in regulated countries | Regulatory bundles | **Blocking** — can't buy without |
| Sending WhatsApp messages | WhatsApp Business approval | **Required** — no approval = no sending |
| High-volume messaging | Messaging Service + campaign | **Required** for throughput |

---

## A2P 10DLC (US SMS Compliance)

### What It Is

Application-to-Person 10-Digit Long Code. US carriers require businesses sending SMS via local numbers to register their brand and use cases. Without registration, messages get error **30034** (blocked by carrier).

### Registration Flow

```
1. Create Customer Profile (TrustHub) → brand identity
2. Register Brand → carrier vetting (1-7 business days)
3. Create Campaign → describe your use case
4. Associate Numbers → link phone numbers to campaigns
5. Start Sending → with approved throughput
```

### Step 1: Customer Profile (TrustHub)

```javascript
// Create customer profile
const profile = await client.trusthub.v1.customerProfiles.create({
  friendlyName: 'My Business Profile',
  policySid: 'RNxxxxxxxx',  // A2P messaging policy
  email: 'compliance@example.com',
});

// Create end user (the business entity)
const endUser = await client.trusthub.v1.endUsers.create({
  friendlyName: 'My Business',
  type: 'customer_profile_business_information',
  attributes: {
    business_name: 'Acme Corp',
    business_type: 'Corporation',
    business_registration_identifier: 'EIN',
    business_registration_number: '12-3456789',
    business_industry: 'TECHNOLOGY',
    website_url: 'https://acme.example.com',
    social_media_profile_urls: '',
    business_regions_of_operation: 'USA_AND_CANADA',
  },
});

// Assign end user to profile
await client.trusthub.v1
  .customerProfiles(profile.sid)
  .customerProfilesEntityAssignments.create({
    objectSid: endUser.sid,
  });

// Submit for review
await client.trusthub.v1.customerProfiles(profile.sid).update({
  status: 'pending-review',
});
```

### Step 2: Brand Registration

Done through Twilio Console or API after Customer Profile is approved:
- Console: Messaging → Trust Hub → US A2P Brand Registration
- Vetting takes 1-7 business days
- Brand score affects throughput limits

### Step 3: Campaign Registration

```javascript
// Check available use cases
const useCases = await client.messaging.v1
  .services(messagingServiceSid)
  .usAppToPersonUsecases.list();

// A2P campaigns are registered through Twilio Console
// Console: Messaging → Services → [service] → Compliance Info
```

### Campaign Use Cases & Throughput

| Use Case | Description | Typical MPS |
|----------|-------------|-------------|
| `2fa` | Two-factor authentication | Highest |
| `account_notification` | Account alerts | High |
| `customer_care` | Support conversations | High |
| `delivery_notification` | Shipping updates | High |
| `marketing` | Promotional messages | Standard |
| `mixed` | Multiple use cases | Standard |
| `polling_voting` | Surveys | Standard |
| `public_service_announcement` | PSAs | Standard |

MPS = Messages Per Second. Actual throughput depends on brand score (low/medium/high).

### Checking Registration Status

```bash
# Brand registrations
twilio api:messaging:v1:brand-registrations:list

# Campaign status on a Messaging Service
twilio api:messaging:v1:services:us-app-to-person:list \
  --messaging-service-sid $TWILIO_MESSAGING_SERVICE_SID
```

---

## Regulatory Bundles (Phone Number Compliance)

### What They Are

Many countries require identity verification before you can purchase phone numbers. Regulatory bundles package the required documents and end-user information for a specific country and number type.

### When You Need Them

| Country | Local Numbers | Toll-Free | Mobile |
|---------|:------------:|:---------:|:------:|
| US | No | No | — |
| UK | Yes | No | — |
| Germany | Yes | Yes | Yes |
| Australia | Yes | No | — |
| France | Yes | Yes | — |
| Japan | Yes | — | — |

**Rule of thumb:** Most European and Asian countries require regulatory bundles. US and Canada generally don't for basic numbers.

### Bundle Creation Flow

```
1. Check regulations for country + number type
2. Create supporting documents (business license, ID, address proof)
3. Create end user
4. Create bundle → attach documents + end user
5. Submit for review
6. Once approved → can purchase numbers
```

### API Pattern

```javascript
// List regulations for a country
const regulations = await client.numbers.v2.regulatoryCompliance
  .regulations.list({ isoCountry: 'DE', numberType: 'local' });

// Create supporting document
const doc = await client.numbers.v2.regulatoryCompliance
  .supportingDocuments.create({
    friendlyName: 'Business Registration',
    type: 'business_registration',
    attributes: {
      business_name: 'Acme GmbH',
      business_registration_number: 'HRB 12345',
    },
  });

// Create end user
const endUser = await client.numbers.v2.regulatoryCompliance
  .endUsers.create({
    friendlyName: 'Acme GmbH',
    type: 'business',
    attributes: {
      business_name: 'Acme GmbH',
      business_registration_number: 'HRB 12345',
    },
  });

// Create bundle
const bundle = await client.numbers.v2.regulatoryCompliance
  .bundles.create({
    friendlyName: 'Germany Local Numbers',
    email: 'compliance@acme.com',
    isoCountry: 'DE',
    numberType: 'local',
    regulationSid: regulations[0].sid,
  });

// Attach document and end user
await client.numbers.v2.regulatoryCompliance
  .bundles(bundle.sid)
  .itemAssignments.create({ objectSid: doc.sid });

await client.numbers.v2.regulatoryCompliance
  .bundles(bundle.sid)
  .itemAssignments.create({ objectSid: endUser.sid });

// Submit for review
await client.numbers.v2.regulatoryCompliance
  .bundles(bundle.sid).update({ status: 'pending-review' });
```

### Bundle Status Values

| Status | Meaning |
|--------|---------|
| `draft` | Not submitted, can edit |
| `pending-review` | Submitted, awaiting Twilio review |
| `in-review` | Being reviewed |
| `twilio-approved` | Approved by Twilio, sent to carrier |
| `provisionally-approved` | Temporary approval (some countries) |
| `approved` | Fully approved, can purchase numbers |
| `rejected` | Missing or incorrect information |

---

## TrustHub (Business Identity)

### What It Is

TrustHub is Twilio's identity verification platform. It's the foundation for A2P 10DLC, SHAKEN/STIR, and Branded Calling.

### Profile Types

| Profile Type | Used For |
|-------------|----------|
| Customer Profile | A2P 10DLC brand registration |
| Trust Product | SHAKEN/STIR, Branded Calling |
| Supporting Document | Business license, utility bill, ID |
| End User | Business or individual identity |

### Checking Policies

```javascript
// List available policies (determines what documents are needed)
const policies = await client.trusthub.v1.policies.list();
```

---

## Common Gotchas

1. **A2P 10DLC is per-campaign, not per-number**: One campaign can cover multiple numbers in a Messaging Service. Don't create separate campaigns per number.

2. **Brand vetting is NOT instant**: Budget 1-7 business days. Start registration early in the project, not at launch.

3. **Toll-free verification is separate from 10DLC**: Toll-free numbers have their own verification process. They don't need 10DLC but DO need toll-free verification for production messaging.

4. **Regulatory bundle rejection = no numbers**: In regulated countries, you cannot purchase numbers until your bundle is approved. Have a backup plan (use existing numbers, use a different country).

5. **Trial accounts have different filtering**: Trial accounts may send SMS without 10DLC registration but with heavy filtering. Don't assume production will behave the same.

6. **`status: 'pending-review'` is a one-way door**: Once submitted, you can't edit the bundle. Create a new one if changes are needed.

7. **Customer Profile vs Regulatory Bundle**: These are DIFFERENT systems. Customer Profile = TrustHub (identity for A2P). Regulatory Bundle = Numbers API (compliance for purchasing). Both may be needed.

## MCP Tools Available

TrustHub: `create/list/get/update/delete_customer_profile`, entity assignments, `list/get/create/update/delete_trust_product`, `list/create_end_user`, `list_policies`, `list_supporting_documents`

Regulatory: `list/get/create/update/delete_regulatory_bundle`, `list/create/delete_bundle_item_assignment`, `list/get/create/update/delete_supporting_document`, `list/create_regulatory_end_user`, `list_regulations`

Messaging Services: `get_a2p_status`, `list_messaging_services`
