# Operational Reference

Cross-cutting tuning and optimization notes organized by product. These are quality/performance considerations, not silent-failure gotchas (those are inline per use case in the use-cases reference files).

See [SKILL.md](../SKILL.md) for the cross-cutting gotchas summary.

---

## AMD Tuning

- **Destination type matters**: Residential numbers typically have shorter greetings (~3s); business lines have longer greetings (~8-10s). Adjust `MachineDetectionTimeout` accordingly — lower values for residential campaigns, higher for B2B.
- **Async vs sync**: `AsyncAmd=true` delivers the AMD result via `AsyncAmdStatusCallback` and lets TwiML execute immediately. Synchronous mode blocks TwiML until detection completes (~4s). Always use async for outbound campaigns.
- **`MachineDetectionSpeechThreshold`**: Duration of initial speech (ms) before classifying as human. Default 2400ms. Lower values detect humans faster but increase false machine classifications.
- **`MachineDetectionSpeechEndThreshold`**: Silence duration (ms) to mark end of machine greeting. Default 1200ms. Affects when `DetectMessageEnd` fires for voicemail drops.

## Conference

- **`waitUrl` doesn't auto-loop**: If you use a custom `waitUrl`, the hold music plays once and stops. Use `<Play loop="0">` in the wait TwiML to loop indefinitely. Or use `waitUrl=""` for silence.
- **Participant data disappears after call ends**: Conference participant metadata is transient. Use Voice Insights for historical conference data. If you need persistent participant state, store it in Sync during the call.
- **Conference name uniqueness**: Conference names are scoped to the account. Use unique, descriptive names (e.g., `call-{callSid}-{timestamp}`) to avoid collisions. Reusing a conference name while a previous conference with that name is still active merges the calls.

## `<Stream>`

- **Audio format**: mulaw encoding, 8kHz sample rate, base64-encoded. No format negotiation — your WebSocket server must handle this format.
- **Regional availability**: Media Streams are available in US1, IE1, and AU1 regions. Ensure your Twilio account region and WebSocket server are co-located for low latency.
- **Unidirectional tracks**: `<Start><Stream>` supports up to 4 simultaneous tracks (inbound, outbound, or both) per call. Bidirectional streams via `<Connect><Stream>` are limited to 1 per call.

## ConversationRelay

- **STT provider selection**: Google is the default and works best in clean audio environments. Deepgram may perform better in noisy environments or with heavy accents. Specify via the `speechModel` attribute.
- **Reconnection pattern**: ConversationRelay WebSocket disconnection ends the call. Implement an `action` URL on the `<Connect>` verb to catch disconnections and either reconnect or gracefully end the call.
- **`intelligenceService` attribute**: Pass the Conversational Intelligence Service SID directly in the `<ConversationRelay>` TwiML to enable automatic post-call analysis without separate API calls.
- **TTS with ElevenLabs**: ElevenLabs is a supported TTS provider. When using it, be aware that text normalization (numbers, abbreviations) may differ from Google. Test with your specific content.

## Event Streams

- **Voice event types and delays**: 7 voice event types are available. Gateway events (call initiated, ringing) arrive ~90s after occurrence. Complete call summary events can take ~30 minutes.
- **At-least-once delivery**: Events may be delivered more than once. Idempotent processing is required — use the event `sid` for deduplication.
- **Sink types**: Three options — Webhook (HTTP POST), Kinesis (AWS stream), Segment (customer data platform write key). Choose based on your analytics infrastructure.
- **Analytics, not real-time state**: Event Streams provides analytics events for dashboards and reporting. Do not use them for real-time call state management — use StatusCallbacks for that.

## Conversational Intelligence

- **PII audio redaction**: Audio-level PII redaction (bleeping out sensitive audio) is only available for `en-US`. Text-level PII redaction works for all supported languages.
- **Dual-channel recording**: Recommended for speaker diarization. Single-channel recordings require the system to guess who is speaking, which reduces accuracy.
- **Product name**: The product was renamed from "Voice Intelligence" to "Conversational Intelligence." API paths still use `intelligence/v2`. Documentation may reference either name.

## Recording

- **Method comparison**:
  - **Calls API `Record` param**: Records entire call from start. Simplest option. Set `Record=record-from-answer` on call creation.
  - **`<Start><Record>`**: Start/stop recording mid-call via TwiML. Use when you only want to record specific segments.
  - **`<Dial record>`**: Records the `<Dial>` leg only. Captures the two-party conversation after connection.
  - **Conference `record`**: Records the conference mix. Use `recordingStatusCallback` to get the Recording SID when complete.
- **Choose based on control needed**: Full-call recording for compliance, segment recording for targeted capture, conference recording for multi-party calls.

## SHAKEN/STIR

- **Three attestation levels**: A (full — you own the number and chose the caller), B (partial — you originated the call but didn't assign the number), C (gateway — you're just passing the call through). Only A attestation produces the green checkmark on mobile.
- **PASSporT timestamp**: The cryptographic token has a 1-minute validity window. Clock skew between your systems and Twilio can cause attestation failures.
- **E.164 formatting required**: Phone numbers in SHAKEN/STIR must be in E.164 format (`+1XXXXXXXXXX`). Non-E.164 numbers cannot receive attestation.
