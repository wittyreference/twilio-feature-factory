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
    ├── messaging.ts      # SMS/MMS operations
    ├── voice.ts          # Call logs and recordings
    ├── phone-numbers.ts  # Phone number management
    ├── verify.ts         # Verification API
    ├── sync.ts           # Real-time state sync
    ├── taskrouter.ts     # Task routing
    └── debugger.ts       # Error logs and analysis
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

## Testing

Tests use Twilio magic numbers where applicable:
- `+15005550006` - Valid test number for SMS
- `+15005550001` - Invalid number (triggers error)

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

See [docs/TOOL_BOUNDARIES.md](docs/TOOL_BOUNDARIES.md) for architectural guidance on:

- **When to use MCP vs CLI vs Functions** - Decision flowchart
- **Operation risk tiers** - What agents can do autonomously vs. with approval
- **Golden rules** - MCP = data ops, CLI = infra ops, Functions = webhooks
- **Anti-patterns to avoid** - Common mistakes and why they're wrong

**Key principle**: MCP is a pure API wrapper. It never invokes CLI commands, never deploys, and never makes infrastructure changes.
