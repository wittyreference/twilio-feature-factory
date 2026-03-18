# Competitor Terminology, Deprecations, and Supplementary

Competitor terminology mapping, Conversations API deprecation notice, WhatsApp channel guidance, and legend.

---

## Competitor Terminology Mapping

When users describe features using non-Twilio terminology (common when migrating from Vonage/Nexmo, Bandwidth, Plivo, etc.):

| Competitor Term | Twilio Equivalent | Notes |
|----------------|-------------------|-------|
| Vonage Voice API | Twilio Voice API | Similar REST + webhook model |
| Vonage NCCO | TwiML | JSON actions vs XML verbs |
| Vonage `talk` action | `<Say>` verb | |
| Vonage `input` action | `<Gather>` verb | |
| Vonage `connect` action | `<Dial>` verb | |
| Vonage `record` action | `<Record>` verb or `<Dial record>` | |
| Vonage Conversation API | Twilio Conversations API (sunset) → Flex Conversations | |
| Vonage AI Studio | ConversationRelay + LLM | Twilio doesn't bundle LLM; BYO-LLM via WebSocket |
| Bandwidth `<SpeakSentence>` | `<Say>` | |
| Bandwidth `<Transfer>` | `<Dial>` | |
| Plivo XML | TwiML | Similar verb-based approach |
| Generic "SIP trunk" | Elastic SIP Trunking (PSTN conduit) or SIP Interface (Programmable SIP) — ask which they need | |
| Generic "SIP domain" | SIP Interface / Programmable SIP (NOT Elastic SIP Trunking) | |
| Generic "CPaaS" | Twilio (the platform itself) | |

---

## Conversations API Deprecation

The Twilio Conversations API is being sunset. For new projects:
- **Chat/messaging orchestration**: Use Flex Conversations instead
- **Voice AI conversations**: Use ConversationRelay (WebSocket-based, real-time)
- **Multi-channel**: Evaluate Flex for unified agent experience

Do not recommend Conversations API for new prototypes.

---

## WhatsApp Channel

WhatsApp on Twilio requires additional setup beyond standard messaging:

| Requirement | Details |
|-------------|---------|
| Business Profile | Must be approved by Meta/WhatsApp |
| Template messages | Outbound messages must use pre-approved templates (24h session window exception) |
| Sandbox | Available for testing, but limited to pre-registered numbers |
| A2P 10DLC | Not applicable (WhatsApp has its own compliance) |

**Not suitable for quick prototyping** — the Business Profile approval process takes days to weeks. Use the WhatsApp Sandbox for development, but note it has limitations (5 registered numbers max, no templates).

---

## Legend

- `(†)` — Borderline item: appeared potentially highlighted in the source material but was difficult to confirm visually. Verify relevance with the user before recommending.
