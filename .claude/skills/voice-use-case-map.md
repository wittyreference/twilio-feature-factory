# Voice Use Case Product Map

Definitive per-use-case product mapping for Twilio Voice. Load this skill when recommending Twilio products for a voice use case.

## Quick Reference (scan this first)

| UC | Name | Core Products | Key Feature |
|----|------|--------------|-------------|
| 1 | Voice Notifications | Voice API, Say, Gather, AMD, Recording | Outbound reminder + speech confirm |
| 2 | Self-Service (IVR) | Voice API, Say, Gather, Recording | Multi-level menu, DTMF + speech |
| 3 | Inbound Contact Center | TaskRouter, Conference, Recording, Sync | Skills-based routing to agents |
| 4 | Outbound Contact Center | Conference, Participants API, AMD, Recording | Agent-first then connect customer |
| 5 | AI Agents (ConversationRelay) | ConversationRelay, Recording, Sync, SMS | WebSocket LLM integration |
| 6 | AI Agents (Media Streams) | `<Connect><Stream>`, Recording | Raw audio WebSocket, bring-your-own STT/TTS |
| 7 | Sales Dialer | Conference, AMD, Recording, Participants API | Parallel/power dialing |
| 8 | Call Tracking | Voice API, Say (whisper), Dial, Recording, Sync | Campaign attribution + forwarding |
| 9 | PSTN Connectivity | SIP Trunking, BYOC | Carrier interconnect (not prototyped) |
| 10 | AI/ML Transcription | Voice Intelligence, Language Operators | Post-call analysis of recordings |

**Complements:** `.claude/skills/voice.md` (decision frameworks), `functions/conversation-relay/CLAUDE.md` (ConversationRelay protocol details).

---

## Detailed Product Entries

The sections below provide per-product Why/When/Prereqs/Gotchas for each use case.

## How to Read This Document

Products are organized into five categories matching the source grid:

| Category | What It Covers |
|----------|---------------|
| **Software Tools** | Development and orchestration platforms (Studio, Functions, TaskRouter, etc.) |
| **Core Services** | TwiML verbs and voice-specific services (Say, Gather, Conference, Recording, etc.) |
| **Connectivity** | How calls enter/exit the Twilio platform (PSTN, SIP, Voice SDKs, BYOC, etc.) |
| **Features** | Capabilities that enhance calls (AMD, Branded Calling, SHAKEN/STIR, compliance, etc.) |
| **Non-Voice Products** | Adjacent Twilio products used alongside voice (Flex, Phone Numbers, etc.) |

Each product entry within a use case includes:
- **Why** this product is relevant for the specific use case
- **When** to invoke it (trigger conditions, key parameters)
- **When NOT** to invoke it (common misapplications)
- **Prereqs** — what must exist (Console config, services, infrastructure) before this product works
- **Gotcha** — critical pitfall that causes silent failure or data loss (only on products that have them)

---

## Quick Reference Matrix

Products as rows, use cases as columns. `X` = highlighted in source, `(†)` = borderline.

**Use Case Key:** Notif = Voice Notifications, IVR = Self-Service Automation, InCC = Inbound Contact Center, OutCC = Outbound Contact Center, AI-B = AI Agents (Buy/Native), AI-3P = AI Agents (Build/3PP), Sales = Sales Dialer, Track = Call Tracking, PSTN = PSTN Connectivity, Trans = AI/ML Transcription

### Software Tools

| Product | Notif | IVR | InCC | OutCC | AI-B | AI-3P | Sales | Track | PSTN | Trans |
|---------|:-----:|:---:|:----:|:-----:|:----:|:-----:|:-----:|:-----:|:----:|:-----:|
| Conversational Intelligence | X | X | X | X | X | X | X | X | X | X |
| Studio | X | X | X | X | | | X | X | | |
| Event Streams | X | X | X | X | X | X | X | | X | X |
| TaskRouter | | | X | X | | | | | | |
| Sync | | | X | X | | | | | | |
| Functions | X | X | X | X | X | X | X | X | | X |
| Assets | X | X | X | X | X | X | X | | | X |
| CLI | X | X | X | X | X | X | X | X | | X |

### Core Services

| Product | Notif | IVR | InCC | OutCC | AI-B | AI-3P | Sales | Track | PSTN | Trans |
|---------|:-----:|:---:|:----:|:-----:|:----:|:-----:|:-----:|:-----:|:----:|:-----:|
| Conference | | | X | X | | | X | X | | |
| `<Say>` | X | X | X | X | X | X | X | X | | |
| `<Gather>` | | X | X | X | X | X | | | | |
| `<Pay>` | | X | X | X | | | | | | |
| Conversation Relay | | X | X | X | X | | | | | X |
| VirtualAgent | | X | X | X | X | | | | | |
| Recording | X | X | X | X | X | X | X | X | X | X |
| `<Transcribe>` | X | X | X | X | X | X | | | | X |
| Voice Insights | X | X | X | X | X | X | X | X | X | X |
| `<Stream>` | | X | X | X | X | X | | | | X |

### Connectivity

| Product | Notif | IVR | InCC | OutCC | AI-B | AI-3P | Sales | Track | PSTN | Trans |
|---------|:-----:|:---:|:----:|:-----:|:----:|:-----:|:-----:|:-----:|:----:|:-----:|
| Voice SDKs | | X | X | X | X | X | X | X | | |
| SIP | | X | X | X | X | X | | | X | X |
| PSTN | X | X | X | X | X | X | X | X | X | X |
| BYOC | | X | X | X | X | X | X | | X | X |
| Interconnect | | X | X | X | | | | | X | X |
| WhatsApp | | | X | X | | | | | | |

### Features

| Product | Notif | IVR | InCC | OutCC | AI-B | AI-3P | Sales | Track | PSTN | Trans |
|---------|:-----:|:---:|:----:|:-----:|:----:|:-----:|:-----:|:-----:|:----:|:-----:|
| Branded Calls | X | | X | X | | | X | | | |
| Enhanced Branded Calling | X | | X | X | | | X | | | |
| SHAKEN/STIR | X | X | X | X | | | X | | X | |
| CNAM | X | X | X | X | | | X | X | X | |
| Secure Media | | | X | X | | | | | X | |
| Anomaly Detection | | | X | X | | | X | | | |
| Phone Numbers (feature) | | | X | X | | | | | | |
| SIP `<Refer>` | | X | X | X | | | | | | |
| SIPREC | | X | X | X | | X | | | | X |
| SIP Registration | | X | X | X | | | | | X | |
| SIP Header Manipulation | | X | X | X | | | | | X | |
| Application Connect | | | X | X | | | | | | |
| Multimodal Realtime API | | | X | X | X | X | | | | X |
| CPS | X | | | | | | X | | | |
| AMD | X | X | X | X | | | X | | | |
| SSML TTS | X | X | X | X | X | X | X | | | X |
| Programmable Video | | | X | X | | | | | | |
| Speech Recognition | | X | X | X | X | X | | | | X |
| Segment Integration | | | X | X | | | | X | | |
| User Defined Messages | | | X | X | X | | | | | |
| `<Enqueue>`/`<Queue>` | | X | X | X | | | | | | |
| Failover & DR | X | X | X | X | | | X | | X | |
| Trust & Engagement Insights | X | X | X | X | | | X | X | | |
| Reports API | | | X | X | | | X | | | |
| Conference Insights | | | X | X | | | X | | | |
| Emergency Calling | X | X | X | X | | | | | X | |
| HIPAA | | X | X | X | X | X | | | X | X |
| GDPR | | | X | X | | | | | X | X |
| SOC2 | | | X | X | | | | | X | |
| ISO/IEC 27001 | | | X | X | | | | | X | |
| PCI | | | X | X | | | | | X | X |

### Non-Voice Products

| Product | Notif | IVR | InCC | OutCC | AI-B | AI-3P | Sales | Track | PSTN | Trans |
|---------|:-----:|:---:|:----:|:-----:|:----:|:-----:|:-----:|:-----:|:----:|:-----:|
| Flex | | | X | X | | | | | | |
| Phone Numbers | X | | X | X | | | | X | | |

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

- **SIP**: Accept calls from SIP-based phone systems into the IVR. Common when the IVR sits behind an existing enterprise PBX.

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

- **SIP**: Connect to existing SIP-based agent phones or PBX systems. Use when agents have hardware SIP phones or the contact center integrates with existing telephony infrastructure.

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

*Identical to Inbound Contact Center.* Voice SDKs for agent softphones, SIP for hardware phones, PSTN for customer connections, BYOC for existing numbers, Interconnect for dedicated connectivity, WhatsApp for omnichannel.

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

- **SIP**: Route calls from existing SIP infrastructure to AI agents. Common in enterprise environments where the AI agent replaces or augments an existing IVR behind a PBX.

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

- **SIP**: Route calls from existing phone systems to your AI platform via Twilio.

- **PSTN**: Standard telephony path for AI agent calls.

- **BYOC**: Use existing carrier relationships with your custom AI platform.

### Features

- **Multimodal Realtime API**: Enable multimodal AI experiences combining voice with visual or data channels.

- **SIPREC**: SIP-level recording for regulatory compliance. Records at the protocol level, independent of your AI platform's recording.

- **SSML TTS**: If your AI platform returns SSML-marked text for Twilio to render (rather than sending raw audio), SSML controls pronunciation and delivery.

- **Speech Recognition**: If using `<Gather speech>` before handing off to your AI platform, Twilio's speech recognition handles the initial interaction.

- **HIPAA**: Required compliance for AI agents processing health data.

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

- **SIP**: Connect to existing SIP-based sales floor phone systems.

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

**Summary:** Elastic SIP Trunking for organizations with existing SIP infrastructure that need PSTN access. This use case **bypasses Programmable Voice entirely** — no TwiML, no AMD, no custom call flows. Pure connectivity between SIP and PSTN.

### Software Tools

- **Conversational Intelligence**: Analyze recordings from SIP Trunk traffic for quality monitoring and compliance.
  - Prereqs: Intelligence Service SID created in Twilio Console (no API to create — must be manual).

- **Event Streams**: Stream trunk-level events for monitoring call volume, routing, and failures.
  - Prereqs: Sink configured (Webhook URL, Kinesis ARN + IAM role, or Segment write key).

### Core Services

- **Recording**: Trunk-level recording captures all traffic. Configured on the trunk itself, not via TwiML (which isn't available).

- **Voice Insights**: Monitor trunk call quality — jitter, packet loss, latency, codec issues. Critical for SIP Trunking where the customer's SIP infrastructure introduces additional quality variables.

### Connectivity

- **SIP**: The customer's SIP infrastructure (PBX, SBC, UCaaS) connects to Twilio's SIP Trunking endpoints. This is the primary connectivity method.

- **PSTN**: The outbound/inbound path to the telephone network. Elastic SIP Trunking provides PSTN access for SIP-based systems.

- **BYOC**: Customers bring their own carrier contracts and route through Twilio's SIP Trunking for number management and failover.

- **Interconnect**: Dedicated private connectivity between the customer's data center and Twilio's SIP Trunking infrastructure. Essential for large deployments requiring guaranteed latency and bandwidth.

### Features

- **SHAKEN/STIR**: Attestation for outbound trunk calls. Ensures calls from the SIP trunk are properly signed to avoid carrier blocking.
  - Prereqs: Primary Customer Profile approved in Trust Hub. BYOC numbers may only receive B or C attestation.

- **CNAM**: Caller name registration for outbound trunk calls.

- **Secure Media**: SRTP encryption for media streams traversing the trunk. Required for regulatory compliance in many industries.

- **SIP Registration**: Allow the customer's SIP endpoints to register with Twilio's trunk for dynamic endpoint management.

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

**Summary:** Large-scale transcription and intelligence extraction from voice calls. Turn recorded calls into searchable, analyzable text — then apply ML for sentiment, entities, topics, and compliance monitoring. This is a post-call (and sometimes real-time) analytics use case.

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

- **Voice Insights**: Call metadata that enriches transcription analysis — call duration, quality scores, participant information. Combine Voice Insights data with transcription data for complete call intelligence.

- **`<Stream>`**: Real-time audio streaming for live transcription. Use `<Start><Stream>` to send audio to your transcription service during the call without disrupting the conversation.
  - Prereqs (bidirectional): WebSocket server accepting `wss://` connections.
  - Gotcha: `<Connect><Stream>` (bidirectional) blocks all subsequent TwiML until WebSocket closes. Cannot stop a bidirectional stream without ending the call. Audio is strictly mulaw 8kHz base64 — no format negotiation.

### Connectivity

- **SIP**: Ingest calls from SIP infrastructure for transcription. Common in enterprise environments where calls from the PBX need to be transcribed.

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

---

## Use Case Ladder (Progression)

Use cases build on each other in a natural progression. Understanding the ladder helps the architect recommend a starting point and anticipate future needs.

```
Level 5: AI/ML Transcription
         Turn calls into actionable intelligence at scale.
         Builds on: Recordings from ALL other use cases.
         ─────────────────────────────────────────────────

Level 4: Contact Centers (Inbound + Outbound)
         Human agents handling complex interactions.
         Builds on: Self-service (IVR front-end), adds routing, queuing, coaching.
         Variants: Sales Dialer (outbound sales focus), Call Tracking (marketing attribution)
         ─────────────────────────────────────────────────

Level 3: AI Agents (Buy or Build)
         AI-powered conversations replacing or augmenting humans.
         Can appear at ANY level — as IVR replacement, contact center front-end, or standalone.
         Buy (Native): ConversationRelay, VirtualAgent
         Build (3PP): Media Streams to external AI
         ─────────────────────────────────────────────────

Level 2: Self-Service Automation (IVR)
         Handle interactions without humans.
         Builds on: Notifications (adds inbound + interaction).
         ─────────────────────────────────────────────────

Level 1: Voice Notifications
         Outbound information delivery.
         Most common starting point. Simplest architecture.
         ─────────────────────────────────────────────────

Foundation: PSTN Connectivity (Elastic SIP Trunking)
            Undergirds the entire ladder but BYPASSES Programmable Voice.
            Use when: existing SIP infrastructure needs PSTN access.
            Does NOT use: TwiML, AMD, custom call flows.
```

### Common Progression Paths

1. **Notifications → IVR → Contact Center**: Start with outbound alerts, add inbound self-service, then add human agents for escalation.
2. **IVR → AI Agents → Contact Center**: Replace static IVR menus with AI, then add human escalation for complex cases.
3. **Contact Center → AI Transcription**: Existing contact center adds transcription for QA and intelligence.
4. **PSTN Connectivity → Programmable Voice**: Customer starts with SIP Trunking, then adds Programmable Voice features for specific call flows.
5. **Call Tracking → Contact Center**: Marketing-driven calls need routing to specialized sales/support teams.

### Cross-Reference

For decision frameworks, architectural patterns, and implementation guidance, see `.claude/skills/voice.md`.

---

## Operational Reference

Cross-cutting tuning and optimization notes organized by product. These are quality/performance considerations, not silent-failure gotchas (those are inline per use case above).

### AMD Tuning

- **Destination type matters**: Residential numbers typically have shorter greetings (~3s); business lines have longer greetings (~8-10s). Adjust `MachineDetectionTimeout` accordingly — lower values for residential campaigns, higher for B2B.
- **Async vs sync**: `AsyncAmd=true` delivers the AMD result via `AsyncAmdStatusCallback` and lets TwiML execute immediately. Synchronous mode blocks TwiML until detection completes (~4s). Always use async for outbound campaigns.
- **`MachineDetectionSpeechThreshold`**: Duration of initial speech (ms) before classifying as human. Default 2400ms. Lower values detect humans faster but increase false machine classifications.
- **`MachineDetectionSpeechEndThreshold`**: Silence duration (ms) to mark end of machine greeting. Default 1200ms. Affects when `DetectMessageEnd` fires for voicemail drops.

### Conference

- **`waitUrl` doesn't auto-loop**: If you use a custom `waitUrl`, the hold music plays once and stops. Use `<Play loop="0">` in the wait TwiML to loop indefinitely. Or use `waitUrl=""` for silence.
- **Participant data disappears after call ends**: Conference participant metadata is transient. Use Voice Insights for historical conference data. If you need persistent participant state, store it in Sync during the call.
- **Conference name uniqueness**: Conference names are scoped to the account. Use unique, descriptive names (e.g., `call-{callSid}-{timestamp}`) to avoid collisions. Reusing a conference name while a previous conference with that name is still active merges the calls.

### `<Stream>`

- **Audio format**: mulaw encoding, 8kHz sample rate, base64-encoded. No format negotiation — your WebSocket server must handle this format.
- **Regional availability**: Media Streams are available in US1, IE1, and AU1 regions. Ensure your Twilio account region and WebSocket server are co-located for low latency.
- **Unidirectional tracks**: `<Start><Stream>` supports up to 4 simultaneous tracks (inbound, outbound, or both) per call. Bidirectional streams via `<Connect><Stream>` are limited to 1 per call.

### ConversationRelay

- **STT provider selection**: Google is the default and works best in clean audio environments. Deepgram may perform better in noisy environments or with heavy accents. Specify via the `speechModel` attribute.
- **Reconnection pattern**: ConversationRelay WebSocket disconnection ends the call. Implement an `action` URL on the `<Connect>` verb to catch disconnections and either reconnect or gracefully end the call.
- **`intelligenceService` attribute**: Pass the Conversational Intelligence Service SID directly in the `<ConversationRelay>` TwiML to enable automatic post-call analysis without separate API calls.
- **TTS with ElevenLabs**: ElevenLabs is a supported TTS provider. When using it, be aware that text normalization (numbers, abbreviations) may differ from Google. Test with your specific content.

### Event Streams

- **Voice event types and delays**: 7 voice event types are available. Gateway events (call initiated, ringing) arrive ~90s after occurrence. Complete call summary events can take ~30 minutes.
- **At-least-once delivery**: Events may be delivered more than once. Idempotent processing is required — use the event `sid` for deduplication.
- **Sink types**: Three options — Webhook (HTTP POST), Kinesis (AWS stream), Segment (customer data platform write key). Choose based on your analytics infrastructure.
- **Analytics, not real-time state**: Event Streams provides analytics events for dashboards and reporting. Do not use them for real-time call state management — use StatusCallbacks for that.

### Conversational Intelligence

- **PII audio redaction**: Audio-level PII redaction (bleeping out sensitive audio) is only available for `en-US`. Text-level PII redaction works for all supported languages.
- **Dual-channel recording**: Recommended for speaker diarization. Single-channel recordings require the system to guess who is speaking, which reduces accuracy.
- **Product name**: The product was renamed from "Voice Intelligence" to "Conversational Intelligence." API paths still use `intelligence/v2`. Documentation may reference either name.

### Recording

- **Method comparison**:
  - **Calls API `Record` param**: Records entire call from start. Simplest option. Set `Record=record-from-answer` on call creation.
  - **`<Start><Record>`**: Start/stop recording mid-call via TwiML. Use when you only want to record specific segments.
  - **`<Dial record>`**: Records the `<Dial>` leg only. Captures the two-party conversation after connection.
  - **Conference `record`**: Records the conference mix. Use `recordingStatusCallback` to get the Recording SID when complete.
- **Choose based on control needed**: Full-call recording for compliance, segment recording for targeted capture, conference recording for multi-party calls.

### SHAKEN/STIR

- **Three attestation levels**: A (full — you own the number and chose the caller), B (partial — you originated the call but didn't assign the number), C (gateway — you're just passing the call through). Only A attestation produces the green checkmark on mobile.
- **PASSporT timestamp**: The cryptographic token has a 1-minute validity window. Clock skew between your systems and Twilio can cause attestation failures.
- **E.164 formatting required**: Phone numbers in SHAKEN/STIR must be in E.164 format (`+1XXXXXXXXXX`). Non-E.164 numbers cannot receive attestation.

---

## Legend

- `(†)` — Borderline item: appeared potentially highlighted in the source material but was difficult to confirm visually. Verify relevance with the user before recommending.
