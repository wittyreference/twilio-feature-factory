# Use Cases 7–10: Sales Dialer, Call Tracking, PSTN, Transcription

Detailed product entries for specialized voice use cases. Each product includes Why/When/Prereqs/Gotchas.

See [SKILL.md](../SKILL.md) for the quick reference table and decision tree. See [product-matrix.md](product-matrix.md) for the full product × use case grid.

---

## Use Case 7: Sales Dialer

**Summary:** High-volume outbound dialing optimized for sales conversations. A specialized variant of the Outbound Contact Center focused on maximizing agent talk time, answer rates, and conversion. Every feature decision centers on: did the salesperson talk to a human, and did the conversation go well?

> TCPA/TSR compliance is non-negotiable: express written consent, DNC registry checks, quiet hours (8 AM-9 PM recipient's time zone), state-level variations may be stricter. Penalties are per-call.

### Software Tools

- **Conversational Intelligence**: Analyze sales conversations at scale. Detect buying signals, objection patterns, competitor mentions, and successful closing techniques. Train new sales reps by surfacing top-performer conversation patterns.
  - Prereqs: Intelligence Service SID created in Twilio Console (no API to create — must be manual).

- **Studio**: Per project convention, **always use Functions**.

- **Event Streams**: Stream dialer events for real-time campaign dashboards — dial rate, connect rate, average talk time, dispositions.
  - Prereqs: Sink configured (Webhook URL, Kinesis ARN + IAM role, or Segment write key).

- **Functions**: Host the dialer logic — outbound call creation, AMD handling, Conference management, agent connection, and disposition recording.

- **Assets**: Hold music and brief "please hold while we connect you" messages for the moment between customer answer and agent connection.

- **CLI**: Deploy dialer functions, manage phone number pools, and configure CPS.

### Core Services

- **Conference**: Every sales call runs through Conference. Create conference, dial customer with AMD, connect salesperson on human answer. Supervisors can join for coaching (`coach=true`) without the customer knowing.
  - Gotcha: In warm transfers, `endConferenceOnExit` must be deliberately assigned per participant — set `true` on customer and receiving agent, `false` on transferring agent. Updating a participant's TwiML via REST pulls them OUT of the conference (one-document-per-call rule).

- **`<Say>`**: Brief messages during agent connection ("Thank you for your patience, connecting you now") and voicemail drops when AMD detects a machine.

- **Conversation Relay**: AI-assisted sales — the AI agent handles initial qualification before connecting to a human salesperson. Or the AI provides real-time coaching suggestions to the salesperson via whisper.
  - Prereqs: WebSocket server at `wss://` endpoint, ngrok or public URL for development.
  - Gotcha: Voice name format differs from `<Say>` — use `en-US-Chirp3-HD-Aoede` not `Google.en-US-Chirp3-HD-Aoede`. 10 consecutive malformed WebSocket messages terminates connection (error 64105). Check `message.last`, never `message.isFinal`.

- **Recording**: Record every sales call. Required for sales compliance, dispute resolution, and performance coaching. Use conference recording to capture the full interaction.

- **`<Transcribe>`**: Transcribe sales calls for Conversational Intelligence analysis, coaching, and compliance review.
  - Prereqs: Conversational Intelligence Service SID for advanced features (entity detection, PII redaction). Basic transcription works without it.

- **Voice Insights**: Sales campaign performance analytics — connect rates, call quality, agent performance comparisons.

### Connectivity

- **Voice SDKs**: Salesperson softphones in the browser or CRM application. The most common connectivity method for modern sales teams.

- **SIP Interface (Programmable SIP)**: Connect to existing SIP-based sales floor phone systems via SIP Domains.

- **PSTN**: Outbound path to prospects and inbound path for callbacks.

- **BYOC**: Use existing carrier relationships for outbound dialing. Common in large sales organizations with negotiated carrier rates.

### Features

- **Branded Calls**: Critical for sales answer rates. Unknown numbers go to voicemail. Branded calls showing your company name get answered. This single feature can transform campaign ROI.
  - Prereqs: Approved Business Profile in Trust Hub + Voice Integrity approval.

- **Enhanced Branded Calling**: Name + logo + call reason. "Acme Software — Regarding your free trial." The highest-performing outbound caller ID option.
  - Prereqs: Approved Business Profile in Trust Hub + Voice Integrity approval. Additionally requires A-level SHAKEN/STIR attestation + signed LOA.

- **SHAKEN/STIR**: Foundation for branded calling and carrier trust. Without attestation, sales calls increasingly get blocked.
  - Prereqs: Primary Customer Profile approved in Trust Hub. BYOC numbers may only receive B or C attestation.
  - Gotcha: When forwarding calls with preserved caller ID, you must pass the `CallToken` from the inbound webhook to the outbound Calls/Participants API call. `<Dial>` preserves caller ID automatically.

- **CNAM**: Landline caller ID registration. Ensures your business name shows on landline phones.

- **CPS (Calls Per Second)**: Rate limiting is the primary constraint on sales dialer throughput. Default 1 CPS is unusable for sales. Self-serve to 5 CPS, then request offline approval for higher limits. Plan CPS based on team size and target connect rates.

- **AMD**: The efficiency engine of the sales dialer. Without AMD, salespeople waste 30-50% of their time listening to voicemail greetings. With AMD, they only get connected to live humans. Use `MachineDetection=Enable` on every outbound call. Consider `DetectMessageEnd` for voicemail drops.
  - Gotcha: Does NOT work with SIP Trunking, `<Dial><Client>`, `<Dial><Conference>`, or `<Dial><Queue>`. Synchronous mode (without `AsyncAmd=true`) creates ~4s dead air — real humans hang up. Use `AsyncAmd=true` on Calls API to avoid dead air.

- **SSML TTS**: Natural-sounding voicemail drops when AMD detects a machine. Pre-record the salesperson's voice or use high-quality TTS for consistent messaging.

- **Failover & DR**: Ensure the sales dialer stays operational. Downtime directly impacts revenue.

- **Trust & Engagement Insights**: Monitor number reputation across carriers. Rotate numbers proactively when spam flags appear. Sales dialers burn through number reputation fast — monitoring is essential.

- **Reports API**: Campaign-level sales metrics — attempts, connects, talk time, conversion tracking.

- **Anomaly Detection**: Detect unusual dialing patterns that might trigger carrier blocks or indicate system misuse.

- **Conference Insights**: Monitor call quality for sales conversations. Poor audio quality costs deals.

---

## Use Case 8: Call Tracking

**Summary:** Marketing attribution via unique phone numbers per campaign, ad, or channel. The simplest voice use case architecturally — buy numbers, forward calls, log which number received the call. Value comes from the attribution data, not call complexity.

### Software Tools

- **Conversational Intelligence**: Analyze call tracking recordings to extract marketing intelligence — what products are callers asking about, what campaigns drive the highest-quality leads (not just volume).
  - Prereqs: Intelligence Service SID created in Twilio Console (no API to create — must be manual).

- **Studio**: Simple call tracking flows can use Studio, but **Functions are preferred** per project convention.

- **Functions**: Host the tracking logic — log the inbound number (campaign identifier), capture caller metadata, then `<Dial>` to the destination.

- **CLI**: Provision phone number pools and configure webhooks.

### Core Services

- **Conference**: Use when the tracking call needs coaching, monitoring, or recording capabilities beyond basic `<Dial>`. For example, if a sales supervisor needs to listen in on tracked calls.

- **`<Say>`**: Optional whisper to the answering agent — "This call is from the Google Ads campaign" — before connecting the caller.

- **Recording**: Record tracked calls for lead qualification and marketing analysis. Which campaigns generate calls that convert?

- **`<Transcribe>`**: Transcribe tracked calls for keyword analysis and lead scoring.
  - Prereqs: Conversational Intelligence Service SID for advanced features (entity detection, PII redaction). Basic transcription works without it.

- **Voice Insights**: Call quality and performance metrics per tracking number (campaign).

### Connectivity

- **Voice SDKs**: Enable click-to-call from web pages with automatic campaign attribution. The SDK call carries the page/campaign context.

- **PSTN**: Standard inbound path. Callers dial the tracking number.

### Features

- **CNAM**: Look up caller name for lead enrichment. Combine with the tracking number to create "Campaign X → John Smith" attribution records.

- **Segment Integration**: Send call tracking events to Segment for unified marketing attribution. Connect call data with web analytics, email campaigns, and CRM data.

- **Trust & Engagement Insights**: Monitor tracking number health. Ensure tracking numbers aren't flagged as spam (which would suppress legitimate marketing calls).

### Non-Voice Products

- **Phone Numbers**: The core asset for call tracking. Purchase a unique number per campaign/ad/channel. Consider local numbers matching the target market area code for higher answer rates. Phone number management at scale (pools, rotation, release) is the primary operational concern.

---

## Use Case 9: PSTN Connectivity

**Summary:** Elastic SIP Trunking for organizations with existing SIP infrastructure that need a PSTN conduit. This use case **bypasses Programmable Voice entirely** — no TwiML, no AMD, no custom call flows. Pure connectivity between SIP and PSTN. Customers choose Elastic SIP Trunking over SIP Interface (Programmable SIP) primarily for cost: trunking is at least $0.004/min cheaper because it skips PV infrastructure. If the customer needs TwiML or API control over call flows, they should use SIP Interface instead (see Connectivity sections of other use cases).

### Software Tools

- **Conversational Intelligence**: Analyze recordings from SIP Trunk traffic for quality monitoring and compliance.
  - Prereqs: Intelligence Service SID created in Twilio Console (no API to create — must be manual).

- **Event Streams**: Stream trunk-level events for monitoring call volume, routing, and failures.
  - Prereqs: Sink configured (Webhook URL, Kinesis ARN + IAM role, or Segment write key).

### Core Services

- **Recording**: Trunk-level recording captures all traffic. Configured on the trunk itself, not via TwiML (which isn't available).

- **Voice Insights**: Monitor trunk call quality — jitter, packet loss, latency, codec issues. Critical for SIP Trunking where the customer's SIP infrastructure introduces additional quality variables.

### Connectivity

- **Elastic SIP Trunking**: The customer's SIP infrastructure (PBX, SBC, UCaaS) connects to Twilio's SIP Trunking endpoints. This is the primary connectivity method for the PSTN Connectivity use case. Calls bypass Programmable Voice — the trunk is a pure PSTN conduit.

- **PSTN**: The outbound/inbound path to the telephone network. Elastic SIP Trunking provides PSTN access for SIP-based systems.

- **BYOC**: Customers bring their own carrier and phone numbers. BYOC is technically a type of SIP Interface (Programmable SIP), but in the PSTN Connectivity use case it's used primarily for number management and failover rather than PV features.

- **Interconnect**: Dedicated private connectivity between the customer's data center and Twilio's SIP Trunking infrastructure. Essential for large deployments requiring guaranteed latency and bandwidth.

### Features

- **SHAKEN/STIR**: Attestation for outbound trunk calls. Ensures calls from the SIP trunk are properly signed to avoid carrier blocking.
  - Prereqs: Primary Customer Profile approved in Trust Hub. BYOC numbers may only receive B or C attestation.

- **CNAM**: Caller name registration for outbound trunk calls.

- **Secure Media**: SRTP encryption for media streams traversing the trunk. Required for regulatory compliance in many industries.

- **SIP Registration**: Not available with Elastic SIP Trunking (INVITE-only). SIP Registration is a SIP Interface (Programmable SIP) feature — see other use cases. Included here for completeness if the customer has a hybrid setup with both trunking and SIP Interface.

- **SIP Header Manipulation**: Modify SIP headers on trunk traffic for routing, billing, and interoperability between the customer's SIP infrastructure and the PSTN.

- **Emergency Calling**: E911 compliance for SIP Trunking. Customers must configure emergency calling for their SIP endpoints to meet regulatory requirements.

- **Failover & DR**: Multi-trunk, multi-region failover. Configure primary and backup trunks so PSTN connectivity survives regional outages. Critical for organizations where phone service is mission-critical.

- **HIPAA**: Compliance for healthcare organizations using SIP Trunking.
- **GDPR**: EU data protection compliance for trunk traffic.
- **SOC2**: Security compliance for trunk infrastructure.
- **ISO/IEC 27001**: Information security compliance.
- **PCI**: Payment industry compliance for trunk traffic carrying payment interactions.

---

## Use Case 10: AI/ML Transcription

**Summary:** Large-scale transcription and intelligence extraction from voice calls. Turn recorded calls into searchable, analyzable text — then apply ML for sentiment, entities, topics, and compliance monitoring. This is a post-call and real-time analytics use case. `<Start><Transcription>` provides Twilio-managed near real-time transcription during live calls, while Voice Intelligence provides batch analysis of recordings post-call.

### Software Tools

- **Conversational Intelligence**: The primary product for this use case. Provides transcription, entity detection, sentiment analysis, PII redaction, topic detection, and custom language operators. Process thousands of calls to extract business intelligence at scale.
  - Prereqs: Intelligence Service SID created in Twilio Console (no API to create — must be manual).

- **Event Streams**: Stream transcription completion events and intelligence results to downstream analytics pipelines.
  - Prereqs: Sink configured (Webhook URL, Kinesis ARN + IAM role, or Segment write key).

- **Functions**: Host transcription webhooks, processing logic, and integrations with downstream systems. Trigger Conversational Intelligence jobs, process results, and route intelligence to the right systems.

- **Assets**: Host language operator configurations, custom vocabulary files, and processing templates.

- **CLI**: Manage Conversational Intelligence configuration and deploy processing functions.

### Core Services

- **Conversation Relay**: When real-time transcription is needed during live calls, ConversationRelay provides streaming STT as part of the AI agent flow. The transcription is a byproduct of the AI conversation that can be captured and analyzed.
  - Prereqs: WebSocket server at `wss://` endpoint, ngrok or public URL for development.
  - Gotcha: Voice name format differs from `<Say>` — use `en-US-Chirp3-HD-Aoede` not `Google.en-US-Chirp3-HD-Aoede`. 10 consecutive malformed WebSocket messages terminates connection (error 64105). Check `message.last`, never `message.isFinal`.

- **Recording**: The input for batch transcription. Calls must be recorded before they can be transcribed at scale. Configure recording on calls, conferences, or trunks, then process the recordings through Conversational Intelligence.
  - Gotcha: Use `source_sid` (Recording SID) for Voice Intelligence transcript creation, NOT `media_url`. The Intelligence API cannot authenticate against protected URLs.

- **`<Transcribe>`**: Twilio's built-in transcription capability. Attach to recordings for automatic transcription. Simpler than full Conversational Intelligence but lacks advanced features (entity detection, sentiment, PII redaction).
  - Prereqs: Conversational Intelligence Service SID for advanced features (entity detection, PII redaction). Basic transcription works without it.

- **`<Transcription>`**: Near real-time transcription during live calls via `<Start><Transcription>`. Twilio-managed STT (Google or Deepgram engine) delivers transcript events to your webhook with 1-2 second latency. Supports dual-track transcription (`inbound_track`, `outbound_track`, `both_tracks`) for speaker diarization. When `intelligenceService` SID is specified, the transcript is automatically persisted and Language Operators run post-call — bridging real-time transcription with post-call analytics without additional API calls.
  - Prereqs: StatusCallback URL to receive transcription events. Conversational Intelligence Service SID for `intelligenceService` integration.
  - Gotcha: Callback payload is form-encoded (not JSON). `partialResults="true"` generates high webhook traffic — budget for sustained volume. Encrypted recordings cannot be transcribed. Short utterances (<200ms) may not produce output. Engine-specific `speechModel` values are not interchangeable between Google and Deepgram.

- **Voice Insights**: Call metadata that enriches transcription analysis — call duration, quality scores, participant information. Combine Voice Insights data with transcription data for complete call intelligence.

- **`<Stream>`**: Real-time audio streaming for custom STT or audio processing. Use `<Start><Stream>` to send raw audio to your own transcription service or audio pipeline. For Twilio-managed real-time transcription, prefer `<Start><Transcription>` instead.
  - Prereqs (bidirectional): WebSocket server accepting `wss://` connections.
  - Gotcha: `<Connect><Stream>` (bidirectional) blocks all subsequent TwiML until WebSocket closes. Cannot stop a bidirectional stream without ending the call. Audio is strictly mulaw 8kHz base64 — no format negotiation.

### Connectivity

- **SIP Interface (Programmable SIP)**: Ingest calls from SIP infrastructure for transcription via SIP Domains. Common in enterprise environments where calls from the PBX need to be transcribed.

- **PSTN**: Standard telephony calls that get recorded and transcribed.

- **BYOC**: Transcribe calls from existing carrier infrastructure.

- **Interconnect**: High-volume call ingestion from dedicated connections for transcription at scale.

### Features

- **SIPREC**: SIP Recording Protocol for capturing call audio at the network level. Use when you need protocol-level recording independent of application logic — the recording feeds into the transcription pipeline.

- **Multimodal Realtime API** `(†)`: Enable multimodal transcription and analysis — combining voice with other data channels for richer intelligence.

- **SSML TTS**: Relevant when transcription reveals issues with TTS pronunciation in automated calls, enabling SSML corrections.

- **Speech Recognition**: The STT engine powering real-time transcription. Quality of speech recognition directly affects transcription accuracy.

- **HIPAA**: Required for transcribing calls containing protected health information.
- **GDPR**: EU data protection compliance for transcription data — includes PII redaction requirements.
- **PCI**: Compliance for transcribing calls that contain payment information. Conversational Intelligence supports PII/PCI redaction in transcripts.
