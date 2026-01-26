# Twilio MCP Server

This directory contains the Model Context Protocol (MCP) server that exposes Twilio API operations as custom tools for Claude agents.

## Purpose

The Twilio MCP Server enables Claude agents to interact with real Twilio infrastructure through standardized tools. This allows agents to:

- Send SMS/MMS messages
- Query call logs and analyze patterns
- Configure phone number webhooks
- Manage Sync documents for state synchronization
- Create TaskRouter tasks
- Query Verify service status
- Fetch debugger logs for error analysis

## Architecture

```
src/
├── index.ts              # Main MCP server entry point
└── tools/
    ├── messaging.ts      # SMS/MMS operations (P0)
    ├── voice.ts          # Call logs and recordings (P0)
    ├── phone-numbers.ts  # Phone number management (P0)
    ├── verify.ts         # Verification API (P0)
    ├── sync.ts           # Real-time state sync (P0)
    ├── taskrouter.ts     # Task routing (P0)
    ├── debugger.ts       # Error logs and analysis (P0)
    ├── lookups.ts        # Phone intelligence (P1)
    ├── studio.ts         # Flow builder (P1)
    ├── messaging-services.ts  # Sender pools, A2P (P1)
    ├── serverless.ts     # Functions management (P1)
    ├── intelligence.ts   # Transcripts, conversation analysis (P2)
    ├── video.ts          # Video rooms, participants (P2)
    ├── proxy.ts          # Number masking (P2)
    ├── trusthub.ts       # Business identity, compliance (P2)
    ├── content.ts        # Message templates (P2)
    ├── voice-config.ts   # Dialing permissions, BYOC (P2)
    ├── regulatory.ts     # Regulatory bundles (P2)
    └── media.ts          # Video recordings, compositions (P2)
```

## Tool Naming Convention

All tools follow the pattern: `twilio_<domain>_<action>`

Examples:
- `twilio_messaging_send_sms`
- `twilio_voice_get_call_logs`
- `twilio_sync_create_document`

## Environment Variables

The MCP server requires the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Yes | Default "from" number (E.164) |
| `TWILIO_VERIFY_SERVICE_SID` | For verify tools | Verify Service SID |
| `TWILIO_SYNC_SERVICE_SID` | For sync tools | Sync Service SID |
| `TWILIO_TASKROUTER_WORKSPACE_SID` | For taskrouter | TaskRouter Workspace SID |
| `TWILIO_MESSAGING_SERVICE_SID` | For messaging services | Messaging Service SID |
| `TEST_PHONE_NUMBER` | For integration tests | Recipient number for test messages/calls |
| `TWILIO_STATUS_CALLBACK_URL` | Optional | URL for delivery status webhooks |
| `TWILIO_FALLBACK_URL` | Optional | Fallback URL when primary webhook fails |

## Usage with Claude Agent SDK

```typescript
import { createTwilioMcpServer } from '@twilio-agent-factory/mcp-twilio';
import { query } from '@anthropic-ai/claude-agent-sdk';

const twilioServer = createTwilioMcpServer();

for await (const message of query({
  prompt: "Send an SMS to +15551234567 saying 'Hello from Claude!'",
  options: {
    mcpServers: { twilio: twilioServer },
    allowedTools: ['mcp__twilio__messaging_send_sms']
  }
})) {
  // Agent autonomously sends the SMS
}
```

## Tool Reference

### Messaging Tools

| Tool | Description |
|------|-------------|
| `send_sms` | Send an SMS message |
| `send_mms` | Send an MMS with media |
| `get_message_logs` | Retrieve message history |
| `get_message_status` | Check delivery status |

### Voice Tools

| Tool | Description |
|------|-------------|
| `get_call_logs` | Retrieve call history |
| `make_call` | Initiate an outbound call |
| `get_recording` | Fetch call recording |

### Phone Number Tools

| Tool | Description |
|------|-------------|
| `list_phone_numbers` | List owned phone numbers |
| `configure_webhook` | Set voice/SMS webhook URLs |
| `search_available_numbers` | Search for available numbers |

### Verify Tools

| Tool | Description |
|------|-------------|
| `start_verification` | Send OTP via SMS/call/email |
| `check_verification` | Verify user-provided code |
| `get_verification_status` | Check verification status |

### Sync Tools

| Tool | Description |
|------|-------------|
| `create_document` | Create a Sync document |
| `update_document` | Update document data |
| `get_document` | Retrieve document |
| `list_documents` | List all documents |

### TaskRouter Tools

| Tool | Description |
|------|-------------|
| `create_task` | Create a new task |
| `list_tasks` | List tasks in queue |
| `get_task_status` | Check task status |
| `list_workers` | List available workers |

### Debugger Tools

| Tool | Description |
|------|-------------|
| `get_debugger_logs` | Fetch recent error logs |
| `analyze_errors` | Analyze error patterns |
| `get_usage_records` | Retrieve usage data |

### Lookups Tools (P1)

| Tool | Description |
|------|-------------|
| `lookup_phone_number` | Get carrier, line type, caller name |
| `check_fraud_risk` | Check SIM swap, SMS pumping risk |

### Studio Tools (P1)

| Tool | Description |
|------|-------------|
| `list_studio_flows` | List all Studio flows |
| `trigger_flow` | Trigger flow execution via REST |
| `get_execution_status` | Get execution details and steps |

### Messaging Services Tools (P1)

| Tool | Description |
|------|-------------|
| `create_messaging_service` | Create sender pool service |
| `add_number_to_service` | Add phone number to pool |
| `get_a2p_status` | Get A2P 10DLC registration status |

### Serverless Tools (P1)

| Tool | Description |
|------|-------------|
| `list_services` | List serverless services |
| `list_functions` | List functions in a service |
| `list_environments` | List deployment environments |
| `get_build_status` | Get build deployment status |

### Intelligence Tools (P2)

| Tool | Description |
|------|-------------|
| `list_intelligence_services` | List available Intelligence services |
| `list_transcripts` | List transcripts in account |
| `get_transcript` | Get transcript details |

### Video Tools (P2)

| Tool | Description |
|------|-------------|
| `create_video_room` | Create a video room |
| `list_video_rooms` | List video rooms |
| `list_room_participants` | List participants in a room |

### Proxy Tools (P2)

| Tool | Description |
|------|-------------|
| `create_proxy_service` | Create number masking service |
| `create_proxy_session` | Create masked session |
| `add_proxy_participant` | Add participant to session |
| `list_proxy_sessions` | List sessions in service |

### TrustHub Tools (P2)

| Tool | Description |
|------|-------------|
| `create_customer_profile` | Create customer profile |
| `list_customer_profiles` | List customer profiles |
| `list_trust_products` | List trust products (A2P brands) |
| `list_policies` | List compliance policies |

### Content Tools (P2)

| Tool | Description |
|------|-------------|
| `create_content_template` | Create message template |
| `list_content_templates` | List templates |
| `get_content_template` | Get template details |

### Voice Config Tools (P2)

| Tool | Description |
|------|-------------|
| `get_dialing_permissions` | Get country dialing permissions |
| `list_dialing_permissions_countries` | List countries with permissions |
| `list_byoc_trunks` | List BYOC trunks |
| `create_byoc_trunk` | Create BYOC trunk |

### Regulatory Tools (P2)

| Tool | Description |
|------|-------------|
| `list_regulatory_bundles` | List regulatory bundles |
| `get_bundle_status` | Get bundle status |
| `list_supporting_documents` | List supporting documents |
| `list_regulations` | List available regulations |

### Media Tools (P2)

| Tool | Description |
|------|-------------|
| `list_video_recordings` | List video recordings |
| `get_video_recording` | Get recording details |
| `list_compositions` | List video compositions |

## Testing

**No magic numbers.** Tests use real Twilio numbers for authentic API behavior:
- `TWILIO_PHONE_NUMBER` - FROM number for outbound messages/calls
- `TEST_PHONE_NUMBER` - TO number (recipient) for outbound tests

Magic test numbers (`+15005550xxx`) are explicitly NOT used because they don't reflect real API behavior, error modes, or carrier interactions.

Run tests:
```bash
npm test
npm run test:coverage
```

## Security Considerations

- Never expose credentials in tool responses
- Validate all phone numbers are E.164 format
- Rate limit tool calls to avoid API throttling
- Audit all operations through agent logging

## API Reference

See [docs/API_REFERENCE.md](docs/API_REFERENCE.md) for comprehensive documentation of:

- All active Twilio APIs (excludes EOL/deprecated)
- API dependencies and relationships
- When to use / when NOT to use each API
- Planned tool implementation roadmap

**Excluded APIs** (EOL/deprecated/preview): Assistants, Autopilot, Chat, Conversations, Flex, Frontline, Fax, IP-Messaging, Microvisor, Preview, Supersim, Wireless, Marketplace

**Version Policy**: When v1 and v2 exist, always use v2.

## Tool Boundaries

See [/.claude/references/tool-boundaries.md](/.claude/references/tool-boundaries.md) for architectural guidance on:

- **When to use MCP vs CLI vs Functions** - Decision flowchart
- **Operation risk tiers** - What agents can do autonomously vs. with approval
- **Golden rules** - MCP = data ops, CLI = infra ops, Functions = webhooks
- **Anti-patterns to avoid** - Common mistakes and why they're wrong

**Key principle**: MCP is a pure API wrapper. It never invokes CLI commands, never deploys, and never makes infrastructure changes.
