# Tool Boundaries Reference

This document defines the architectural boundaries between MCP Server, Twilio CLI, Serverless Toolkit, and Twilio Functions. Use this as a decision guide when implementing new capabilities.

---

## Component Overview

| Component | Purpose | Runtime | Output Type |
|-----------|---------|---------|-------------|
| **MCP Server** | Agent-accessible Twilio API wrapper | In-process with Claude Agent SDK | JSON data |
| **Twilio CLI** | DevOps/admin interface for humans | Terminal / CI pipelines | Commands + logs |
| **Serverless Toolkit** | Deployment mechanism (CLI plugin) | CLI plugin | Deployed code |
| **Twilio Functions** | Webhook handlers on Twilio infra | Twilio's Node.js runtime | TwiML / JSON |
| **Agent Teams** | Parallel multi-agent coordination | Multiple Claude Code sessions | Structured task results |

---

## Dual Tool Registration

In this project, Twilio tools appear twice in Claude Code sessions:

1. **`mcp__twilio__<name>`** — Project MCP server (via `.mcp.json`). Uses project `.env` credentials.
2. **`mcp__plugin_twilio-claude-plugin_twilio__<name>`** — Official Twilio plugin (via `~/.claude/settings.json`).

**Always prefer `mcp__twilio__` (the shorter prefix).** It uses the project's configured credentials and matches the deployed account. The plugin uses its own credential config which may differ.

To disable the plugin entirely: set `"twilio-claude-plugin@twilio-claude-plugin": false` in `~/.claude/settings.json` under `enabledPlugins`.

---

## The Golden Rules

1. **MCP = Data Operations**: Query, send, create records. Never deploy or delete infrastructure.
2. **CLI = Infrastructure Operations**: Deploy, configure environments, purchase numbers.
3. **Functions = Real-Time Webhooks**: Handle calls/messages, return TwiML.
4. **Never Cross Layers**: MCP does not invoke CLI. Functions do not use MCP.
5. **Teams = Parallel Coordination**: Multiple agents working simultaneously. Teammates must not edit the same file.
6. **SID-First Principle**: When you have a specific resource SID (call, message, recording, transcript, task, room, trunk, Sync resource), always use the SID-targeted `validate_*` or `get_*` tool instead of listing and filtering. SID-targeted tools provide deep validation (status, notifications, insights, sub-resources) in a single call. Reserve `list_*` tools for discovery when you don't have a SID.

---

## Operation Risk Tiers

### Tier 1: Safe (Agent Autonomous)

Read-only operations agents can perform freely via MCP tools.

| Operation | MCP Tool | Notes |
|-----------|----------|-------|
| Query message history | `get_message_logs` | Filtered by date, phone, status |
| Query call history | `get_call_logs` | Filtered by date, phone, status |
| Get debugger alerts | `get_debugger_logs` | Error analysis, monitoring |
| Get usage records | `get_usage_records` | Billing, cost analysis |
| List phone numbers | `list_phone_numbers` | Inventory check |
| Search available numbers | `search_available_numbers` | Research only, no purchase |
| Get Sync document | `get_document` | State retrieval |
| List Sync documents | `list_documents` | State enumeration |
| List TaskRouter workers | `list_workers` | Availability check |
| List TaskRouter workflows | `list_workflows` | Routing config review |
| List TaskRouter task queues | `list_task_queues` | Queue topology discovery |
| Get TaskRouter task queue | `get_task_queue` | Queue config inspection |
| Get TaskRouter queue stats | `get_queue_statistics` | Real-time operational metrics |
| List TaskRouter activities | `list_activities` | Worker state discovery |
| List TaskRouter reservations | `list_reservations` | Task-to-worker match visibility |
| List Sync Lists | `list_sync_lists` | List enumeration |
| List Sync List items | `list_sync_list_items` | Collection read |
| List Sync Maps | `list_sync_maps` | Map enumeration |
| Get Sync Map item | `get_sync_map_item` | Key-value lookup |
| List call queues | `list_queues` | Queue inventory |
| Get call queue | `get_queue` | Queue details |
| Get payment status | `get_payment` | Payment status check |
| Get verification status | `get_verification_status` | Status check |
| Validate call (deep) | `validate_call` | Status + notifications + Voice Insights |
| Validate message (deep) | `validate_message` | Delivery + debugger alerts |
| Validate recording | `validate_recording` | Completion polling + duration |
| Validate transcript | `validate_transcript` | Completion + sentences |
| Validate debugger | `validate_debugger` | Alerts, optionally filtered by resourceSid |
| Validate voice AI flow | `validate_voice_ai_flow` | Full flow: call → recording → transcript |
| Validate two-way | `validate_two_way` | Bidirectional conversation |
| Validate language operator | `validate_language_operator` | Operator results on transcript |
| Validate Sync document | `validate_sync_document` | Data structure + content |
| Validate Sync list | `validate_sync_list` | Item count + structure |
| Validate Sync map | `validate_sync_map` | Key/value validation |
| Validate TaskRouter task | `validate_task` | Task deep validation |
| Validate SIP | `validate_sip` | Infrastructure validation |
| Validate video room | `validate_video_room` | Room + participants + tracks |
| List serverless services | `list_services` | Deployment state |
| List serverless functions | `list_functions` | Function inventory |
| List serverless logs | `list_logs` | Runtime logs |
| List environments | `list_environments` | Deployment environments |
| List builds | `list_builds` | Build history |
| Get build status | `get_build_status` | Build completion |
| List assets | `list_assets` | Asset inventory |
| List variables | `list_variables` | Environment variables |
| List Studio flows | `list_studio_flows` | Flow inventory |
| Get Studio flow | `get_flow` | Flow definition |
| Get execution status | `get_execution_status` | Flow execution state |
| List execution steps | `list_execution_steps` | Step-by-step trace |
| List messaging services | `list_messaging_services` | Service inventory |
| Get messaging service | `get_messaging_service` | Service config |
| Lookup phone number | `lookup_phone_number` | Carrier info, validation |
| Check fraud risk | `check_fraud_risk` | Fraud assessment |
| List video rooms | `list_video_rooms` | Room inventory |
| Get video room | `get_room` | Room details |
| List room participants | `list_room_participants` | Participant inventory |
| List room recordings | `list_room_recordings` | Recording inventory |
| List proxy services | `list_proxy_services` | Proxy inventory |
| Get proxy service | `get_proxy_service` | Service config |
| List proxy sessions | `list_proxy_sessions` | Session inventory |
| List content templates | `list_content_templates` | Template inventory |
| Get content template | `get_content_template` | Template details |
| List intelligence services | `list_intelligence_services` | Service inventory |
| List transcripts | `list_transcripts` | Transcript inventory |
| Get transcript | `get_transcript` | Transcript details |
| List sentences | `list_sentences` | Sentence extraction |
| List operator results | `list_operator_results` | AI operator output |
| List SIP domains | `list_sip_domains` | Domain inventory |
| List SIP trunks | `list_sip_trunks` | Trunk inventory |
| Get SIP trunk | `get_sip_trunk` | Trunk config |
| List regulatory bundles | `list_regulatory_bundles` | Compliance status |
| Get account | `get_account` | Account info + status |
| List accounts | `list_accounts` | Sub-account inventory |
| Get account balance | `get_account_balance` | Balance check |
| List API keys | `list_api_keys` | Key inventory |
| List addresses | `list_addresses` | Address inventory |
| List voice pricing | `list_voice_pricing_countries` | Pricing reference |
| List messaging pricing | `list_messaging_pricing_countries` | Pricing reference |
| List notify services | `list_notify_services` | Notification services |
| List customer profiles | `list_customer_profiles` | TrustHub profiles |
| List trust products | `list_trust_products` | Trust products |
| List end users | `list_end_users` | End user inventory |

### Tier 2: Controlled (Agent with Guardrails)

Write operations agents can perform with rate limits or validation.

| Operation | MCP Tool | Guardrail |
|-----------|----------|-----------|
| Send SMS | `send_sms` | Rate limit: 10/minute, validated E.164 |
| Send MMS | `send_mms` | Rate limit: 10/minute, media URL validation |
| Make outbound call | `make_call` | Rate limit: 5/minute, validated E.164 |
| Start verification | `start_verification` | Rate limit: 5/minute per recipient |
| Create Sync document | `create_document` | Namespace isolation for agent state |
| Update Sync document | `update_document` | Agent-owned documents only |
| Create TaskRouter task | `create_task` | Priority caps, timeout limits |
| Update TaskRouter task | `update_task` | Changes task state |
| Update TaskRouter worker | `update_worker` | Changes worker availability |
| Update TaskRouter reservation | `update_reservation` | Completes assignment flow |
| Create Sync List | `create_sync_list` | Resource creation |
| Add Sync List item | `add_sync_list_item` | Data write |
| Update Sync List item | `update_sync_list_item` | Data mutation |
| Remove Sync List item | `remove_sync_list_item` | Data deletion |
| Create Sync Map | `create_sync_map` | Resource creation |
| Add Sync Map item | `add_sync_map_item` | Data write |
| Update Sync Map item | `update_sync_map_item` | Data mutation |
| Remove Sync Map item | `remove_sync_map_item` | Data deletion |
| Create payment | `create_payment` | PCI Mode required (irreversible) |
| Update payment | `update_payment` | Completes/cancels payment |
| Dequeue member | `dequeue_member` | Redirects queued caller |
| Create video room | `create_video_room` | Room creation |
| Update video room | `update_room` | Room state changes |
| Trigger Studio flow | `trigger_flow` | Flow execution |
| Create messaging service | `create_messaging_service` | Service setup |
| Update messaging service | `update_messaging_service` | Config changes |
| Delete messaging service | `delete_messaging_service` | Service removal |
| Create proxy session | `create_proxy_session` | Anonymous communication |
| Create content template | `create_content_template` | Template creation |
| Delete content template | `delete_content_template` | Template removal |
| Create transcript | `create_transcript` | Intelligence transcription |
| Delete transcript | `delete_transcript` | Transcript removal |
| Create notify service | `create_notify_service` | Notification setup |
| Send notification | `send_notification` | Push notification |
| Create SIP domain | `create_sip_domain` | SIP infrastructure |
| Update SIP domain | `update_sip_domain` | SIP config changes |
| Create SIP trunk | `create_sip_trunk` | Trunking infrastructure |
| Update SIP trunk | `update_sip_trunk` | Trunk config changes |
| Create variable | `create_variable` | Serverless env var |
| Update variable | `update_variable` | Env var changes |

### Tier 3: Supervised (Human Confirmation Required)

Operations requiring explicit human approval before execution.

| Operation | Tool | Why Supervised |
|-----------|------|----------------|
| Configure webhook URLs | MCP: `configure_webhook` | Changes production routing |
| Deploy to production | CLI: `serverless:deploy --environment production` | Production infrastructure change |
| Purchase phone number | CLI: `phone-numbers:buy:*` | Financial commitment |
| Rollback deployment | CLI: `serverless:activate` | Production impact |
| Delete Sync documents | MCP: `delete_document` | Data loss potential |

### Tier 4: Prohibited (Never Autonomous)

Operations agents should NEVER perform autonomously.

| Operation | Why Prohibited |
|-----------|----------------|
| Delete phone numbers | Irreversible, financial impact |
| Close/suspend account | Catastrophic |
| Force push to git | Data loss potential |
| Deploy without tests passing | Quality gate bypass |
| Commit with `--no-verify` | Hook bypass |
| Modify production env vars directly | Security risk |
| Purchase toll-free/shortcode numbers | Expensive, regulatory |

---

## When to Use Each Component

### Use MCP Server When

- Agent needs to **query** Twilio data (logs, status, lookups)
- Agent is **sending test messages** or making test calls
- Agent is **managing Sync state** for its own memory
- Agent is **creating TaskRouter tasks** for orchestration
- Agent needs **structured JSON responses** for reasoning
- Operation is **stateless** and returns immediate results

### Use Twilio CLI When

- **Deploying** serverless functions (`serverless:deploy`)
- **Local development** server (`serverless:start --ngrok`)
- **Purchasing** phone numbers (requires human approval)
- **Managing** CLI profiles and credentials
- **Rollback** operations (`serverless:activate`)
- **Interactive debugging** sessions
- One-time **setup and configuration**

### Use Serverless Toolkit When

- Building **local development** environment
- **Deploying** Functions and Assets to Twilio
- Managing **environment variables** per deployment
- Viewing **deployment logs** and history
- **Promoting** between environments (dev → prod)

### Use Twilio Functions When

- Handling **inbound webhooks** (calls, messages)
- Response must be **TwiML**
- Operation is **triggered by real Twilio events**
- **Low-latency** is required (deployed on Twilio infra)
- Need **Twilio request signature validation** (`.protected.js`)
- Business logic runs **close to Twilio infrastructure**

---

## Overlapping Functionality Resolution

When the same operation can be done multiple ways, use this guide:

### SMS Sending

| Tool | Use When |
|------|----------|
| MCP `send_sms` | Agent-initiated: testing, debugging, proactive notifications |
| Function `send-sms.protected.js` | Event-triggered: after call, verification success, workflow step |
| CLI `api:core:messages:create` | Human debugging, one-off manual sends |

**Rule**: Use MCP when agent decides to send. Use Function when event triggers sending.

### Debugger Logs

| Tool | Use When |
|------|----------|
| MCP `validate_debugger(resourceSid)` | SID-targeted: alerts for a specific call/message/resource |
| MCP `validate_call(callSid)` / `validate_message(messageSid)` | Deep validation including debugger alerts for that resource |
| MCP `get_debugger_logs` | Time-window browsing when no specific SID available |
| MCP `analyze_errors` | Pattern detection and error grouping |
| CLI `debugger:logs:list` | Interactive human debugging session |

**Rule**: SID-first — use `validate_*` tools when you have a resource SID. Use `get_debugger_logs` for discovery. CLI for human debugging only.

### Phone Number Configuration

| Tool | Use When |
|------|----------|
| MCP `configure_webhook` | Automated configuration during deployment pipelines |
| CLI `phone-numbers:update` | Interactive setup, one-time manual configuration |

**Rule**: Both require Tier 3 approval for production. MCP for automation, CLI for manual.

### Verification

| Tool | Use When |
|------|----------|
| MCP `start_verification` | Agent testing, automated verification flows |
| Function `start-verification.protected.js` | User-facing flows triggered by form submission |

**Rule**: Use Function for user-initiated, MCP for agent/system-initiated.

### Sync State

| Tool | Use When |
|------|----------|
| MCP `validate_sync_document(serviceSid, name)` | SID-targeted: deep validation of a specific document |
| MCP `validate_sync_list(serviceSid, name)` / `validate_sync_map(serviceSid, name)` | SID-targeted: validate list/map structure and contents |
| MCP `create_document`, `update_document`, List/Map CRUD tools | Agent state management workflows |
| Function (via `context.getTwilioClient()`) | Event-triggered state updates from webhooks |
| CLI `twilio api:sync:*` | One-off manual inspection |

**Rule**: SID-first for validation. MCP for agent workflows. Functions for event-triggered updates.

### TaskRouter

| Tool | Use When |
|------|----------|
| MCP `validate_task(taskSid)` | SID-targeted: deep validation of a specific task |
| MCP `list_workers`, `get_queue_statistics`, `list_task_queues`, `list_activities` | Agent monitoring and management (30 tools) |
| MCP `create_task`, `update_task`, `update_worker`, `update_reservation` | Agent-driven task orchestration |
| Function (via `context.getTwilioClient()`) | Worker updates from call events, assignment callbacks |
| CLI `twilio api:taskrouter:*` | One-time workspace setup |

**Rule**: SID-first for task validation. MCP for monitoring. Functions for event-triggered routing.

### Serverless Inspection

| Tool | Use When |
|------|----------|
| MCP `list_services`, `list_functions`, `list_logs` | Agent querying deployment state |
| MCP `list_environments`, `list_builds`, `get_build_status` | Deployment status checks |
| CLI `serverless:deploy`, `serverless:activate` | Deployment, promotion, rollback (Tier 3) |

**Rule**: MCP for read-only inspection. CLI for all infrastructure changes.

### Account & Usage

| Tool | Use When |
|------|----------|
| MCP `get_account` | Auth validation, account status check |
| MCP `list_usage_records`, `get_account_balance` | Automated monitoring, cost analysis |
| CLI `twilio api:core:accounts:fetch` | Manual account inspection |

**Rule**: MCP for agent-automated monitoring. CLI for manual inspection.

### Recordings & Transcripts

| Tool | Use When |
|------|----------|
| MCP `validate_recording(recordingSid)` | SID-targeted: completion polling + status |
| MCP `validate_transcript(transcriptSid)` | SID-targeted: completion + sentence extraction |
| MCP `validate_language_operator(transcriptSid)` | SID-targeted: operator results on a transcript |
| MCP `list_recordings`, `list_transcripts`, `list_sentences` | Discovery when no specific SID |
| CLI | Manual one-off retrieval |

**Rule**: SID-first for validation. List tools for discovery only.

### Studio Flows

| Tool | Use When |
|------|----------|
| MCP `trigger_flow`, `get_execution_status`, `list_execution_steps` | Always MCP for agent interaction |
| MCP `list_studio_flows`, `get_flow` | Flow discovery and inspection |

**Rule**: Always MCP. No dedicated CLI equivalent.

### Lookups

| Tool | Use When |
|------|----------|
| MCP `lookup_phone_number` | Phone number validation and carrier info |
| MCP `check_fraud_risk` | Fraud risk assessment |

**Rule**: Always MCP. No dedicated CLI equivalent.

### Video

| Tool | Use When |
|------|----------|
| MCP `validate_video_room(roomSid)` | SID-targeted: room + participants + tracks + recordings |
| MCP `create_video_room`, `list_video_rooms` | Room management |
| MCP `list_room_participants`, `get_participant` | Participant management |

**Rule**: SID-first for room validation. Always MCP — no dedicated CLI equivalent.

---

## MCP Server Boundaries

### MCP Server SHOULD

1. **Remain a pure Twilio SDK wrapper** - Direct API calls only
2. **Return JSON data** - Never TwiML (that's for Functions)
3. **Be stateless** - No persistent connections or file storage
4. **Validate inputs with Zod schemas** - Type-safe, documented
5. **Implement rate limiting** - Protect Tier 2 operations
6. **Redact sensitive data** - No auth tokens in responses

### MCP Server SHOULD NOT

1. **Invoke CLI commands** - No `exec()`, `spawn()`, or shell calls
2. **Perform file operations** - No reading/writing local files
3. **Make deployment decisions** - That requires human oversight
4. **Purchase or delete resources** - Financial/irreversible
5. **Modify account-level settings** - Security sensitive
6. **Store state internally** - Use Sync documents instead

---

## Architecture Decision Record

### Decision: MCP Stays Pure API

**Context**: Should MCP tools wrap CLI commands for operations like deployment?

**Decision**: No. MCP will NEVER wrap CLI commands.

**Rationale**:
1. CLI invocation adds latency and failure modes (process spawning, parsing)
2. CLI requires shell access, complicating security sandboxing
3. API calls are more testable and produce predictable results
4. Deployment must always require human oversight
5. Keeps MCP focused on data operations, not infrastructure

**Consequences**:
- Deployment is not an MCP tool (stays CLI-only)
- Phone number purchase is not an MCP tool
- Account management is not an MCP tool
- This is intentional, not a limitation

---

## Anti-Patterns to Avoid

### 1. MCP Invoking CLI Commands

```typescript
// DON'T DO THIS
const deployTool = {
  name: 'deploy_functions',
  handler: async () => {
    exec('twilio serverless:deploy');  // WRONG
  }
};
```

**Why**: Violates pure API principle. Deployment requires human oversight.

### 2. Functions Calling MCP

```javascript
// DON'T DO THIS in a Function
const mcpServer = require('../mcp-servers/twilio');
await mcpServer.tools.send_sms({ to, body });  // WRONG
```

**Why**: Functions have direct SDK access via `context.getTwilioClient()`. MCP is for agent orchestration.

### 3. Duplicating Business Logic

```
// DON'T DO THIS
MCP: send_sms with complex retry logic
Function: send-sms.protected.js with identical retry logic
```

**Why**: Maintain single source of truth. Put business logic in Functions, keep MCP as thin wrapper.

### 4. Agent Deploying Autonomously

```
Agent: "I'll deploy these changes now."
*runs twilio serverless:deploy*  // WRONG
```

**Why**: Deployment is Tier 3 (requires human approval). Pre-bash hooks block this anyway.

### 5. Storing Secrets in MCP Tools

```typescript
// DON'T DO THIS
const client = Twilio('ACxxxx...hardcoded', 'authtoken...hardcoded');  // WRONG
```

**Why**: Pre-write hooks block hardcoded credentials. Always use environment variables.

---

## Decision Flowchart

```
Is this a webhook response to an inbound call/message?
├─ Yes → Use Functions (.js or .protected.js)
└─ No → Continue

Does the operation deploy or modify infrastructure?
├─ Yes → Use CLI (human approval required)
└─ No → Continue

Is this triggered by a real-time Twilio event?
├─ Yes → Use Functions
└─ No → Continue

Does the agent need to perform this operation?
├─ Yes → Use MCP Server tool
└─ No → Use CLI for manual operation

Is the operation read-only?
├─ Yes → MCP Tier 1 (autonomous)
└─ No → Does it cost money or affect production?
    ├─ Yes → MCP Tier 2/3 (guardrails/approval)
    └─ No → MCP Tier 2 (with rate limits)
```

---

## Related Documentation

- [/agents/mcp-servers/twilio/docs/API_REFERENCE.md](/agents/mcp-servers/twilio/docs/API_REFERENCE.md) - Twilio API documentation and tool mapping
- [/agents/mcp-servers/twilio/CLAUDE.md](/agents/mcp-servers/twilio/CLAUDE.md) - MCP server overview and usage
- [twilio-cli.md](twilio-cli.md) - CLI command reference (same directory)
- [/.claude/hooks/pre-bash-validate.sh](/.claude/hooks/pre-bash-validate.sh) - Safety hooks
- [/DESIGN_DECISIONS.md](/DESIGN_DECISIONS.md) - Project-wide architectural decisions

---
