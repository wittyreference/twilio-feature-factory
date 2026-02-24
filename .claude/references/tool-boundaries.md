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

## The Golden Rules

1. **MCP = Data Operations**: Query, send, create records. Never deploy or delete infrastructure.
2. **CLI = Infrastructure Operations**: Deploy, configure environments, purchase numbers.
3. **Functions = Real-Time Webhooks**: Handle calls/messages, return TwiML.
4. **Never Cross Layers**: MCP does not invoke CLI. Functions do not use MCP.
5. **Teams = Parallel Coordination**: Multiple agents working simultaneously. Teammates must not edit the same file.

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

### Tier 3: Supervised (Human Confirmation Required)

Operations requiring explicit human approval before execution.

| Operation | Tool | Why Supervised |
|-----------|------|----------------|
| Configure webhook URLs | MCP: `configure_webhook` | Changes production routing |
| Deploy to production | CLI: `serverless:deploy --environment production` | Production infrastructure change |
| Purchase phone number | CLI: `phone-numbers:buy:*` | Financial commitment |
| Rollback deployment | CLI: `serverless:activate` | Production impact |
| Delete Sync documents | MCP: (not implemented) | Data loss potential |

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
| MCP `get_debugger_logs` | Automated error analysis, monitoring workflows |
| CLI `debugger:logs:list` | Interactive human debugging session |

**Rule**: Functionally equivalent. Use MCP for agent workflows, CLI for human debugging.

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
