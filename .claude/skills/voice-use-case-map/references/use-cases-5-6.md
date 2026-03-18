# Use Cases 5–6: AI Agents (Buy and Build)

Detailed product entries for AI voice agent use cases. Each product includes Why/When/Prereqs/Gotchas.

See [SKILL.md](../SKILL.md) for the quick reference table and decision tree. See [product-matrix.md](product-matrix.md) for the full product × use case grid.

---

## Use Case 5: AI Agents (Buy/Native/Direct)

**Summary:** Twilio-native AI voice agents using ConversationRelay or VirtualAgent. The "buy" approach — use Twilio's built-in AI integration rather than building from scratch with Media Streams. Best for teams that want the fastest path to a working AI voice agent with Twilio-managed infrastructure.

### Software Tools

- **Conversational Intelligence**: Post-call analysis of AI agent interactions. Detect hallucinations, identify conversations where the AI failed to resolve the caller's need, and monitor prompt injection attempts. Essential for AI agent quality assurance at scale.
  - Prereqs: Intelligence Service SID created in Twilio Console (no API to create — must be manual).

- **Event Streams**: Stream AI agent events for monitoring dashboards. Track conversation duration, escalation rates, and error events across all AI agent sessions.
  - Prereqs: Sink configured (Webhook URL, Kinesis ARN + IAM role, or Segment write key).

- **Functions**: Host the WebSocket server for ConversationRelay, LLM integration logic, tool definitions, and escalation handlers. The AI agent's "brain" runs in Functions.

- **Assets**: Host prompt templates, tool schemas, and configuration files for AI agents.

- **CLI**: Deploy AI agent functions and manage the infrastructure.

### Core Services

- **`<Say>`**: Fallback TTS when the AI agent needs to play a static message (error states, transfer announcements). During normal AI conversation, ConversationRelay handles speech synthesis.

- **`<Gather>`**: Capture DTMF input alongside AI conversation. Some interactions require keypad input (account numbers, PIN verification) even within an AI-powered flow.

- **Conversation Relay**: The primary integration path. Establishes a WebSocket connection between the active call and your server. Twilio handles speech-to-text and text-to-speech; your server handles LLM logic, tool execution, and conversation management. Supports interruption handling, turn detection, and DTMF.
  - Prereqs: WebSocket server at `wss://` endpoint, ngrok or public URL for development.
  - Gotcha: Voice name format differs from `<Say>` — use `en-US-Chirp3-HD-Aoede` not `Google.en-US-Chirp3-HD-Aoede`. 10 consecutive malformed WebSocket messages terminates connection (error 64105). Check `message.last`, never `message.isFinal`. WebSocket disconnection = call ends (no auto-reconnect) unless an `action` URL fallback is implemented on the `<Connect>` verb.

- **VirtualAgent**: Google Dialogflow CX integration. Twilio routes the call to a Dialogflow agent that handles conversation management. Only use if the customer has invested in Dialogflow infrastructure.
  - Prereqs: Existing Google Dialogflow CX agent with telephony integration configured.

- **Recording**: Record all AI agent conversations for debugging, compliance, and training data. Critical for identifying when the AI makes mistakes — you need the recording to understand what happened.
  - Gotcha: Use `source_sid` (Recording SID) for Voice Intelligence transcript creation, NOT `media_url`. The Intelligence API cannot authenticate against protected URLs.

- **`<Transcribe>`**: Transcribe AI agent conversations for compliance logging and quality review. ConversationRelay provides real-time transcripts, but `<Transcribe>` creates permanent searchable records.
  - Prereqs: Conversational Intelligence Service SID for advanced features (entity detection, PII redaction). Basic transcription works without it.

- **Voice Insights**: Monitor AI agent call quality — audio issues, latency, dropped calls. Poor audio quality directly degrades AI agent performance because STT accuracy drops.

- **`<Stream>`**: While ConversationRelay is the primary path, `<Stream>` can be used for auxiliary audio processing (e.g., background noise analysis, emotion detection) alongside the AI conversation.
  - Prereqs (bidirectional): WebSocket server accepting `wss://` connections.
  - Gotcha: `<Connect><Stream>` (bidirectional) blocks all subsequent TwiML until WebSocket closes. Cannot stop a bidirectional stream without ending the call. Audio is strictly mulaw 8kHz base64 — no format negotiation.

### Connectivity

- **Voice SDKs**: AI agents accessible from web or mobile apps. Callers interact with the AI agent through an in-app experience rather than dialing a phone number.

- **SIP Interface (Programmable SIP)**: Route calls from existing SIP infrastructure to AI agents via SIP Domains. Common in enterprise environments where the AI agent replaces or augments an existing IVR behind a PBX.

- **PSTN**: Standard inbound/outbound path for AI agent calls.

- **BYOC**: Use existing phone numbers with AI agents.

### Features

- **Multimodal Realtime API** `(†)`: Enable multimodal AI interactions — voice combined with visual elements for richer AI agent experiences.

- **User Defined Messages**: Send custom data between the AI agent and other call participants or systems during the conversation. Use to push context updates, CRM data, or tool results to the AI agent's WebSocket connection.

- **SSML TTS**: Fine-tune AI agent speech output. ConversationRelay supports SSML for controlling pronunciation, speed, and emphasis in AI-generated responses.

- **Speech Recognition**: Powers the speech-to-text component of ConversationRelay. Quality of speech recognition directly affects AI agent comprehension.

- **HIPAA**: Required for AI agents handling protected health information — patient scheduling, symptom triage, prescription inquiries.

---

## Use Case 6: AI Agents (Build/3PP/ISVs)

**Summary:** Third-party or custom-built AI voice agents using Media Streams (`<Stream>`). The "build" approach — route raw audio to your own or a third-party AI platform via bidirectional WebSocket. Best for teams with existing AI infrastructure, specialized models, or ISVs building AI products on top of Twilio.

**Key difference from Use Case 5:** ConversationRelay and VirtualAgent are NOT used. Instead, `<Connect><Stream>` provides bidirectional audio, and your platform handles all STT, LLM, and TTS processing. Audio is strictly mulaw 8kHz base64-encoded — your platform must encode/decode this format. A bidirectional stream cannot be stopped without ending the call.

### Software Tools

- **Conversational Intelligence**: Post-call analysis of third-party AI interactions. Works the same as Use Case 5 — analyze recordings and transcriptions after the call, regardless of which AI platform handled the conversation.
  - Prereqs: Intelligence Service SID created in Twilio Console (no API to create — must be manual).

- **Event Streams**: Stream call events for monitoring your AI platform's performance.
  - Prereqs: Sink configured (Webhook URL, Kinesis ARN + IAM role, or Segment write key).

- **Functions**: Host the WebSocket endpoint that receives bidirectional audio from `<Connect><Stream>`. Your function bridges Twilio audio to your AI platform.

- **Assets**: Host configuration files and static resources for your AI integration.

- **CLI**: Deploy WebSocket handler functions and manage infrastructure.

### Core Services

- **`<Say>`**: Pre-AI greeting, error fallbacks, and transfer announcements. Used before `<Connect><Stream>` hands the call to your AI platform.

- **`<Gather>`**: Capture DTMF or speech before connecting to the AI platform. Useful for authentication or intent collection before AI handoff.

- **Recording**: Record all calls for debugging and compliance. Since your AI platform handles the conversation, recording provides the ground truth for what actually happened on the call.
  - Gotcha: Use `source_sid` (Recording SID) for Voice Intelligence transcript creation, NOT `media_url`. The Intelligence API cannot authenticate against protected URLs.

- **`<Transcribe>`**: Post-call transcription via Twilio's engine. Your AI platform likely produces its own transcripts, but `<Transcribe>` provides an independent Twilio-side record.
  - Prereqs: Conversational Intelligence Service SID for advanced features (entity detection, PII redaction). Basic transcription works without it.

- **Voice Insights**: Monitor call quality. Poor audio quality on the Twilio side will degrade your AI platform's STT accuracy — Voice Insights helps isolate whether quality issues are on the Twilio leg or your platform.

- **`<Stream>`**: The core integration point. `<Connect><Stream>` establishes a bidirectional WebSocket — Twilio sends caller audio, your platform sends AI-generated audio back. Only inbound audio track is available on bidirectional streams. Only 1 bidirectional stream per call. The WebSocket blocks subsequent TwiML until closed.
  - Prereqs: WebSocket server accepting `wss://` connections.
  - Gotcha: `<Connect><Stream>` (bidirectional) blocks all subsequent TwiML until WebSocket closes. Cannot stop a bidirectional stream without ending the call. Audio is strictly mulaw 8kHz base64 — no format negotiation.

### Connectivity

- **Voice SDKs**: Callers access your AI agent from web or mobile apps.

- **SIP Interface (Programmable SIP)**: Route calls from existing phone systems to your AI platform via Twilio SIP Domains.

- **PSTN**: Standard telephony path for AI agent calls.

- **BYOC**: Use existing carrier relationships with your custom AI platform.

### Features

- **Multimodal Realtime API**: Enable multimodal AI experiences combining voice with visual or data channels.

- **SIPREC**: SIP-level recording for regulatory compliance. Records at the protocol level, independent of your AI platform's recording.

- **SSML TTS**: If your AI platform returns SSML-marked text for Twilio to render (rather than sending raw audio), SSML controls pronunciation and delivery.

- **Speech Recognition**: If using `<Gather speech>` before handing off to your AI platform, Twilio's speech recognition handles the initial interaction.

- **HIPAA**: Required compliance for AI agents processing health data.
