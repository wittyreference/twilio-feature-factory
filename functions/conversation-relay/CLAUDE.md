<!-- ABOUTME: Essential context for ConversationRelay voice AI functions. -->
<!-- ABOUTME: Covers file inventory, WebSocket protocol, prerequisites, and troubleshooting. -->

# Conversation Relay Functions Context

For LLM integration code, ngrok setup, full configuration, and code patterns, see [REFERENCE.md](./REFERENCE.md).

## Files

### Public Handlers
| File | Access | Description |
|------|--------|-------------|
| `ai-assistant-inbound.js` | Public | Connects incoming calls to ConversationRelay AI agent |
| `relay-handler.js` | Public | Entry point for connecting phone calls to LLM-powered voice agents |
| `transcript-complete.js` | Public | Handles Voice Intelligence transcript completion callback; sends SMS summary |

### Demo Flow
| File | Access | Description |
|------|--------|-------------|
| `start-ai-demo.protected.js` | Protected | Initiates outbound AI demo call with recording and ConversationRelay |
| `finalize-demo.protected.js` | Protected | Processes completed demo call — stores transcript in Sync, sends SMS |

### Agent-to-Agent Testing Infrastructure
| File | Access | Description |
|------|--------|-------------|
| `agent-a-inbound.protected.js` | Protected | Inbound call handler for Agent A (questioner) |
| `agent-b-inbound.protected.js` | Protected | Inbound call handler for Agent B (answerer) |
| `start-agent-test.protected.js` | Protected | Test orchestrator that initiates agent-to-agent calls |
| `validate-agent-test.protected.js` | Protected | Validates agent-to-agent test results via Sync transcripts |

### Payment Testing Infrastructure
| File | Access | Description |
|------|--------|-------------|
| `payment-test-start.protected.js` | Protected | Orchestrates 3-participant conference (Payment Agent, Customer Agent, DTMF Injector) |
| `payment-agent-inbound.protected.js` | Protected | Payment Agent ConversationRelay handler |
| `customer-agent-inbound.protected.js` | Protected | Customer Agent ConversationRelay handler |
| `dtmf-hold.js` | Public | Hold endpoint for DTMF Injector — returns long pause TwiML |

### Callbacks
| File | Access | Description |
|------|--------|-------------|
| `recording-complete.protected.js` | Protected | Recording completion → Sync update + Voice Intelligence transcription |

## What is Conversation Relay?

Real-time, bidirectional communication between phone calls and AI/LLM backends via WebSockets. Handles speech transcription, TTS, audio streaming, DTMF detection, and interruption handling.

**Not Media Streams** (`<Connect><Stream>`): Media Streams sends raw audio (mulaw 8kHz base64). ConversationRelay sends structured JSON (`type: "prompt"`, `type: "text"`). They are **incompatible** — a CR handler cannot be used with `<Stream>` and vice versa.

## Basic TwiML Setup

```javascript
const twiml = new Twilio.twiml.VoiceResponse();
const connect = twiml.connect();
connect.conversationRelay({
  url: 'wss://your-server.com/relay',
  voice: 'Google.en-US-Neural2-F',
  language: 'en-US'
});
return callback(null, twiml);
```

## WebSocket Protocol

### Incoming (from Twilio)

| Type | Key Fields | Description |
|------|-----------|-------------|
| `setup` | `callSid`, `streamSid`, `from`, `to` | Connection established |
| `prompt` | `voicePrompt`, `confidence`, `last` | User speech (process when `last: true`) |
| `dtmf` | `digit` | DTMF tone detected |
| `interrupt` | — | User interrupted AI response |

### Outgoing (to Twilio)

| Type | Key Fields | Description |
|------|-----------|-------------|
| `text` | `token` | TTS response (stream individual tokens for natural speech) |
| `end` | — | End the conversation |

## Voice & Transcription Options

**Important**: Some voice/provider combos cause error 64101. Google Neural voices are recommended. Polly voices may be blocked.

| Setting | Options | Recommended |
|---------|---------|-------------|
| Voice | `Google.en-US-Neural2-F`, `-J`, `-A`, `Google.en-GB-Neural2-B` | Google Neural |
| Transcription | `google`, `deepgram` | `google` (default) |
| Speech Model | `telephony`, `default` | `telephony` (phone-optimized) |

## Prerequisites

### Voice Intelligence Service

You must create a CI Service in the Twilio Console (no API for this). Go to Console → Voice → Voice Intelligence → Create new Service → copy the `GA...` SID → add to `.env` as `TWILIO_INTELLIGENCE_SERVICE_SID`.

Without this, transcript creation fails with 404.

### Dual Service Pattern

| Service | Env Var | Operators | Use Case |
|---------|---------|-----------|----------|
| `twilio-agent-factory` | `TWILIO_INTELLIGENCE_SERVICE_SID` | Summary + Sentiment (auto) | Validation, demo calls |
| `no-auto-transcribe` | `TWILIO_INTELLIGENCE_SERVICE_MANUAL_SID` | None | Manual transcript creation |

**Why two?** Operators are per-service and auto-run on all transcripts. No per-transcript bypass. PII redaction is also per-service — separate services for redacted vs unredacted access.

### Transcript Creation

Use `source_sid` (not `media_url`) for Twilio recordings — Intelligence API can't authenticate to api.twilio.com. Language Operators run automatically when configured on the service.

## ConversationRelay in Conferences

Each agent's CR runs on their individual call leg (child), while conference membership is on the parent leg. Audio bridges through. Use the Participants API to add agents — `make_call(url=conference-TwiML)` won't work because the `url` parameter only controls the parent leg.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| AI greets but doesn't respond | Using `isFinal` instead of `last` | Check for `message.last` |
| "Extra inputs are not permitted" | Extra fields in Anthropic messages | Strip to `role` + `content` only |
| WebSocket doesn't connect | URL not HTTPS/WSS | Use ngrok HTTPS, convert to `wss://` |
| No transcript after call | Missing Sync Service SID | Set `TWILIO_SYNC_SERVICE_SID` |
| Interruption not working | `interruptible` not set | Add `interruptible: 'true'` |
| DTMF not detected | `dtmfDetection` not enabled | Add `dtmfDetection: 'true'` |
| Transcript status "error" | Using `media_url` for recordings | Use `source_sid` instead |
| Error 82005 in notifications | Stray `console.error()` call | Use `console.log()` only |
| ngrok tunnel dies mid-session | Tunnel expires/disconnects | Verify with `curl localhost:4040` |

## Logging Rules

Use `console.log` for ALL logging — `console.error()` generates 82005, `console.warn()` generates 82004. Always pass a string to `Twilio.Response.setBody()` (use `JSON.stringify()`).

## Environment Variables

```
CONVERSATION_RELAY_URL=wss://your-server.com/relay
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```
