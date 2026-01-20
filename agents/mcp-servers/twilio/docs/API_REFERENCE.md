# Twilio API Reference for MCP Server

This document catalogs the active Twilio APIs available for MCP tool implementation. It excludes deprecated, EOL, preview, and legacy APIs.

**Excluded APIs** (EOL/deprecated/preview):
- Assistants, Autopilot, Chat, Conversations, Flex, Frontline, Fax, IP-Messaging, Microvisor, Preview, Supersim, Wireless, Marketplace, Connect Apps

**Version Policy**: When v1 and v2 exist, use v2.

---

## API Categories

| Category | APIs | MCP Status |
|----------|------|------------|
| **Core Messaging** | api:v2010 (messages), messaging:v1, content:v1 | ✅ Partial |
| **Core Voice** | api:v2010 (calls), voice:v1, trunking:v1 | ✅ Partial |
| **Phone Numbers** | api:v2010 (numbers), numbers:v2, routes:v2 | ✅ Partial |
| **Identity & Verification** | verify:v2, lookups:v2, trusthub:v1 | ✅ Partial |
| **Real-time Sync** | sync:v1 | ✅ Implemented |
| **Routing & Workflows** | taskrouter:v1, studio:v2, proxy:v1 | ✅ Partial |
| **Media & Intelligence** | media:v1, intelligence:v2, knowledge:v1 | ❌ Not started |
| **Video** | video:v1 | ❌ Not started |
| **Notifications** | notify:v1 | ❌ Not started |
| **Serverless** | serverless:v1 | ❌ Not started |
| **Account & IAM** | accounts:v1, iam:v1, oauth:v1 | ❌ Not started |
| **Monitoring** | monitor:v1, events:v1, bulkexports:v1, pricing:v2 | ✅ Partial |

---

## Core Messaging APIs

### api:v2010 - Messages

**What it does**: Send and receive SMS/MMS messages via Twilio phone numbers.

**Key endpoints**:
- `POST /Messages` - Send outbound SMS/MMS
- `GET /Messages` - List message history
- `GET /Messages/{Sid}` - Get message details
- `GET /Messages/{Sid}/Media` - Get MMS media

**Dependencies**:
- Requires: Twilio phone number or Messaging Service SID
- Optional: Content Templates (content:v1) for structured messages

**Depends on this**:
- Studio flows can trigger messages
- TaskRouter can send messages via workers

**When to use**:
- Direct SMS/MMS sending with simple use cases
- One-off messages or low volume
- When you need full control over from/to numbers

**When NOT to use**:
- High-volume messaging (use Messaging Services instead)
- A2P 10DLC compliance required (use messaging:v1)
- Need sender pools or geographic routing

**MCP Tools**: `send_sms`, `send_mms`, `get_message_logs`, `get_message_status`

---

### messaging:v1 - Messaging Services

**What it does**: Manage sender pools, A2P compliance, and high-volume messaging configuration.

**Key endpoints**:
- `POST /Services` - Create messaging service
- `GET /Services/{Sid}/PhoneNumbers` - List numbers in pool
- `POST /Services/{Sid}/PhoneNumbers` - Add number to pool
- `GET /Services/{Sid}/UsAppToPersonUsecases` - A2P registration

**Dependencies**:
- Requires: Phone numbers (api:v2010) to add to pools
- Optional: TrustHub (trusthub:v1) for A2P brand registration

**Depends on this**:
- Messages sent via Service SID use this configuration
- Studio flows can reference Messaging Services

**When to use**:
- A2P 10DLC compliance (US carrier requirement)
- Multiple sender numbers for load balancing
- Geographic routing (sticky sender)
- High-volume messaging applications

**When NOT to use**:
- Simple one-off messages
- P2P messaging scenarios
- Testing/prototyping (overhead not worth it)

**MCP Tools**: `create_messaging_service`, `add_number_to_service`, `get_a2p_status` (planned)

---

### content:v1 - Content Templates

**What it does**: Create reusable, structured message templates for WhatsApp, SMS, and other channels.

**Key endpoints**:
- `POST /Content` - Create content template
- `GET /Content` - List templates
- `POST /ContentAndApprovals` - Create and submit for approval

**Dependencies**:
- Works with: Messaging Services, WhatsApp Business API
- Required for: WhatsApp template messages

**Depends on this**:
- Messages can reference Content SID for template-based sending

**When to use**:
- WhatsApp Business messaging (templates required)
- Consistent branded messaging across channels
- Pre-approved message formats for compliance

**When NOT to use**:
- Simple ad-hoc SMS
- Dynamic content that varies per recipient
- Non-WhatsApp prototyping

**MCP Tools**: `create_content_template`, `list_content_templates` (planned)

---

## Core Voice APIs

### api:v2010 - Calls

**What it does**: Make and manage voice calls via Twilio phone numbers.

**Key endpoints**:
- `POST /Calls` - Initiate outbound call
- `GET /Calls` - List call history
- `GET /Calls/{Sid}` - Get call details
- `POST /Calls/{Sid}` - Modify in-progress call
- `GET /Calls/{Sid}/Recordings` - Get call recordings

**Dependencies**:
- Requires: Twilio phone number or verified caller ID
- Optional: TwiML Bins or webhooks for call flow
- Optional: Recordings storage

**Depends on this**:
- TaskRouter assignments can trigger calls
- Studio flows initiate calls

**When to use**:
- Outbound dialing campaigns
- Call status monitoring
- Recording retrieval
- Programmatic call control

**When NOT to use**:
- Inbound call handling (use TwiML webhooks)
- Complex IVR flows (use Studio)
- SIP integration (use trunking:v1)

**MCP Tools**: `make_call`, `get_call_logs`, `get_recording`

---

### voice:v1 - Voice Configuration

**What it does**: Configure advanced voice features: BYOC trunks, dialing permissions, voice insights.

**Key endpoints**:
- `GET /DialingPermissions/Countries` - List allowed destinations
- `POST /ByocTrunks` - Create BYOC trunk
- `GET /ConnectionPolicies` - Manage connection policies

**Dependencies**:
- Works with: api:v2010 calls for outbound dialing
- Requires: SIP infrastructure for BYOC

**When to use**:
- Bring Your Own Carrier (BYOC) scenarios
- Geographic dialing restrictions
- Voice quality insights analysis

**When NOT to use**:
- Standard Twilio phone number calling
- Simple voice applications

**MCP Tools**: `get_dialing_permissions`, `configure_byoc` (planned)

---

### trunking:v1 - Elastic SIP Trunking

**What it does**: Connect your SIP infrastructure to Twilio's network.

**Key endpoints**:
- `POST /Trunks` - Create SIP trunk
- `POST /Trunks/{Sid}/OriginationUrls` - Add origination URI
- `POST /Trunks/{Sid}/PhoneNumbers` - Associate phone number

**Dependencies**:
- Requires: SIP infrastructure (PBX, SBC)
- Works with: Phone numbers (api:v2010)

**When to use**:
- Connecting existing PBX systems
- SIP-based contact centers
- Hybrid cloud/on-prem voice

**When NOT to use**:
- Purely cloud-based applications
- No existing SIP infrastructure
- Simple voice apps (use TwiML)

**MCP Tools**: `create_sip_trunk`, `configure_origination` (planned)

---

## Phone Number APIs

### api:v2010 - IncomingPhoneNumbers

**What it does**: Purchase, configure, and manage Twilio phone numbers.

**Key endpoints**:
- `GET /IncomingPhoneNumbers` - List owned numbers
- `POST /IncomingPhoneNumbers` - Purchase number
- `PUT /IncomingPhoneNumbers/{Sid}` - Configure webhooks
- `GET /AvailablePhoneNumbers/{Country}/Local` - Search available

**Dependencies**:
- Works with: Messaging Services, Voice webhooks, Verify
- Optional: TrustHub for regulatory compliance

**When to use**:
- Phone number inventory management
- Webhook configuration
- Number search and purchase

**When NOT to use**:
- Regulatory bundle management (use numbers:v2)
- Hosted number porting (use numbers:v2)

**MCP Tools**: `list_phone_numbers`, `configure_webhook`, `search_available_numbers`

---

### numbers:v2 - Regulatory Bundles & Hosted Numbers

**What it does**: Manage regulatory compliance bundles and hosted number orders.

**Key endpoints**:
- `POST /RegulatoryCompliance/Bundles` - Create compliance bundle
- `GET /RegulatoryCompliance/Regulations` - List regulations by country
- `POST /HostedNumberOrders` - Port number to Twilio

**Dependencies**:
- Requires: TrustHub (trusthub:v1) for identity verification
- Works with: api:v2010 for number assignment

**When to use**:
- International number purchases requiring compliance docs
- Number porting (hosted numbers)
- Regulatory documentation management

**When NOT to use**:
- US/CA numbers (simpler purchase flow)
- Temporary/test numbers

**MCP Tools**: `create_regulatory_bundle`, `port_number` (planned)

---

### routes:v2 - Inbound Processing Routes

**What it does**: Configure how inbound calls/messages are routed before reaching webhooks.

**Key endpoints**:
- `POST /PhoneNumbers/{PhoneNumberSid}/InboundCallPrices` - Configure routing
- `GET /Trunks/{TrunkSid}/` - SIP trunk routing

**Dependencies**:
- Works with: Phone numbers, SIP trunks
- Routes to: Webhooks, Studio flows

**When to use**:
- Geographic routing of inbound traffic
- Failover webhook configuration
- Multi-region deployments

**When NOT to use**:
- Single-region applications
- Simple webhook routing (configure on number directly)

**MCP Tools**: (planned)

---

## Identity & Verification APIs

### verify:v2 - Verification Service

**What it does**: Send and verify OTPs via SMS, voice, email, WhatsApp, or TOTP.

**Key endpoints**:
- `POST /Services/{Sid}/Verifications` - Start verification
- `POST /Services/{Sid}/VerificationCheck` - Check code
- `GET /Services/{Sid}/Verifications/{Sid}` - Get status

**Dependencies**:
- Requires: Verify Service (create in console or API)
- Uses: Messaging for SMS delivery, Voice for call delivery

**Depends on this**:
- Authentication flows in applications
- 2FA implementations

**When to use**:
- User phone/email verification
- Two-factor authentication (2FA)
- Passwordless login flows

**When NOT to use**:
- Non-verification SMS (use messaging)
- Push-based authentication (use Authy/TOTP)

**MCP Tools**: `start_verification`, `check_verification`, `get_verification_status`

---

### lookups:v2 - Phone Intelligence

**What it does**: Retrieve phone number information: carrier, type, caller name, fraud signals.

**Key endpoints**:
- `GET /PhoneNumbers/{PhoneNumber}` - Lookup with optional packages
- Packages: `carrier`, `caller_name`, `line_type_intelligence`, `sim_swap`, `sms_pumping_risk`

**Dependencies**:
- None (standalone lookup service)

**When to use**:
- Phone number validation before sending
- Fraud prevention (sim swap, sms pumping)
- Line type detection (mobile vs landline)
- Carrier identification

**When NOT to use**:
- Already verified numbers
- High-volume lookups without caching (expensive)

**MCP Tools**: `lookup_phone_number`, `check_fraud_risk` (planned)

---

### trusthub:v1 - Trust & Compliance

**What it does**: Manage business identity verification for A2P, SHAKEN/STIR, and international compliance.

**Key endpoints**:
- `POST /CustomerProfiles` - Create business profile
- `POST /TrustProducts` - Create trust product (A2P brand)
- `GET /Policies` - List compliance policies

**Dependencies**:
- Required by: A2P 10DLC registration, international numbers
- Feeds into: Messaging Services, Numbers

**When to use**:
- A2P 10DLC brand registration (US requirement)
- SHAKEN/STIR attestation
- International regulatory compliance

**When NOT to use**:
- P2P messaging
- Development/testing environments

**MCP Tools**: `create_business_profile`, `register_a2p_brand` (planned)

---

## Real-time Sync API

### sync:v1 - Sync Service

**What it does**: Real-time state synchronization across devices and webhooks.

**Key resources**:
- **Documents**: Single JSON objects, observable
- **Lists**: Ordered collections with push/pop
- **Maps**: Key-value stores with per-item TTL
- **Streams**: Pub/sub message streaming

**Key endpoints**:
- `POST /Services/{Sid}/Documents` - Create document
- `PUT /Services/{Sid}/Documents/{Sid}` - Update document
- `GET /Services/{Sid}/Documents/{Sid}` - Get document
- (Similar for Lists, Maps, Streams)

**Dependencies**:
- Requires: Sync Service (create in console or API)
- Works with: Serverless functions, client SDKs

**When to use**:
- Webhook state persistence across invocations
- Real-time UI updates
- Cross-device synchronization
- Ephemeral data with TTL

**When NOT to use**:
- Large data storage (use external DB)
- Relational data (no joins/queries)
- Long-term persistence (use database)

**MCP Tools**: `create_document`, `update_document`, `get_document`, `list_documents`

---

## Routing & Workflow APIs

### taskrouter:v1 - Skills-Based Routing

**What it does**: Route tasks to workers based on skills, availability, and priority.

**Key resources**:
- **Workspaces**: Container for routing configuration
- **Workers**: Agents who receive tasks
- **TaskQueues**: Where tasks wait for workers
- **Workflows**: Routing rules and filters
- **Tasks**: Work items to be processed

**Key endpoints**:
- `POST /Workspaces/{Sid}/Tasks` - Create task
- `GET /Workspaces/{Sid}/Workers` - List workers
- `PUT /Workspaces/{Sid}/Tasks/{Sid}` - Update task

**Dependencies**:
- Works with: Voice (call assignments), Messaging (chat routing)
- Optional: Studio flows for complex routing logic

**When to use**:
- Contact center routing
- Multi-channel support queues
- Skills-based task assignment
- Worker availability management

**When NOT to use**:
- Simple round-robin routing
- Single-agent scenarios
- Non-real-time task queues

**MCP Tools**: `create_task`, `list_tasks`, `get_task_status`, `list_workers`, `list_workflows`

---

### studio:v2 - Flow Builder

**What it does**: Visual workflow builder for voice and messaging applications.

**Key endpoints**:
- `GET /Flows` - List flows
- `GET /Flows/{Sid}/Executions` - List flow executions
- `POST /Flows/{Sid}/Executions` - Trigger flow execution
- `GET /Flows/{Sid}/Executions/{Sid}` - Get execution details

**Dependencies**:
- Triggers: Inbound calls/messages, REST API, TaskRouter
- Uses: All Twilio products (messaging, voice, functions, etc.)

**When to use**:
- Complex IVR flows
- Multi-step messaging workflows
- Visual debugging of call flows
- Non-developer flow creation

**When NOT to use**:
- Simple single-action responses (use TwiML)
- High-performance real-time (<100ms requirement)
- Agent-built flows (code is more flexible)

**MCP Tools**: `list_studio_flows`, `trigger_flow`, `get_execution_status` (planned)

---

### proxy:v1 - Number Masking

**What it does**: Anonymous voice/SMS communication between parties without revealing real numbers.

**Key endpoints**:
- `POST /Services` - Create proxy service
- `POST /Services/{Sid}/Sessions` - Create masked session
- `POST /Services/{Sid}/Sessions/{Sid}/Participants` - Add participant

**Dependencies**:
- Requires: Phone number pool for masking
- Works with: Voice and Messaging

**When to use**:
- Marketplace buyer/seller communication
- Ride-share driver/rider calls
- Privacy-preserving contact flows

**When NOT to use**:
- Direct business-to-customer communication
- Long-term relationships (sessions expire)

**MCP Tools**: `create_proxy_session`, `add_participant` (planned)

---

## Media & Intelligence APIs

### media:v1 - Media Processing

**What it does**: Process, store, and transform media files.

**Key endpoints**:
- `POST /MediaProcessors` - Create media processor
- `POST /MediaRecordings` - Create media recording
- `GET /PlayerStreamers` - List streamers

**Dependencies**:
- Works with: Video rooms, Voice recordings
- Outputs to: External storage, CDNs

**When to use**:
- Recording composition and mixing
- Media transformation pipelines
- Streaming media processing

**When NOT to use**:
- Simple recording retrieval (use api:v2010)
- Static media hosting (use Assets)

**MCP Tools**: (planned)

---

### intelligence:v2 - Conversation Intelligence

**What it does**: AI-powered analysis of voice and text conversations.

**Key endpoints**:
- `POST /Transcripts` - Create transcript
- `GET /Transcripts/{Sid}/Sentences` - Get sentences
- `POST /Services` - Create intelligence service

**Dependencies**:
- Requires: Audio/text source (recordings, transcripts)
- Works with: Voice recordings, Conversations

**When to use**:
- Call transcription
- Sentiment analysis
- Conversation summarization
- Compliance monitoring

**When NOT to use**:
- Real-time transcription (use Speech Recognition)
- Simple keyword search

**MCP Tools**: `transcribe_recording`, `analyze_sentiment` (planned)

---

### knowledge:v1 - Knowledge Bases

**What it does**: Create and query knowledge bases for AI assistants.

**Key endpoints**:
- `POST /KnowledgeSources` - Create knowledge source
- `POST /KnowledgeSources/{Sid}/Documents` - Add document
- `POST /Query` - Query knowledge base

**Dependencies**:
- Works with: AI Assistant builders, custom LLM integrations

**When to use**:
- RAG (Retrieval Augmented Generation) for voice AI
- FAQ systems
- Document-based AI assistants

**When NOT to use**:
- Static FAQ (simpler solutions exist)
- Real-time data (use APIs directly)

**MCP Tools**: `create_knowledge_base`, `query_knowledge` (planned)

---

## Video API

### video:v1 - Programmable Video

**What it does**: Create and manage video rooms for real-time video communication.

**Key endpoints**:
- `POST /Rooms` - Create video room
- `GET /Rooms` - List rooms
- `GET /Rooms/{Sid}/Participants` - List participants
- `GET /Rooms/{Sid}/Recordings` - Get room recordings

**Dependencies**:
- Requires: Access Token generation for clients
- Works with: Media composition for recordings

**When to use**:
- Video conferencing applications
- Telehealth video visits
- Video support sessions

**When NOT to use**:
- Audio-only calls (use Voice)
- Broadcasting to many (use streaming solutions)

**MCP Tools**: `create_video_room`, `list_room_participants` (planned)

---

## Notification API

### notify:v1 - Push Notifications

**What it does**: Send push notifications to mobile devices via APNs and FCM.

**Key endpoints**:
- `POST /Services` - Create notify service
- `POST /Services/{Sid}/Bindings` - Register device
- `POST /Services/{Sid}/Notifications` - Send notification

**Dependencies**:
- Requires: APNs/FCM credentials
- Works with: Mobile app integration

**When to use**:
- Mobile app push notifications
- Cross-platform notification delivery
- Device binding management

**When NOT to use**:
- SMS notifications (use Messaging)
- Email notifications (use SendGrid)

**MCP Tools**: `send_push_notification`, `register_device` (planned)

---

## Serverless API

### serverless:v1 - Functions & Assets

**What it does**: Manage Twilio Functions, Assets, and serverless deployments.

**Key endpoints**:
- `GET /Services` - List services
- `GET /Services/{Sid}/Environments` - List environments
- `GET /Services/{Sid}/Functions` - List functions
- `POST /Services/{Sid}/Builds` - Create deployment build

**Dependencies**:
- Hosts: Voice/Messaging webhooks
- Works with: All Twilio APIs via helper library

**When to use**:
- Deploying Twilio-hosted functions
- Managing deployment environments
- Asset management

**When NOT to use**:
- Local development (use CLI directly)
- Non-Twilio serverless (use external providers)

**MCP Tools**: `list_services`, `list_functions`, `create_build` (planned)

---

## Account & IAM APIs

### accounts:v1 - Account Management

**What it does**: Manage Twilio accounts and subaccounts.

**Key endpoints**:
- `GET /Accounts` - List accounts
- `POST /Accounts` - Create subaccount
- `GET /Accounts/{Sid}` - Get account details
- `GET /Accounts/{Sid}/Credentials` - List credentials

**When to use**:
- Multi-tenant applications with subaccounts
- Account isolation for clients
- Credential management

**When NOT to use**:
- Single-account applications
- Development environments

**MCP Tools**: `list_accounts`, `create_subaccount` (planned)

---

### iam:v1 - Identity & Access Management

**What it does**: Manage API keys, roles, and permissions.

**Key endpoints**:
- `POST /Keys` - Create API key
- `GET /Keys` - List API keys
- `GET /Roles` - List roles

**When to use**:
- API key rotation
- Fine-grained access control
- Service account management

**When NOT to use**:
- Simple applications (use account credentials)

**MCP Tools**: `create_api_key`, `list_api_keys` (planned)

---

### oauth:v1 - OAuth Tokens

**What it does**: OAuth token management for Twilio integrations.

**Key endpoints**:
- `POST /Token` - Generate OAuth token
- `GET /UserInfo` - Get user info

**When to use**:
- OAuth-based integrations
- Token refresh flows

**When NOT to use**:
- Standard API key authentication

**MCP Tools**: (planned)

---

## Monitoring APIs

### monitor:v1 - Alerts & Events

**What it does**: Access debugger alerts and monitor API events.

**Key endpoints**:
- `GET /Alerts` - List debugger alerts
- `GET /Alerts/{Sid}` - Get alert details
- `GET /Events` - List API events

**Dependencies**:
- Monitors: All Twilio API activity
- Feeds: Dashboards, alerting systems

**When to use**:
- Error debugging and analysis
- API activity auditing
- Proactive monitoring

**When NOT to use**:
- Real-time alerting (use webhooks)

**MCP Tools**: `get_debugger_logs`, `analyze_errors`

---

### events:v1 - Event Streams

**What it does**: Configure event sinks for streaming Twilio events.

**Key endpoints**:
- `POST /Sinks` - Create event sink
- `POST /Subscriptions` - Subscribe to event types
- `GET /Types` - List available event types

**When to use**:
- Real-time event streaming to external systems
- Analytics pipelines
- Event-driven architectures

**When NOT to use**:
- Polling for events (use webhooks)
- Simple debugging (use monitor:v1)

**MCP Tools**: `create_event_sink`, `list_event_types` (planned)

---

### bulkexports:v1 - Data Export

**What it does**: Export large datasets from Twilio.

**Key endpoints**:
- `POST /Exports/{ResourceType}` - Create export job
- `GET /Exports/{ResourceType}/Jobs` - List export jobs
- `GET /Exports/{ResourceType}/Days/{Day}` - Get daily export

**When to use**:
- Historical data analysis
- Compliance data retention
- Large-scale reporting

**When NOT to use**:
- Real-time data access
- Small data queries (use REST APIs)

**MCP Tools**: `create_export_job`, `get_export_status` (planned)

---

### pricing:v2 - Pricing Information

**What it does**: Retrieve pricing for Twilio products by country.

**Key endpoints**:
- `GET /Voice/Countries` - Voice pricing by country
- `GET /Messaging/Countries` - SMS pricing by country
- `GET /PhoneNumbers/Countries` - Number pricing by country

**When to use**:
- Cost estimation before operations
- Building pricing calculators
- Regional cost optimization

**When NOT to use**:
- Actual billing data (use usage records)

**MCP Tools**: `get_voice_pricing`, `get_sms_pricing` (planned)

---

## Tool Organization Plan

Based on this reference, the MCP server tools should be organized into these modules:

```
src/tools/
├── messaging/
│   ├── core.ts           # api:v2010 messages (send_sms, send_mms, get_logs)
│   ├── services.ts       # messaging:v1 (messaging services, A2P)
│   └── content.ts        # content:v1 (templates)
├── voice/
│   ├── core.ts           # api:v2010 calls (make_call, get_logs, recordings)
│   ├── configuration.ts  # voice:v1 (BYOC, dialing permissions)
│   └── trunking.ts       # trunking:v1 (SIP trunks)
├── phone-numbers/
│   ├── core.ts           # api:v2010 numbers (list, configure, search)
│   ├── regulatory.ts     # numbers:v2 (bundles, porting)
│   └── routes.ts         # routes:v2 (inbound routing)
├── identity/
│   ├── verify.ts         # verify:v2 (OTP verification)
│   ├── lookups.ts        # lookups:v2 (phone intelligence)
│   └── trusthub.ts       # trusthub:v1 (compliance)
├── sync.ts               # sync:v1 (documents, lists, maps)
├── routing/
│   ├── taskrouter.ts     # taskrouter:v1 (skills-based routing)
│   ├── studio.ts         # studio:v2 (flow builder)
│   └── proxy.ts          # proxy:v1 (number masking)
├── intelligence/
│   ├── media.ts          # media:v1 (processing)
│   ├── conversation.ts   # intelligence:v2 (AI analysis)
│   └── knowledge.ts      # knowledge:v1 (RAG)
├── video.ts              # video:v1 (rooms)
├── notify.ts             # notify:v1 (push notifications)
├── serverless.ts         # serverless:v1 (functions/assets)
├── account/
│   ├── accounts.ts       # accounts:v1 (subaccounts)
│   ├── iam.ts            # iam:v1 (API keys)
│   └── oauth.ts          # oauth:v1 (tokens)
└── monitoring/
    ├── debugger.ts       # monitor:v1 (alerts, errors)
    ├── events.ts         # events:v1 (streaming)
    ├── exports.ts        # bulkexports:v1 (data export)
    └── pricing.ts        # pricing:v2 (cost info)
```

---

## Priority Implementation Order

1. **P0 - Core (Most Used)**
   - messaging/core.ts ✅
   - voice/core.ts ✅
   - phone-numbers/core.ts ✅
   - identity/verify.ts ✅
   - sync.ts ✅
   - routing/taskrouter.ts ✅
   - monitoring/debugger.ts ✅

2. **P1 - High Value**
   - identity/lookups.ts
   - routing/studio.ts
   - messaging/services.ts
   - serverless.ts

3. **P2 - Specialized**
   - intelligence/conversation.ts
   - video.ts
   - routing/proxy.ts
   - identity/trusthub.ts

4. **P3 - Edge Cases**
   - voice/trunking.ts
   - account/accounts.ts
   - monitoring/events.ts
   - intelligence/knowledge.ts
