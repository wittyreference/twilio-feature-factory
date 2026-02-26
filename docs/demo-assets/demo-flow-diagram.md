# ABOUTME: Architecture diagram showing the ConversationRelay call flow for demos.
# ABOUTME: Use as visual aid during live demos or Tier 3 fallback.

# ConversationRelay Architecture

## Call Flow

```
┌──────────┐     ┌──────────────┐     ┌──────────────────────┐
│  Caller   │────>│  Twilio PSTN │────>│  Twilio Functions     │
│  (Phone)  │<────│  Network     │<────│  (TwiML Response)     │
└──────────┘     └──────┬───────┘     └──────────┬───────────┘
                        │                         │
                        │  WebSocket              │ <Connect>
                        │  (bidirectional)        │ <ConversationRelay>
                        ▼                         ▼
                ┌───────────────────────────────────────┐
                │         ConversationRelay              │
                │                                       │
                │  ┌─────────────┐  ┌────────────────┐  │
                │  │  Speech →   │  │  Text →         │  │
                │  │  Text (STT) │  │  Speech (TTS)   │  │
                │  │  Google /   │  │  Google Neural2  │  │
                │  │  Deepgram   │  │                  │  │
                │  └──────┬──────┘  └────────▲────────┘  │
                │         │                  │            │
                └─────────┼──────────────────┼────────────┘
                          │                  │
                          │ JSON messages    │ JSON messages
                          │ {type:"prompt"}  │ {type:"text"}
                          ▼                  │
                ┌─────────────────────────────────────┐
                │       WebSocket Server               │
                │       (Your ngrok endpoint)          │
                │                                      │
                │  ┌─────────────────────────────────┐ │
                │  │        LLM (Claude)              │ │
                │  │                                  │ │
                │  │  System Prompt:                  │ │
                │  │  "You are a pizza ordering       │ │
                │  │   assistant for Mario's Pizza"   │ │
                │  │                                  │ │
                │  │  Receives: transcribed speech    │ │
                │  │  Returns: response text          │ │
                │  └─────────────────────────────────┘ │
                └──────────────────────────────────────┘

                          Post-Call Processing
                ┌──────────────────────────────────────┐
                │                                      │
                │  Recording ──> Voice Intelligence     │
                │                    │                  │
                │                    ├── Transcript     │
                │                    ├── Summary        │
                │                    └── Sentiment      │
                │                                      │
                │  State ──> Twilio Sync Document       │
                │  SMS   ──> Summary to caller          │
                │                                      │
                └──────────────────────────────────────┘
```

## Component Requirements

| Component | Service | Required For |
|-----------|---------|-------------|
| Phone call routing | Twilio Voice | All demos |
| TwiML functions | Twilio Functions (deployed) | IVR, basic voice |
| WebSocket relay | ngrok tunnel + local server | ConversationRelay only |
| Speech-to-Text | Google / Deepgram (via Twilio) | ConversationRelay only |
| Text-to-Speech | Google Neural2 (via Twilio) | ConversationRelay only |
| LLM | Anthropic Claude API | ConversationRelay only |
| Recording | Twilio Recordings | Post-call analysis |
| Transcription | Twilio Voice Intelligence | Post-call analysis |
| State | Twilio Sync | Conversation memory |

## What Can Fail

```
Caller ──> Twilio ──> Functions ──> ConversationRelay ──> ngrok ──> LLM
  ✓          ✓          ✓               ✓                 ⚠️         ⚠️
 Always    Always     Deployed        Twilio-managed    Can drop    Key expiry
 works     works      (no ngrok)      (reliable)        (restart)   (replace)
```

**Key insight:** Everything left of ngrok is managed by Twilio and highly reliable.
The IVR demo works entirely within the "always works" zone.
