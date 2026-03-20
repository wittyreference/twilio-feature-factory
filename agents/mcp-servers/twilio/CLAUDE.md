// ABOUTME: Twilio MCP server that exposes 353 tools for Claude agents.
// ABOUTME: Provides standardized access to all Twilio APIs via Model Context Protocol.

# Twilio MCP Server

This directory contains the Model Context Protocol (MCP) server that exposes Twilio API operations as custom tools for Claude agents.

**For complete tool inventory and API reference, see [REFERENCE.md](./REFERENCE.md).**

## Purpose

The Twilio MCP Server enables Claude agents to interact with real Twilio infrastructure through standardized tools.

## Supported Domains (353 tools across 28 modules)

- **Messaging**: 4 tools for SMS/MMS operations
- **Voice**: 32 tools for calls, conferences, recordings, insights, transcription, queues
- **Phone Numbers**: 5 tools for search, purchase, release, configure, and list
- **Verify**: 3 tools for phone verification
- **Payments**: 3 tools for PCI-compliant capture
- **Sync**: 18 tools for Documents, Lists, Maps
- **TaskRouter**: 30 tools for task-based routing
- **Debugger**: 3 tools for error logs and analysis
- **Lookups**: 2 tools (P1) for phone intelligence
- **Studio**: 9 tools (P1) for Flow Builder
- **Messaging Services**: 14 tools (P1) for sender pools and A2P
- **Serverless**: 15 tools (P1) for Functions management
- **Intelligence**: 9 tools (P2) for transcripts and analysis
- **Video**: 10 tools (P2) for rooms and participants
- **Proxy**: 17 tools (P2) for number masking
- **TrustHub**: 17 tools (P2) for compliance and business identity
- **Content**: 4 tools (P2) for message templates
- **Voice Config**: 14 tools (P2) for BYOC and dialing permissions
- **Regulatory**: 16 tools (P2) for bundles and compliance
- **Media**: 10 tools (P2) for video recordings and compositions
- **SIP**: 40 tools (P3) for IP ACLs, credentials, SIP Domains, Domain Auth (calls + registrations)
- **Trunking**: 20 tools (P3) for Elastic SIP Trunks
- **Accounts**: 13 tools (P3) for subaccounts and usage
- **IAM**: 8 tools (P3) for API keys
- **Pricing**: 7 tools (P3) for pricing lookups
- **Notify**: 10 tools (P3) for push notifications
- **Addresses**: 6 tools (P3) for address management
- **Validation**: 15 tools for deep validation beyond HTTP 200

## Architecture

```
src/
├── index.ts              # Main MCP server entry point
└── tools/
    ├── messaging.ts      # SMS/MMS operations (P0)
    ├── voice.ts          # Calls, conferences, insights (P0)
    ├── phone-numbers.ts  # Phone number management (P0)
    ├── verify.ts         # Verification API (P0)
    ├── payments.ts       # PCI-compliant payments (P0)
    ├── sync.ts           # Real-time state sync (P0)
    ├── taskrouter.ts     # Task routing (P0)
    ├── debugger.ts       # Error logs (P0)
    ├── lookups.ts        # Phone intelligence (P1)
    ├── studio.ts         # Flow builder (P1)
    ├── messaging-services.ts  # Sender pools (P1)
    ├── serverless.ts     # Functions (P1)
    ├── intelligence.ts   # Transcripts (P2)
    ├── video.ts          # Video rooms (P2)
    ├── proxy.ts          # Number masking (P2)
    ├── trusthub.ts       # Compliance (P2)
    ├── content.ts        # Templates (P2)
    ├── voice-config.ts   # BYOC/dialing (P2)
    ├── regulatory.ts     # Bundles (P2)
    ├── media.ts          # Compositions (P2)
    ├── sip.ts            # IP ACLs, credentials (P3)
    ├── trunking.ts       # SIP trunks (P3)
    ├── accounts.ts       # Subaccounts (P3)
    ├── iam.ts            # API keys (P3)
    ├── pricing.ts        # Pricing (P3)
    ├── notify.ts         # Push notifications (P3)
    ├── addresses.ts      # Addresses (P3)
    ├── validation.ts     # Deep validation wrappers
    └── environment.ts    # Environment validation
```

## Tool Naming Convention

Tools use flat action names: `send_sms`, `make_call`, `create_document`, `validate_call`.

At runtime in Claude Code, the MCP framework adds a namespace prefix: `mcp__twilio__<tool_name>` (e.g., `mcp__twilio__send_sms`). Tool source code and documentation use the short form.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | One of auth | Auth Token (US1) |
| `TWILIO_API_KEY` | One of auth | API Key SID (SK...) — preferred |
| `TWILIO_API_SECRET` | One of auth | API Key Secret |
| `TWILIO_REGION` | Optional | Regional endpoint (au1, ie1, etc.) |
| `TWILIO_EDGE` | Optional | Edge location (sydney, dublin, etc.) |
| `TWILIO_PHONE_NUMBER` | For calls/SMS | Default "from" number (E.164). Server starts without it; tools that send messages or make calls require it at invocation. |
| `TWILIO_VERIFY_SERVICE_SID` | For verify | Verify Service SID |
| `TWILIO_SYNC_SERVICE_SID` | For sync | Sync Service SID |
| `TWILIO_TASKROUTER_WORKSPACE_SID` | For taskrouter | Workspace SID |
| `TWILIO_MESSAGING_SERVICE_SID` | For messaging | Messaging Service SID |
| `TEST_PHONE_NUMBER` | For tests | Recipient number |
| `TWILIO_STATUS_CALLBACK_URL` | Optional | Delivery webhooks |
| `TWILIO_FALLBACK_URL` | Optional | Fallback webhook |

## Tool Tiers

Tools are organized into priority tiers. Default loads P0 + validation (~112 tools).

| Tier | Tools | Domains |
|------|-------|---------|
| P0 | 98 | Messaging, Voice, Phone Numbers, Verify, Payments, Sync, TaskRouter, Debugger |
| P1 | 40 | Lookups, Studio, Messaging Services, Serverless |
| P2 | 97 | Intelligence, Video, Proxy, TrustHub, Content, Voice Config, Regulatory, Media |
| P3 | 104 | SIP, Trunking, Accounts, IAM, Pricing, Notify, Addresses |
| validation | 15 | Deep validation beyond HTTP 200 |

Configure via `toolTiers` in `TwilioMcpServerConfig`:
- Default: `['P0', 'validation']` — 112 tools
- All tools: `['all']` — 353 tools
- Custom: `['P0', 'P1', 'validation']` — 150 tools

## Quick Usage

```typescript
import { createTwilioMcpServer } from '@twilio-feature-factory/mcp-twilio';
import { query } from '@anthropic-ai/claude-agent-sdk';

// Default: P0 + validation (112 tools)
const twilioServer = createTwilioMcpServer();

// Or load all tiers (353 tools)
const fullServer = createTwilioMcpServer({ toolTiers: ['all'] });

for await (const message of query({
  prompt: "Send an SMS to +15551234567 saying 'Hello from Claude!'",
  options: {
    mcpServers: { twilio: twilioServer },
    allowedTools: ['mcp__twilio__send_sms']
  }
})) {
  // Agent sends the SMS
}
```

## Security

- Never expose credentials in tool responses
- Validate all phone numbers are E.164 format
- Rate limit tool calls to avoid API throttling
- Audit all operations through agent logging

## Tool Boundaries

See [/.claude/references/tool-boundaries.md](/.claude/references/tool-boundaries.md) for when to use MCP vs CLI vs Functions.

**Key principle**: MCP is a pure API wrapper. It never invokes CLI commands, never deploys, and never makes infrastructure changes.
