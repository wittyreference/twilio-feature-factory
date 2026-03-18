# Use Cases 1–4: Notifications, IVR, Contact Centers

Detailed product entries for traditional voice use cases. Each product includes Why/When/Prereqs/Gotchas.

See [SKILL.md](../SKILL.md) for the quick reference table and decision tree. See [product-matrix.md](product-matrix.md) for the full product × use case grid.

---

## Use Case 1: Voice Notifications

**Summary:** Outbound information delivery — appointment reminders, payment alerts, OTPs, emergency notifications. The most common entry point on the use case ladder. The core pattern is simple: create a call via API, <Play> or <Say> a message, optionally collect a response, hang up.

> Outbound notifications require express consent from recipients. Calls prohibited before 8 AM / after 9 PM in the recipient's local time zone.

### Software Tools

- **Conversational Intelligence**: Post-call analysis of notification campaigns at scale. Use to detect opt-out intent in recorded responses, monitor sentiment across thousands of calls, and identify failed delivery patterns. Don't use for real-time decisions during the notification call itself.
  - Prereqs: Intelligence Service SID created in Twilio Console (no API to create — must be manual).

- **Studio**: Visual flow builder for notification sequences. Relevant for teams without developer resources who need to build simple outbound flows. Per project convention, **always prefer Functions over Studio** — Claude Code handles the complexity better.

- **Event Streams**: Stream call events (initiated, ringing, answered, completed) to your analytics pipeline in real time. Essential for monitoring delivery rates across large campaigns. Set up a Webhook or Kinesis sink to track which notifications reached humans vs machines vs failures.
  - Prereqs: Sink configured (Webhook URL, Kinesis ARN + IAM role, or Segment write key).

- **Functions**: Host your TwiML endpoints for notification call flows. The `action` URL on `<Gather>` and the initial TwiML URL both point here. Keep notification functions simple — play message, optionally gather confirmation, end call.

- **Assets**: Host pre-recorded audio files (`.mp3`, `.wav`) for notifications that use `<Play>` instead of `<Say>`. Useful for regulatory messages or brand-specific recordings. Don't use for dynamic content — use `<Say>` with TTS instead.

- **CLI**: Deploy Functions and Assets, manage phone numbers, and test notification flows from the command line. Use `twilio api:core:calls:create` for quick outbound call tests during development.

### Core Services

- **`<Say>`**: Primary TwiML verb for notifications. Delivers dynamic TTS content — appointment times, account balances, OTP codes. Use SSML for pauses, emphasis, or spelling out digits. Pair with `<Gather>` when you need the recipient to confirm or respond.

- **Recording**: Record notification calls for compliance and dispute resolution. Set `Record=true` on the Calls API create request to capture the entire call. Particularly important for payment reminders and legal notifications where proof of delivery matters.
  - Gotcha: Use `source_sid` (Recording SID) for Voice Intelligence transcript creation, NOT `media_url`. The Intelligence API cannot authenticate against protected URLs.

- **`<Transcribe>`**: Transcribe recorded notification calls for searchable compliance archives. Most useful when combined with `<Gather speech>` to capture and log what the recipient said in response. Not needed for simple one-way announcements with no interaction.
  - Prereqs: Conversational Intelligence Service SID for advanced features (entity detection, PII redaction). Basic transcription works without it.

- **Voice Insights**: Monitor notification campaign performance — answer rates, call duration, call quality scores. The Reports API provides aggregate metrics across campaigns. Use Call Summary to investigate individual failed deliveries. Essential for optimizing large-volume notification systems.

### Connectivity

- **PSTN**: The delivery path for all voice notifications. Outbound calls traverse the PSTN to reach recipients on their phone numbers. No alternative connectivity needed for standard notification use cases.

### Features

- **Branded Calls**: Display your business name on the recipient's phone instead of just a number. Critical for notification answer rates — recipients are far more likely to pick up a call labeled "Valley Medical Center" than an unknown number. Mobile only; use CNAM for landline recipients.
  - Prereqs: Approved Business Profile in Trust Hub + Voice Integrity approval.

- **Enhanced Branded Calling**: Name + logo + call reason on the recipient's screen. Ideal for high-value notifications (healthcare appointments, financial alerts) where trust drives answer rates. Currently in Public Beta.
  - Prereqs: Approved Business Profile in Trust Hub + Voice Integrity approval. Additionally requires A-level SHAKEN/STIR attestation + signed LOA.

- **SHAKEN/STIR**: Cryptographic attestation proving the calling number is legitimate. Produces the green checkmark on mobile phones. Required foundation for Branded Calling and Enhanced Branded Calling. Set up per-number via Trust Hub with Business Profile.
  - Prereqs: Primary Customer Profile approved in Trust Hub. BYOC numbers may only receive B or C attestation.
  - Gotcha: When forwarding calls with preserved caller ID, you must pass the `CallToken` from the inbound webhook to the outbound Calls/Participants API call. `<Dial>` preserves caller ID automatically.

- **CNAM**: Caller Name delivery for landline recipients. Branded Calls only works on mobile — CNAM is the landline equivalent. Register your business name against your Twilio numbers so landline caller ID displays show your name.

- **CPS (Calls Per Second)**: Rate limiting for outbound call volume. Default is 1 CPS — far too low for any meaningful notification campaign. Self-serve up to 5 CPS via Console. Above 5 requires offline approval. Plan CPS needs based on campaign size and delivery window.

- **AMD (Answering Machine Detection)**: Critical for notifications where reaching a human matters. Set `MachineDetection=Enable` on the Calls API create request — returns `AnsweredBy` in the status callback so you can branch logic (play TTS to human, leave voicemail for machine). Use `DetectMessageEnd` mode to wait for the voicemail beep before playing. Don't use for inbound calls or `<Dial>` verb calls.
  - Gotcha: Does NOT work with SIP Trunking, `<Dial><Client>`, `<Dial><Conference>`, or `<Dial><Queue>`. Synchronous mode (without `AsyncAmd=true`) creates ~4s dead air — real humans hang up. Use `AsyncAmd=true` on Calls API to avoid dead air.

- **SSML TTS**: Fine-grained control over how notification text is spoken. Use `<say-as interpret-as="telephone">` for phone numbers, `<say-as interpret-as="date">` for dates, `<break>` for pauses between information chunks. Essential for notifications with numbers, codes, or structured data.

- **Failover & DR**: Disaster recovery configuration for notification delivery. Configure failover URLs on your TwiML endpoints so notifications still go out if your primary server is down. Important for time-sensitive notifications (emergency alerts, OTP codes).

- **Trust & Engagement Insights**: Analytics on how carriers and recipients interact with your notification calls — blocked rates, spam labels, answer rates by carrier. Use to diagnose why answer rates dropped and which numbers need remediation.

- **Emergency Calling**: Relevant when notification systems must comply with emergency broadcasting requirements or when building public safety notification platforms. Not needed for standard commercial notifications.

### Non-Voice Products

- **Phone Numbers**: You need Twilio phone numbers as caller ID for outbound notifications. Purchase numbers with voice capability. Consider number pools for high-volume campaigns to distribute load and reduce per-number spam flagging risk.

---

## Use Case 2: Self-Service Automation (IVR)

**Summary:** Handle interactions without human agents — IVR menus, payment capture, appointment scheduling, AI-powered self-service. The goal is containment: resolve the caller's need without routing to an expensive human agent, while always providing an escalation path.

### Software Tools

- **Conversational Intelligence**: Analyze self-service interactions to find where callers abandon or escalate. Detect recurring intents that the IVR doesn't handle well. Use entity detection to identify products, account types, or issues mentioned during AI-powered self-service sessions.
  - Prereqs: Intelligence Service SID created in Twilio Console (no API to create — must be manual).

- **Studio**: Visual IVR builder. Per project convention, **always prefer Functions** — complex IVR flows in Studio become unmaintainable spider webs.

- **Event Streams**: Stream IVR interaction events for real-time monitoring of containment rates. Track which menu options callers select, where they drop off, and how long they spend in self-service before escalating.
  - Prereqs: Sink configured (Webhook URL, Kinesis ARN + IAM role, or Segment write key).

- **Functions**: Host all IVR logic as serverless functions. Each menu level, payment flow, and AI handoff gets its own function. The `action` URL on `<Gather>` chains functions together to build the IVR tree.

- **Assets**: Host hold music, menu prompt audio files, and static recordings. Use for brand-consistent audio that doesn't change dynamically. Don't store sensitive content here — Assets are accessible by URL.

- **CLI**: Deploy and test IVR functions. Use `twilio phone-numbers:update` to point inbound numbers at your IVR entry function.

### Core Services

- **`<Say>`**: Deliver dynamic IVR prompts. "Press 1 for billing, press 2 for support." Use with SSML for natural-sounding menus. Pair with `<Gather>` — nest `<Say>` inside `<Gather>` so the prompt plays while waiting for input.

- **`<Gather>`**: The primary IVR interaction verb. Captures DTMF digits or speech input from callers. Set `input="dtmf speech"` for dual-mode. Use `numDigits` for fixed-length input (account numbers), `finishOnKey` for variable-length. The `action` URL receives the caller's input for routing.

- **`<Pay>`**: PCI-compliant payment capture within the IVR. Handles credit card number, expiration, CVV, and ZIP code collection via DTMF with automatic PCI scope reduction. Don't build your own DTMF-based payment capture — `<Pay>` handles PCI compliance automatically.
  - Prereqs: Payment connector configured in Console (Stripe, Braintree, CardConnect, Chase, Adyen, or Generic).
  - Gotcha: PCI Mode is **irreversible and account-wide** — redacts ALL logs, disables native transcription, auto-deletes recordings after 1 year. Create a separate sub-account for payments. DTMF input only (no speech). Star key (`*`) terminates payment at any time.

- **Conversation Relay**: LLM-powered dynamic conversations replacing rigid menu trees. The caller speaks naturally and the AI agent handles intent detection, slot filling, and response generation. Use when static `<Gather>` menus can't handle the interaction complexity. Requires a WebSocket server with LLM integration.
  - Prereqs: WebSocket server at `wss://` endpoint, ngrok or public URL for development.
  - Gotcha: Voice name format differs from `<Say>` — use `en-US-Chirp3-HD-Aoede` not `Google.en-US-Chirp3-HD-Aoede`. 10 consecutive malformed WebSocket messages terminates connection (error 64105). Check `message.last`, never `message.isFinal`.

- **VirtualAgent**: Google Dialogflow integration for AI-powered IVR. Only use if the customer has an existing Dialogflow virtual agent. Otherwise, recommend Conversation Relay for direct LLM integration.
  - Prereqs: Existing Google Dialogflow CX agent with telephony integration configured.

- **Recording**: Record self-service sessions for QA, compliance, and dispute resolution. Especially important for payment and account-change interactions. Use `<Start><Record>` to begin recording at specific points in the flow rather than recording the entire call.

- **`<Transcribe>`**: Transcribe self-service interactions for searchable records. Useful for AI-powered sessions where you need to audit what the AI said and what the caller requested.
  - Prereqs: Conversational Intelligence Service SID for advanced features (entity detection, PII redaction). Basic transcription works without it.

- **Voice Insights**: Monitor IVR performance — call duration distributions, drop-off points, quality scores. Use Call Events to see the TwiML execution timeline and identify slow or failing steps in the IVR flow.

- **`<Stream>`**: Send real-time audio to external services during the IVR session. Use `<Start><Stream>` (unidirectional) for live transcription monitoring, or `<Connect><Stream>` (bidirectional) for third-party AI that needs to both listen and speak.
  - Prereqs (bidirectional): WebSocket server accepting `wss://` connections.
  - Gotcha: `<Connect><Stream>` (bidirectional) blocks all subsequent TwiML until WebSocket closes. Cannot stop a bidirectional stream without ending the call. Audio is strictly mulaw 8kHz base64 — no format negotiation.

### Connectivity

- **Voice SDKs**: Enable web-based or mobile-app self-service. Callers interact with the IVR from a browser or app instead of dialing a phone number. Useful for in-app support flows.

- **SIP Interface (Programmable SIP)**: Accept calls from SIP-based phone systems into the IVR via a SIP Domain. Common when the IVR sits behind an existing enterprise PBX. The SIP leg is cheaper than PSTN ($0.004/min) since Twilio communicates directly with authenticated SIP infrastructure.

- **PSTN**: Standard inbound path — callers dial a phone number and reach the IVR.

- **BYOC**: Bring Your Own Carrier for customers who want to use their existing phone numbers and carrier relationships with the Twilio IVR platform.

- **Interconnect**: Private, dedicated connectivity between Twilio and the customer's network. Use for high-volume IVR deployments where latency and reliability are critical.

### Features

- **SHAKEN/STIR**: Verify incoming caller identity. Check the `StirVerstat` webhook parameter to assess caller trustworthiness — useful for fraud screening before allowing account access via IVR.
  - Prereqs: Primary Customer Profile approved in Trust Hub. BYOC numbers may only receive B or C attestation.

- **CNAM**: Look up the caller's name for personalized IVR greetings. "Welcome back, John" creates a better experience than generic prompts.

- **SIP `<Refer>`**: Transfer the call to another SIP endpoint without keeping Twilio in the media path. Use when the IVR needs to hand off to an external system after self-service is complete.

- **SIPREC**: Session Recording Protocol for recording calls at the SIP level. Use when regulatory requirements mandate carrier-level recording of IVR interactions.

- **SIP Registration**: Allow SIP endpoints to register with Twilio for receiving transferred calls from the IVR.

- **SIP Header Manipulation**: Pass custom data in SIP headers when transferring calls from IVR to other systems. Include context like "caller selected billing" so the receiving system knows the IVR outcome.

- **AMD**: Detect answering machines on outbound IVR calls (callback scenarios). If the IVR offers "press 1 for a callback," use AMD when placing that callback to detect whether a human answered.
  - Gotcha: Does NOT work with SIP Trunking, `<Dial><Client>`, `<Dial><Conference>`, or `<Dial><Queue>`. Synchronous mode (without `AsyncAmd=true`) creates ~4s dead air — real humans hang up. Use `AsyncAmd=true` on Calls API to avoid dead air.

- **SSML TTS**: Essential for IVR prompts. Use `<prosody>` to slow down account numbers, `<break>` between menu options, `<emphasis>` for important information. Makes robotic menus sound natural.

- **Speech Recognition**: Powers the speech input mode of `<Gather>`. Recognizes caller utterances for voice-navigated IVRs. Set `speechModel="phone_call"` for telephony-optimized recognition.

- **`<Enqueue>`/`<Queue>`**: Queue callers for agent handoff when self-service can't resolve their need. Play hold music and estimated wait time. Use simple `<Enqueue>` for FIFO queuing; switch to TaskRouter for skill-based routing.

- **Failover & DR**: Configure backup TwiML URLs for IVR endpoints. If the primary function host is down, callers still reach a functional IVR (even if degraded). Critical for customer-facing IVR systems.

- **Trust & Engagement Insights**: Monitor how carriers treat your IVR phone numbers. Ensures your inbound numbers aren't being flagged or blocked.

- **Emergency Calling**: Comply with E911 requirements if the IVR system handles emergency-related calls or needs to provide emergency callback capabilities.

- **HIPAA**: Required compliance framework for IVR systems handling protected health information — appointment scheduling, prescription refills, medical record access.

---

## Use Case 3: Inbound Contact Center

**Summary:** Route incoming calls to human agents with queuing, skills-based routing, coaching, warm transfers, and real-time monitoring. Builds on top of self-service automation — the IVR front-end handles what it can, then escalates to agents.

### Software Tools

- **Conversational Intelligence**: Real-time and post-call analysis of agent-customer interactions. Detect sentiment shifts, identify coaching opportunities, flag compliance violations. At scale, reveals which agents handle which topics best.
  - Prereqs: Intelligence Service SID created in Twilio Console (no API to create — must be manual).

- **Studio**: Visual flow builder for routing logic. Per project convention, **always use Functions instead**.

- **Event Streams**: Stream contact center events (call queued, agent assigned, call completed) to your workforce management and analytics platforms. Essential for real-time dashboards showing queue depth, wait times, and agent utilization.
  - Prereqs: Sink configured (Webhook URL, Kinesis ARN + IAM role, or Segment write key).

- **TaskRouter**: The routing engine for inbound contact centers. Matches incoming calls to available agents based on skills (language, product expertise, tier), queue priority, and agent availability. Manages Workspaces, Workers, TaskQueues, and Workflows. Use this over simple `<Queue>` whenever agents have different skills.
  - Prereqs: Workspace, Workers, TaskQueues, and Workflow configured before routing works.

- **Sync**: Real-time state synchronization for agent dashboards and supervisor panels. Store agent availability, queue metrics, and call context in Sync Documents/Maps that update in real-time across all connected clients.
  - Prereqs: Sync Service created (`TWILIO_SYNC_SERVICE_SID`).

- **Functions**: Host all routing logic, TwiML generation, and TaskRouter event handlers. Conference management, warm transfer orchestration, and agent assignment all run as Functions.

- **Assets**: Host hold music, whisper prompts ("incoming billing call"), and agent training audio.

- **CLI**: Deploy contact center functions, manage TaskRouter configuration, and provision phone numbers.

### Core Services

- **Conference**: The backbone of contact center calls. Every agent-customer interaction should use Conference (not `<Dial>`) because you'll need warm transfer, hold, mute, coaching, or whisper at some point. Create a uniquely-named conference per call, add customer and agent as participants.
  - Gotcha: In warm transfers, `endConferenceOnExit` must be deliberately assigned per participant — set `true` on customer and receiving agent, `false` on transferring agent. Updating a participant's TwiML via REST pulls them OUT of the conference (one-document-per-call rule).

- **`<Say>`**: IVR prompts before routing, hold announcements, whisper messages to agents before connecting. "You're receiving a billing call from a premium customer."

- **`<Gather>`**: IVR front-end for intent detection and self-service before routing to agents. Capture the reason for calling to inform routing decisions.

- **`<Pay>`**: Agent-assisted payment capture. The agent guides the caller through payment while `<Pay>` handles PCI-compliant card collection. Reduces PCI scope — the agent never hears card numbers.
  - Prereqs: Payment connector configured in Console (Stripe, Braintree, CardConnect, Chase, Adyen, or Generic).
  - Gotcha: PCI Mode is **irreversible and account-wide** — redacts ALL logs, disables native transcription, auto-deletes recordings after 1 year. Create a separate sub-account for payments. DTMF input only (no speech). Star key (`*`) terminates payment at any time.

- **Conversation Relay**: AI-powered front-end before human agents. Handle simple queries via AI, escalate complex ones to humans. The AI agent can also assist the human agent in real-time with suggested responses.
  - Prereqs: WebSocket server at `wss://` endpoint, ngrok or public URL for development.
  - Gotcha: Voice name format differs from `<Say>` — use `en-US-Chirp3-HD-Aoede` not `Google.en-US-Chirp3-HD-Aoede`. 10 consecutive malformed WebSocket messages terminates connection (error 64105). Check `message.last`, never `message.isFinal`.

- **VirtualAgent**: Dialogflow-based front-end. Only if the customer has existing Dialogflow infrastructure.
  - Prereqs: Existing Google Dialogflow CX agent with telephony integration configured.

- **Recording**: Record all agent-customer interactions for QA, compliance, training, and dispute resolution. Use conference-level recording for the full interaction, or per-participant recording when you need to isolate agent vs customer audio.

- **`<Transcribe>`**: Real-time or post-call transcription of agent interactions. Powers live captioning, real-time agent assist, and post-call summarization.
  - Prereqs: Conversational Intelligence Service SID for advanced features (entity detection, PII redaction). Basic transcription works without it.

- **Voice Insights**: Monitor call quality across the contact center. Identify agents with poor audio quality, detect network issues, and track call disposition patterns. Conference Insights specifically shows participant-level quality.

- **`<Stream>`**: Send real-time audio to AI services for live transcription, sentiment analysis, or agent assist. Use `<Start><Stream>` (unidirectional) alongside the Conference to monitor without disrupting the call.
  - Prereqs (bidirectional): WebSocket server accepting `wss://` connections.
  - Gotcha: `<Connect><Stream>` (bidirectional) blocks all subsequent TwiML until WebSocket closes. Cannot stop a bidirectional stream without ending the call. Audio is strictly mulaw 8kHz base64 — no format negotiation.

### Connectivity

- **Voice SDKs**: Agent softphones built into web or mobile apps. JavaScript SDK for browser-based agent desktops, iOS/Android SDKs for mobile agents. The primary way agents connect to calls in modern contact centers.

- **SIP Interface (Programmable SIP)**: Connect to existing SIP-based agent phones or PBX systems via SIP Domains. Use when agents have hardware SIP phones or the contact center integrates with existing telephony infrastructure. Supports SIP Registration for agent desk phones and softphones.

- **PSTN**: Inbound path for customer calls. Also used for agent connections when agents use traditional phones instead of softphones.

- **BYOC**: Bring existing phone numbers and carrier relationships to the Twilio contact center platform. Common in enterprise migrations where number porting isn't feasible.

- **Interconnect**: Dedicated connectivity for large-scale contact centers where call volume justifies private network connections for quality and reliability.

- **WhatsApp**: Omnichannel contact center handling WhatsApp messages alongside voice calls. Agents handle both channels through the same routing and queuing infrastructure.

### Features

- **Branded Calls**: Display the contact center's business name on outbound callbacks. When an agent calls a customer back, the customer sees the business name, increasing answer rates.
  - Prereqs: Approved Business Profile in Trust Hub + Voice Integrity approval.

- **Enhanced Branded Calling**: Name + logo + call reason for premium callback experiences. "Valley Medical — Your test results are ready."
  - Prereqs: Approved Business Profile in Trust Hub + Voice Integrity approval. Additionally requires A-level SHAKEN/STIR attestation + signed LOA.

- **SHAKEN/STIR**: Attestation for outbound callbacks and verification of inbound caller identity.
  - Prereqs: Primary Customer Profile approved in Trust Hub. BYOC numbers may only receive B or C attestation.
  - Gotcha: When forwarding calls with preserved caller ID, you must pass the `CallToken` from the inbound webhook to the outbound Calls/Participants API call. `<Dial>` preserves caller ID automatically.

- **CNAM**: Caller name lookup for inbound calls. Agents see the caller's name before answering.

- **Secure Media**: Encrypted media streams for sensitive contact center interactions. Required for healthcare, financial services, and government contact centers.

- **Anomaly Detection**: Detect unusual call patterns that might indicate fraud, toll fraud, or system abuse. Alert supervisors to anomalous behavior in real-time.

- **Phone Numbers (feature)**: Number management for contact center DIDs — assign specific numbers to departments, campaigns, or regions.

- **SIP `<Refer>`**: Transfer calls to external SIP endpoints (e.g., a specialist's direct line outside the contact center) without keeping Twilio in the media path.

- **SIPREC**: SIP-level recording for regulatory compliance. Records at the protocol level independent of application logic.

- **SIP Registration**: Agent SIP phones register with Twilio to receive routed calls.

- **SIP Header Manipulation**: Pass routing context (skills matched, queue name, customer tier) in SIP headers when connecting to agent phones.

- **Application Connect** `(†)`: Connect contact center calls to external applications via Twilio's Application Connect framework.

- **Multimodal Realtime API** `(†)`: Enable multimodal interactions (voice + visual) for agent-assisted scenarios where screen sharing or visual aids complement the voice call.

- **AMD**: Detect answering machines on outbound callbacks. When an agent or system calls a customer back, AMD determines if a human answered so the agent isn't wasted on voicemail.
  - Gotcha: Does NOT work with SIP Trunking, `<Dial><Client>`, `<Dial><Conference>`, or `<Dial><Queue>`. Synchronous mode (without `AsyncAmd=true`) creates ~4s dead air — real humans hang up. Use `AsyncAmd=true` on Calls API to avoid dead air.

- **SSML TTS**: IVR prompts, hold announcements, whisper messages. Use natural-sounding voices for customer-facing prompts and clear, concise whispers for agent instructions.

- **Programmable Video** `(†)`: Video escalation from voice call. A customer calls in, and the agent escalates to video for visual troubleshooting or ID verification.

- **Speech Recognition**: Voice-navigated IVR before agent routing. Also powers real-time speech analytics during agent calls.

- **Segment Integration**: Enrich caller profiles with Segment customer data. When a call comes in, look up the caller in Segment to surface purchase history, support tickets, and preferences to the agent.

- **User Defined Messages**: Send custom application data to participants during a Conference. Use to push caller context, suggested responses, or CRM data to the agent's softphone UI in real-time.

- **`<Enqueue>`/`<Queue>`**: Queue callers waiting for agents. Play hold music and position announcements. Use with TaskRouter for skill-based queue management.

- **Failover & DR**: Multi-region failover for contact center infrastructure. Critical — a contact center outage means customers can't reach support.

- **Trust & Engagement Insights**: Monitor the reputation of contact center phone numbers. Ensure outbound callback numbers aren't flagged as spam.

- **Reports API**: Aggregate reporting on contact center performance — call volumes, handle times, answer rates, abandon rates.

- **Conference Insights**: Per-conference and per-participant quality metrics. Identify audio quality issues, detect when participants can't hear each other, and monitor conference health.

- **Emergency Calling**: E911 compliance for contact centers that handle emergency calls or need to provide emergency services.

- **HIPAA**: Protected health information compliance for healthcare contact centers.
- **GDPR**: EU data protection compliance for contact centers handling EU customer data.
- **SOC2**: Security compliance for contact centers processing sensitive data.
- **ISO/IEC 27001**: Information security management compliance.
- **PCI**: Payment card industry compliance for contact centers handling payments.

### Non-Voice Products

- **Flex**: Twilio's contact center platform. Provides the agent desktop UI, supervisor dashboard, and out-of-the-box contact center functionality. Use Flex when building a full contact center rather than custom-building everything from scratch.

- **Phone Numbers**: Inbound DIDs for the contact center. Purchase numbers local to your service regions for customer familiarity.

---

## Use Case 4: Outbound Contact Center

**Summary:** Proactive outbound calling campaigns — collections, surveys, appointment confirmations, proactive support. The key difference from inbound: both parties join via the Participants API (not incoming PSTN + agent dial-in), and AMD optimizes agent time by only connecting agents when humans answer.

> TCPA requires express written consent for automated sales/marketing calls. Maintain DNC registry compliance. Penalties are $500-$1,500 per violation per call.

### Software Tools

*Same infrastructure as Inbound Contact Center (Use Case 3) — TaskRouter, Sync, Event Streams, Functions, etc. The software tooling is identical; the difference is in call flow patterns.*

- **Conversational Intelligence**: Analyze outbound campaign effectiveness. Detect customer sentiment, identify successful pitch patterns, and flag compliance issues across thousands of outbound calls.
  - Prereqs: Intelligence Service SID created in Twilio Console (no API to create — must be manual).

- **Studio**: Per project convention, **always use Functions**.

- **Event Streams**: Stream campaign events to analytics. Track dial attempts, connect rates, agent utilization, and disposition codes in real-time.
  - Prereqs: Sink configured (Webhook URL, Kinesis ARN + IAM role, or Segment write key).

- **TaskRouter**: Route answered outbound calls to available agents. In outbound, TaskRouter assigns agents to answered calls rather than routing incoming calls to agents. The flow reverses: call first, route to agent on answer.
  - Prereqs: Workspace, Workers, TaskQueues, and Workflow configured before routing works.

- **Sync**: Coordinate campaign state across dialer instances. Track which numbers have been called, agent availability, and campaign progress in real-time.
  - Prereqs: Sync Service created (`TWILIO_SYNC_SERVICE_SID`).

- **Functions**: Host the outbound dialer logic — Conference creation, Participants API calls, AMD result handling, and agent connection orchestration.

- **Assets**: Hold music for the brief moment between customer answer and agent connection.

- **CLI**: Deploy dialer functions, manage campaign phone numbers, configure CPS limits.

### Core Services

- **Conference**: Central to the outbound pattern. Create a conference, add the customer via Participants API with AMD, then add the agent when the customer answers. This pattern ensures agents only spend time on live conversations.
  - Gotcha: In warm transfers, `endConferenceOnExit` must be deliberately assigned per participant — set `true` on customer and receiving agent, `false` on transferring agent. Updating a participant's TwiML via REST pulls them OUT of the conference (one-document-per-call rule).

- **`<Say>`**: Play announcements while the agent connects, or deliver automated messages when AMD detects a machine.

- **`<Gather>`**: Collect customer responses during outbound interactions — survey answers, payment confirmations, appointment selections.

- **`<Pay>`**: Agent-assisted payment collection during outbound collection calls. PCI-compliant card capture while the agent guides the customer.
  - Prereqs: Payment connector configured in Console (Stripe, Braintree, CardConnect, Chase, Adyen, or Generic).
  - Gotcha: PCI Mode is **irreversible and account-wide** — redacts ALL logs, disables native transcription, auto-deletes recordings after 1 year. Create a separate sub-account for payments. DTMF input only (no speech). Star key (`*`) terminates payment at any time.

- **Conversation Relay**: AI-powered outbound conversations. The AI agent handles the initial outbound call and escalates to a human agent when needed. Useful for high-volume campaigns where AI handles routine interactions.
  - Prereqs: WebSocket server at `wss://` endpoint, ngrok or public URL for development.
  - Gotcha: Voice name format differs from `<Say>` — use `en-US-Chirp3-HD-Aoede` not `Google.en-US-Chirp3-HD-Aoede`. 10 consecutive malformed WebSocket messages terminates connection (error 64105). Check `message.last`, never `message.isFinal`.

- **VirtualAgent**: Dialogflow-based outbound automation. Only if existing Dialogflow infrastructure exists.
  - Prereqs: Existing Google Dialogflow CX agent with telephony integration configured.

- **Recording**: Record all outbound calls for compliance (TCPA, TSR), quality monitoring, and dispute resolution. Especially critical for collections and sales where regulatory scrutiny is high.

- **`<Transcribe>`**: Transcribe outbound calls for compliance auditing. Regulators may require proof of what was said during collections or sales calls.
  - Prereqs: Conversational Intelligence Service SID for advanced features (entity detection, PII redaction). Basic transcription works without it.

- **Voice Insights**: Campaign analytics — connect rates, average handle time, agent performance, call quality. Reports API provides aggregate campaign metrics.

- **`<Stream>`**: Real-time audio streaming for live compliance monitoring and agent assist during outbound calls.
  - Prereqs (bidirectional): WebSocket server accepting `wss://` connections.
  - Gotcha: `<Connect><Stream>` (bidirectional) blocks all subsequent TwiML until WebSocket closes. Cannot stop a bidirectional stream without ending the call. Audio is strictly mulaw 8kHz base64 — no format negotiation.

### Connectivity

*Identical to Inbound Contact Center.* Voice SDKs for agent softphones, SIP Interface (Programmable SIP) for hardware phones, PSTN for customer connections, BYOC for existing numbers, Interconnect for dedicated connectivity, WhatsApp for omnichannel.

### Features

*Largely identical to Inbound Contact Center with outbound-specific emphasis:*

- **Branded Calls**: Essential for outbound. Answer rates for unknown numbers are dismally low. Branded Calling showing your business name can double or triple answer rates on outbound campaigns.
  - Prereqs: Approved Business Profile in Trust Hub + Voice Integrity approval.

- **Enhanced Branded Calling**: Business name + logo + call reason. "Valley Collections — Payment arrangement available." Dramatically improves answer rates for sensitive outbound calls.
  - Prereqs: Approved Business Profile in Trust Hub + Voice Integrity approval. Additionally requires A-level SHAKEN/STIR attestation + signed LOA.

- **SHAKEN/STIR**: Required for outbound legitimacy. Without attestation, outbound calls are increasingly blocked by carriers.
  - Prereqs: Primary Customer Profile approved in Trust Hub. BYOC numbers may only receive B or C attestation.
  - Gotcha: When forwarding calls with preserved caller ID, you must pass the `CallToken` from the inbound webhook to the outbound Calls/Participants API call. `<Dial>` preserves caller ID automatically.

- **CNAM**: Register business name for landline caller ID display on outbound calls.

- **AMD**: The most critical feature for outbound contact centers. Detect human vs answering machine on every outbound call. Agents only connect to humans — answering machines get automated messages or are flagged for retry. This single feature drives the entire efficiency model of outbound contact centers. Use `MachineDetection=Enable` on every Participants API call.
  - Gotcha: Does NOT work with SIP Trunking, `<Dial><Client>`, `<Dial><Conference>`, or `<Dial><Queue>`. Synchronous mode (without `AsyncAmd=true`) creates ~4s dead air — real humans hang up. Use `AsyncAmd=true` on Calls API to avoid dead air.

- **Anomaly Detection**: Monitor outbound campaigns for unusual patterns — sudden spikes in blocked calls, unexpected carrier rejections, or potential toll fraud.

- **Trust & Engagement Insights**: Track outbound number reputation across carriers. Detect when numbers are being flagged or blocked and rotate to fresh numbers proactively.

- **Reports API**: Campaign-level reporting — total attempts, connects, agent handle time, dispositions.

- **Conference Insights**: Quality monitoring for outbound conference-based calls.

*All other features (Secure Media, SIP features, compliance certifications) are the same as Inbound Contact Center.*

### Non-Voice Products

- **Flex**: Agent desktop for outbound campaigns. Integrates with the dialer to present customer information and call controls.

- **Phone Numbers**: Caller ID numbers for outbound campaigns. Use number pools to distribute volume and reduce per-number spam flagging. Rotate numbers based on Trust & Engagement Insights data.
