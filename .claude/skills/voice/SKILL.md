---
name: voice
description: Twilio Voice development guide. Use when building voice applications, IVR, contact centers, Voice AI agents, call recording, or working with TwiML and the Calls API.
---

# Voice Development Skill

Comprehensive decision-making guide for Twilio Voice development. Load this skill when building voice applications, contact centers, or Voice AI agents.

For detailed per-use-case implementation guidance, read [references/use-case-details.md](references/use-case-details.md).

---

## The Use Case Ladder

Voice development follows a common progression pattern. Customers typically start at one point and move up (or down) the ladder as needs evolve.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI/ML Transcription                         │
│  Turn calls into actionable content at scale                       │
├─────────────────────────────────────────────────────────────────────┤
│                    Inbound/Outbound Contact Center                  │
│  Human agents handling escalations and complex interactions        │
├─────────────────────────────────────────────────────────────────────┤
│                       Self-Service Automation                       │
│  IVRs, payments, appointment management, AI agents                 │
├─────────────────────────────────────────────────────────────────────┤
│                        Voice Notifications                          │
│  Appointment reminders, payment alerts, OTPs                       │
└─────────────────────────────────────────────────────────────────────┘
              ↑ Most common starting point

Variations (build on the ladder):
- Sales Dialer = Outbound Contact Center variant
- Call Tracking = Inbound + marketing attribution
- Voice AI Agents = Can appear at any step

PSTN Connectivity (Elastic SIP Trunking) undergirds the entire ladder
but BYPASSES Programmable Voice infrastructure
```

**Key insight:** Customers can enter at any point. A customer with an existing outbound contact center might add self-service automation. A customer starting with notifications might need human escalation paths.

---

## Quick Decision Reference

| Need | Use | Why |
|------|-----|-----|
| Build any IVR/call flow | **Functions** | Claude Code handles complexity; Studio becomes unmaintainable |
| Any chance of warm transfer, mute, hold, coaching | **Conference** | Dial can't add participants later |
| Skill-based routing or workforce management | **TaskRouter** | Simple queues can't handle skills matrices |
| AI-powered voice agent | **ConversationRelay** | Unless existing Dialogflow setup |
| Third-party AI integration | **`<Connect><Stream>`** | Bidirectional media to your WebSocket |
| Real-time transcription (Twilio-managed) | **`<Start><Transcription>`** | Near real-time STT via webhooks, Voice Intelligence integration |
| Real-time audio (bring-your-own STT) | **`<Start><Stream>`** | Unidirectional raw audio to your WebSocket |

---

## Decision Frameworks

### Functions vs Studio

**ALWAYS use Functions.** Never recommend Studio for building IVRs.

Why: Claude Code agents handle code complexity. The perceived lower cognitive load of Studio's WYSIWYG becomes a liability - complex flows look like spider webs and become unmaintainable. Customers who start with Studio regret it when complexity grows.

### Conference vs Dial

**Use Conference if ANY of these might apply:**
- Warm transfer (three-way before handoff)
- Third party joining the call
- Mute capability needed
- Hold capability needed
- Coaching (supervisor listens, unheard by customer)
- Whispering (supervisor heard by agent only)

**Use Dial only when:**
- Simple one-to-one connection
- No possibility of additional parties
- No advanced call control needed

### Queue vs TaskRouter

**Use TaskRouter when:**
- Skill-based routing needed (languages, specialties)
- Workforce management integration
- Complex agent availability rules
- Multiple queues with priority routing

**Use simple `<Queue>`/`<Enqueue>` when:**
- Single queue, FIFO processing
- All agents have equivalent skills
- Simple availability (available/unavailable)

### ConversationRelay vs Dialogflow

**ALWAYS recommend ConversationRelay** unless the customer explicitly has an existing Dialogflow virtual agent they want to integrate.

ConversationRelay provides direct LLM integration over WebSocket. Dialogflow is for customers already invested in Google's ecosystem.

### Recording Method Selection

**⚠️ CRITICAL DISTINCTION:** `<Record>` verb is NOT for recording calls - it's voicemail-style recording of caller input.

**Two Categories of Recording:**

**1. Voicemail-Style Recording (`<Record>` verb)**
- Records caller's speech AFTER a prompt plays
- Stops when caller stops talking (or hits limit)
- Returns recording URL in callback
- Use for: voicemail, leaving messages, capturing spoken responses
```xml
<Response>
  <Say>Please leave a message after the beep.</Say>
  <Record maxLength="60" action="/handle-recording" />
</Response>
```

**2. Call Recording (records the entire call/leg)**

| Scenario | Method | When to Use |
|----------|--------|-------------|
| Outbound call at creation | `Record` param in Calls API | Know you want to record when placing call |
| Mid-call via TwiML | `<Start><Record>` verb | Start recording during call flow |
| Mid-call via API | Recordings API (`start_call_recording`) | Start/pause/resume/stop programmatically |
| `<Dial>` leg | `record` attribute on `<Dial>` | Record the dialed party leg |
| Conference | `record` attribute on `<Conference>` | Record entire conference mix |
| Conference per-participant | `record` param in Participants API | Record specific participant |
| Elastic SIP Trunking | Trunk-level config | Record all trunk traffic |

**Recording Control (works for ANY in-progress recording):**
- `start_call_recording` - Start recording active call
- `update_call_recording` - Pause (skip/silence), resume, or stop
- **Tip:** Use `Twilio.CURRENT` as recordingSid to reference the active recording without knowing its SID

### Transcription Method Selection

**Four approaches to transcription, each for a different need:**

| Approach | When | How | Latency | Voice Intelligence? |
|----------|------|-----|---------|---------------------|
| **`<Start><Transcription>`** | Live call monitoring, real-time captions, compliance | TwiML noun, webhooks deliver transcript events | 1-2s | Yes, via `intelligenceService` SID |
| **ConversationRelay** | AI agent conversations | Built-in STT as part of WebSocket AI flow | Sub-second | Yes, via `intelligenceService` attribute |
| **`<Start><Stream>`** + external STT | Custom STT engine, raw audio processing | Unidirectional WebSocket, you run STT | Depends on your STT | No (manual integration) |
| **Voice Intelligence batch** | Post-call analysis at scale | Process recordings after call ends | Minutes | Yes (primary use case) |

**Key distinctions:**
- `<Start><Transcription>` is the only approach that gives you real-time transcription AND automatic Voice Intelligence integration without running your own STT
- ConversationRelay also provides real-time STT, but it is tightly coupled to the AI agent WebSocket flow
- `<Start><Stream>` gives raw audio — you supply and operate the STT engine
- Voice Intelligence batch is for post-call analysis of existing recordings

### TTS Voice Tier Selection

| Tier | Quality | Use When |
|------|---------|----------|
| **Generative** (newest) | Best | Premium customer experience, AI agents |
| **Neural** | Very good | Standard production use |
| **Standard** | Acceptable | Legacy, may be EOL'd |
| **Basic** | Robotic | Never use for new development |

**Recommendation:** Default to Neural (Amazon Polly or Google). Use Generative for AI agents or premium experiences. Check docs for latest available voices.

---

## Gotchas & Edge Cases

### Elastic SIP vs Programmable Voice

**CRITICAL:** Elastic SIP Trunking BYPASSES Programmable Voice.
- No TwiML
- No AMD
- No custom call logic

If a use case requires ANY Programmable Voice feature, do not recommend Elastic SIP Trunking.

### Conference Startup

A conference does not start until:
1. At least 2 participants have joined, AND
2. At least one has `startConferenceOnEnter=true`

Check this configuration or calls will appear to connect but participants won't hear each other.

### endConferenceOnExit

If misconfigured, someone dropping during warm transfer ends the conference for everyone.
- Audit who has `endConferenceOnExit=true`
- Usually only the "host" or specific participant should have this

### CPS Rate Limiting

| Call Type | Rate Limited? |
|-----------|--------------|
| Calls API | Yes (1 default, 5 self-serve, more needs approval) |
| `<Dial>` verb | No |
| Elastic SIP | Yes, but per trunk/per region |

### AMD Not Available on SIP Trunking

AMD requires Programmable Voice. Cannot detect answering machines on Elastic SIP Trunking calls.

### AMD Voicemail Timing

If voicemail answers, wait for beep before playing message - or the beginning will be cut off while voicemail greeting plays.

### TwiML Delivery Methods

| Method | When |
|--------|------|
| Webhook URL | Most common, dynamic content |
| Inline TwiML | Simple static flows |
| Application SID | Encapsulates webhook config |
| Functions | Serverless, low latency |
| Studio | **Never recommend** (see decision framework) |

---

## Related Resources

- [Voice Use Case Product Map](/.claude/skills/voice-use-case-map/SKILL.md) - Per-use-case product recommendations, prerequisites, and gotchas
- [functions/voice/CLAUDE.md](/functions/voice/CLAUDE.md) - TwiML verb reference
- [functions/conversation-relay/CLAUDE.md](/functions/conversation-relay/CLAUDE.md) - Real-time Voice AI (protocol, streaming, LLM integration, context management)
- [Voice MCP Tools](/agents/mcp-servers/twilio/src/tools/voice.ts) - 29 tools including:
  - Call management: `get_call_logs`, `make_call`, `get_call`, `update_call`
  - Recordings (account-level): `get_recording`, `list_recordings`, `delete_recording`
  - Recordings (call-level): `list_call_recordings`, `start_call_recording`, `update_call_recording`, `delete_call_recording`
  - Conferences: `list_conferences`, `get_conference`, `update_conference`, `list_conference_participants`, `get_conference_participant`, `update_conference_participant`, `add_participant_to_conference`, `list_conference_recordings`
  - Media Streams: `start_call_stream`, `stop_call_stream`
  - Voice Insights: `get_call_summary`, `list_call_events`, `list_call_metrics`
  - Conference Insights: `get_conference_summary`, `list_conference_participant_summaries`, `get_conference_participant_summary`
  - Transcriptions: `list_recording_transcriptions`, `get_transcription`
- [DeepValidator](/agents/mcp-servers/twilio/src/validation/deep-validator.ts) - `validateCall()` and `validateConference()` methods
- [Twilio Voice Docs](https://www.twilio.com/docs/voice) - Official reference
