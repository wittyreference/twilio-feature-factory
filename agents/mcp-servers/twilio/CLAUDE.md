# Twilio MCP Server

This directory contains the Model Context Protocol (MCP) server that exposes Twilio API operations as custom tools for Claude agents.

## Purpose

The Twilio MCP Server enables Claude agents to interact with real Twilio infrastructure through standardized tools. **159 tools across 19 modules** covering:

- **Messaging**: SMS/MMS, messaging services, content templates
- **Voice**: Call logs, recordings, BYOC trunks, dialing permissions
- **Phone Numbers**: Management, regulatory bundles, lookups
- **Identity**: Verification, TrustHub profiles, trust products
- **Routing**: TaskRouter, Studio flows, Proxy number masking
- **Media**: Video rooms, recordings, compositions
- **Serverless**: Functions, builds, environments, variables
- **Monitoring**: Debugger logs, usage records, Voice Intelligence

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

### Studio Tools (P1) - 9 tools

| Tool | Description |
|------|-------------|
| `list_studio_flows` | List all Studio flows |
| `get_flow` | Get flow details |
| `trigger_flow` | Trigger flow execution via REST |
| `list_executions` | List flow executions |
| `get_execution_status` | Get execution details |
| `delete_execution` | Delete an execution |
| `get_execution_context` | Get execution variables/data |
| `list_execution_steps` | List steps in execution |
| `get_step_context` | Get step input/output |

### Messaging Services Tools (P1) - 14 tools

| Tool | Description |
|------|-------------|
| `create_messaging_service` | Create sender pool service |
| `list_messaging_services` | List all messaging services |
| `get_messaging_service` | Get service details |
| `update_messaging_service` | Update service config |
| `delete_messaging_service` | Delete a service |
| `add_number_to_service` | Add phone number to pool |
| `list_phone_numbers_in_service` | List numbers in pool |
| `remove_number_from_service` | Remove number from pool |
| `list_alpha_senders` | List alpha sender IDs |
| `add_alpha_sender` | Add alpha sender ID |
| `remove_alpha_sender` | Remove alpha sender |
| `list_short_codes` | List short codes |
| `add_short_code` | Add short code to service |
| `get_a2p_status` | Get A2P 10DLC registration status |

### Serverless Tools (P1) - 15 tools

| Tool | Description |
|------|-------------|
| `list_services` | List serverless services |
| `get_service` | Get service details |
| `list_functions` | List functions in a service |
| `get_function` | Get function details |
| `list_function_versions` | List function versions |
| `list_environments` | List deployment environments |
| `get_build_status` | Get build deployment status |
| `list_builds` | List all builds |
| `list_assets` | List assets in service |
| `list_asset_versions` | List asset versions |
| `list_variables` | List environment variables |
| `create_variable` | Create environment variable |
| `update_variable` | Update variable value |
| `delete_variable` | Delete a variable |
| `list_logs` | List function execution logs |

### Intelligence Tools (P2) - 8 tools

| Tool | Description |
|------|-------------|
| `list_intelligence_services` | List available Intelligence services |
| `get_intelligence_service` | Get service details |
| `list_transcripts` | List transcripts in account |
| `get_transcript` | Get transcript details |
| `delete_transcript` | Delete a transcript |
| `list_sentences` | List sentences in transcript |
| `list_operator_results` | List operator analysis results |
| `get_transcript_media` | Get transcript media URL |

### Video Tools (P2) - 10 tools

| Tool | Description |
|------|-------------|
| `create_video_room` | Create a video room |
| `list_video_rooms` | List video rooms |
| `get_room` | Get room details |
| `update_room` | Update room (end with status=completed) |
| `list_room_participants` | List participants in a room |
| `get_participant` | Get participant details |
| `update_participant` | Update participant (disconnect) |
| `list_room_recordings` | List recordings in room |
| `list_subscribed_tracks` | List subscribed tracks |
| `list_published_tracks` | List published tracks |

### Proxy Tools (P2) - 17 tools

| Tool | Description |
|------|-------------|
| `create_proxy_service` | Create number masking service |
| `list_proxy_services` | List all proxy services |
| `get_proxy_service` | Get service details |
| `update_proxy_service` | Update service config |
| `delete_proxy_service` | Delete a service |
| `create_proxy_session` | Create masked session |
| `list_proxy_sessions` | List sessions in service |
| `get_proxy_session` | Get session details |
| `update_proxy_session` | Update session (close) |
| `delete_proxy_session` | Delete a session |
| `add_proxy_participant` | Add participant to session |
| `list_proxy_participants` | List participants |
| `remove_proxy_participant` | Remove participant |
| `list_proxy_interactions` | List session interactions |
| `list_proxy_phone_numbers` | List phone numbers in service |
| `add_proxy_phone_number` | Add phone number to service |
| `remove_proxy_phone_number` | Remove phone number |

### TrustHub Tools (P2) - 17 tools

| Tool | Description |
|------|-------------|
| `create_customer_profile` | Create customer profile |
| `list_customer_profiles` | List customer profiles |
| `get_customer_profile` | Get profile details |
| `update_customer_profile` | Update profile |
| `delete_customer_profile` | Delete profile |
| `list_customer_profile_entity_assignments` | List entity assignments |
| `create_customer_profile_entity_assignment` | Assign entity to profile |
| `delete_customer_profile_entity_assignment` | Remove entity assignment |
| `list_trust_products` | List trust products (A2P brands) |
| `get_trust_product` | Get trust product details |
| `create_trust_product` | Create trust product |
| `update_trust_product` | Update trust product |
| `delete_trust_product` | Delete trust product |
| `list_policies` | List compliance policies |
| `list_end_users` | List end users |
| `create_end_user` | Create end user |
| `list_supporting_documents` | List supporting documents |

### Content Tools (P2) - 4 tools

| Tool | Description |
|------|-------------|
| `create_content_template` | Create message template |
| `list_content_templates` | List templates |
| `get_content_template` | Get template details |
| `delete_content_template` | Delete a template |

### Voice Config Tools (P2) - 14 tools

| Tool | Description |
|------|-------------|
| `get_dialing_permissions` | Get country dialing permissions |
| `list_dialing_permissions_countries` | List countries with permissions |
| `list_byoc_trunks` | List BYOC trunks |
| `get_byoc_trunk` | Get trunk details |
| `create_byoc_trunk` | Create BYOC trunk |
| `update_byoc_trunk` | Update trunk config |
| `delete_byoc_trunk` | Delete trunk |
| `list_connection_policies` | List connection policies |
| `create_connection_policy` | Create connection policy |
| `get_connection_policy` | Get policy details |
| `delete_connection_policy` | Delete policy |
| `list_connection_policy_targets` | List policy targets |
| `create_connection_policy_target` | Add target to policy |
| `delete_connection_policy_target` | Remove target |

### Regulatory Tools (P2) - 16 tools

| Tool | Description |
|------|-------------|
| `list_regulatory_bundles` | List regulatory bundles |
| `get_bundle_status` | Get bundle status |
| `create_regulatory_bundle` | Create new bundle |
| `update_regulatory_bundle` | Update bundle |
| `delete_regulatory_bundle` | Delete bundle |
| `list_bundle_item_assignments` | List bundle items |
| `create_bundle_item_assignment` | Add item to bundle |
| `delete_bundle_item_assignment` | Remove item from bundle |
| `list_supporting_documents` | List supporting documents |
| `get_supporting_document` | Get document details |
| `create_supporting_document` | Create document |
| `update_supporting_document` | Update document |
| `delete_supporting_document` | Delete document |
| `list_regulations` | List available regulations |
| `list_regulatory_end_users` | List end users |
| `create_regulatory_end_user` | Create end user |

### Media Tools (P2) - 10 tools

| Tool | Description |
|------|-------------|
| `list_video_recordings` | List video recordings |
| `get_video_recording` | Get recording details |
| `delete_video_recording` | Delete a recording |
| `list_compositions` | List video compositions |
| `get_composition` | Get composition details |
| `create_composition` | Create composition from recordings |
| `delete_composition` | Delete composition |
| `list_composition_hooks` | List composition hooks |
| `create_composition_hook` | Create auto-composition rule |
| `delete_composition_hook` | Delete hook |

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
