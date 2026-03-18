---
name: voice-use-case-map
description: Voice use case to Twilio product mapping. Use when recommending which Twilio product fits a voice use case — IVR, contact center, Voice AI, recording, conferencing, or SIP.
---

# Voice Use Case Product Map

Definitive per-use-case product mapping for Twilio Voice. Load this skill when recommending Twilio products for a voice use case.

## Quick Reference

| UC | Name | Core Products | Key Feature | Prototype? |
|----|------|--------------|-------------|------------|
| 1 | Voice Notifications | Voice API, Say, Gather, AMD, Recording | Outbound reminder + speech confirm | No — well-understood APIs |
| 2 | Self-Service (IVR) | Voice API, Say, Gather, Recording | Multi-level menu, DTMF + speech | No — well-understood APIs |
| 3 | Inbound Contact Center | TaskRouter, Conference, Recording, Sync | Skills-based routing to agents | Yes — TaskRouter reservation flow |
| 4 | Outbound Contact Center | Conference, Participants API, AMD, Recording | Agent-first then connect customer | Yes — AMD timing, Participants API |
| 5 | AI Agents (ConversationRelay) | ConversationRelay, Recording, Sync, SMS | WebSocket LLM integration | Yes — WebSocket protocol, voice selection |
| 6 | AI Agents (Media Streams) | `<Connect><Stream>`, Recording | Raw audio WebSocket, bring-your-own STT/TTS | Yes — raw audio format, STT/TTS integration |
| 7 | Sales Dialer | Conference, AMD, Recording, Participants API | Parallel/power dialing | Yes — AMD + parallel dial timing |
| 8 | Call Tracking | Voice API, Say (whisper), Dial, Recording, Sync | Campaign attribution + forwarding | No — well-understood APIs |
| 9 | PSTN Connectivity | Elastic SIP Trunking (primary), BYOC | Carrier interconnect (Elastic SIP Trunking validated in SIP Lab, SIP Interface Phase C TODO) | Yes — SIP registration (SIP Interface only), TLS, E.164 dialplan |
| 10 | AI/ML Transcription | Voice Intelligence, Language Operators | Post-call analysis of recordings | Yes — `source_sid` vs `media_url`, operator config |

**Complements:** `.claude/skills/voice.md` (decision frameworks), `functions/conversation-relay/CLAUDE.md` (ConversationRelay protocol details).

## Decision Tree

**Start here:** What is the caller experience?

```
Is this outbound (you initiate) or inbound (caller dials you)?
├── Outbound
│   ├── Automated message / reminder? → UC 1 (Voice Notifications)
│   ├── Sales prospecting at volume? → UC 7 (Sales Dialer)
│   ├── Agent-to-customer proactive? → UC 4 (Outbound Contact Center)
│   └── AI-driven outbound? → UC 5 or 6 (AI Agents)
├── Inbound
│   ├── Self-service only (no agents)? → UC 2 (IVR)
│   ├── Route to human agents? → UC 3 (Inbound Contact Center)
│   ├── AI handles conversation? → UC 5 or 6 (AI Agents)
│   └── Marketing attribution? → UC 8 (Call Tracking)
├── SIP infrastructure needs PSTN? → UC 9 (PSTN Connectivity)
└── Post-call analysis at scale? → UC 10 (AI/ML Transcription)
```

**AI Agent choice:** Use UC 5 (ConversationRelay) when you want Twilio-managed STT/TTS. Use UC 6 (Media Streams) when you have your own AI platform or need raw audio control.

## Use Case Ladder (Progression)

```
Level 5: AI/ML Transcription — Builds on recordings from ALL other use cases.
Level 4: Contact Centers (In+Out) — Adds routing, queuing, coaching to IVR.
         Variants: Sales Dialer, Call Tracking
Level 3: AI Agents (Buy or Build) — Can appear at ANY level.
Level 2: Self-Service (IVR) — Builds on Notifications (adds inbound + interaction).
Level 1: Voice Notifications — Simplest starting point.
Foundation: PSTN Connectivity — Bypasses Programmable Voice entirely.
```

Common paths: Notifications → IVR → Contact Center | IVR → AI Agents → Contact Center | Contact Center → Transcription | PSTN → Programmable Voice | Call Tracking → Contact Center

## Critical Gotchas (Cross-Cutting)

- **AMD**: Does NOT work with SIP Trunking, `<Dial><Client>`, `<Dial><Conference>`, or `<Dial><Queue>`. Always use `AsyncAmd=true`.
- **PCI Mode**: IRREVERSIBLE and account-wide. Create a separate sub-account.
- **ConversationRelay voice names**: Use `en-US-Chirp3-HD-Aoede` NOT `Google.en-US-Chirp3-HD-Aoede`. 10 malformed messages kills connection.
- **Recording → Intelligence**: Use `source_sid` (Recording SID), NOT `media_url`.
- **`<Connect><Stream>`**: Blocks all subsequent TwiML. Cannot stop without ending call. Audio is mulaw 8kHz base64 only.
- **Conference warm transfer**: `endConferenceOnExit` must be set per-participant deliberately.

## Reference Files

Read these for detailed per-use-case product entries (Why/When/Prereqs/Gotchas):

| File | Content |
|------|---------|
| `references/product-matrix.md` | Full product × use-case matrix tables (Software Tools, Core Services, Connectivity, Features, Non-Voice) |
| `references/use-cases-1-4.md` | UC 1–4: Notifications, IVR, Inbound CC, Outbound CC |
| `references/use-cases-5-6.md` | UC 5–6: AI Agents (Buy/Native and Build/3PP) |
| `references/use-cases-7-10.md` | UC 7–10: Sales Dialer, Call Tracking, PSTN Connectivity, AI/ML Transcription |
| `references/operational-reference.md` | AMD tuning, Conference tips, Stream/ConversationRelay/Event Streams/Recording/SHAKEN-STIR operational notes |
| `references/compliance-and-enterprise.md` | PII redaction, HIPAA, PCI, Language Operators, scaling limits, HA/DR |
| `references/competitor-mapping.md` | Vonage/Bandwidth/Plivo terminology mapping, Conversations API deprecation, WhatsApp channel |
