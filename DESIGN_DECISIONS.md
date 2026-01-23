# Twilio Agent Factory - Design Decisions

This document captures the architectural thinking behind the Twilio Agent Factory. Decisions may be revisited as we learn more - the changelog at the bottom tracks the evolution.

---

## Project Vision

Build a hybrid system using Claude Agent SDK that supports both:
- **Interactive workflows** (human-in-loop via slash commands)
- **Autonomous workflows** (agent-driven pipelines)

For Twilio application development, testing, and deployment.

---

## Decision 1: MCP Server as Pure API Wrapper

### Context

We needed to decide how agents would interact with Twilio APIs. Options were:
1. Wrap Twilio CLI commands (shell execution)
2. Direct Twilio SDK calls (API wrapper)
3. Hybrid (some CLI, some SDK)

### Decision

**MCP Server is a pure Twilio SDK wrapper. It never invokes CLI commands.**

### Rationale

1. **Testability**: API calls return predictable JSON, easy to mock and test
2. **Latency**: No process spawning overhead
3. **Security**: No shell access needed, simpler sandboxing
4. **Separation of concerns**: CLI is for humans/CI, MCP is for agents
5. **Failure modes**: API errors are structured, shell errors are strings

### Alternatives Considered

- **CLI wrapper**: Would allow deployment but adds complexity and security concerns
- **Hybrid**: Considered for deployment ops, rejected to maintain clear boundaries

### Consequences

- Deployment is NOT an MCP tool (requires CLI, stays human-controlled)
- Phone number purchase is NOT an MCP tool (financial, requires human approval)
- Account management is NOT an MCP tool (security sensitive)
- Clear separation: MCP = data ops, CLI = infra ops

### Status

**Accepted** - Session 2 (2026-01-20)

---

## Decision 2: Four-Tier Risk Model for Operations

### Context

Agents can perform many Twilio operations, but not all should be autonomous. We needed a framework to classify which operations need what level of oversight.

### Decision

**Four risk tiers determine agent autonomy levels:**

| Tier | Autonomy | Examples |
|------|----------|----------|
| **Tier 1: Safe** | Fully autonomous | Read-only queries (logs, status, lists) |
| **Tier 2: Controlled** | With guardrails | Send SMS (rate limited), create tasks |
| **Tier 3: Supervised** | Human approval | Configure webhooks, deploy, purchase |
| **Tier 4: Prohibited** | Never autonomous | Delete numbers, force push, skip hooks |

### Rationale

1. **Blast radius**: Read-only ops can't break anything
2. **Cost control**: Tier 2 rate limits prevent runaway costs
3. **Production safety**: Tier 3 gates prevent accidental production changes
4. **Irreversibility**: Tier 4 prevents catastrophic, unrecoverable actions

### Consequences

- MCP tools must be tagged with their tier
- Tier 2 tools need rate limiting implementation
- Tier 3 tools should return confirmation requests, not execute directly
- Existing pre-bash hooks already enforce Tier 4 prohibitions

### Status

**Accepted** - Session 2 (2026-01-20)

---

## Decision 3: Functions for Webhooks, MCP for Agent Actions

### Context

Both Functions and MCP can send SMS, make calls, etc. We needed to clarify when to use which.

### Decision

**Use Functions for event-triggered operations. Use MCP for agent-initiated operations.**

```
Inbound call → Function (returns TwiML)
Agent decides to send test SMS → MCP tool
User submits verification form → Function
Agent debugging message delivery → MCP tool
```

### Rationale

1. **Latency**: Functions run on Twilio infra, close to the event source
2. **TwiML**: Only Functions should return TwiML (agents return JSON)
3. **Signature validation**: Functions can validate Twilio request signatures
4. **Intent clarity**: Functions are reactive, MCP tools are proactive

### Consequences

- No duplication of business logic (put complex logic in Functions)
- MCP tools stay thin (just SDK calls with validation)
- Clear mental model for developers

### Status

**Accepted** - Session 2 (2026-01-20)

---

## Decision 4: Highly Supervised Autonomy Mode

### Context

The Claude Agent SDK supports various autonomy levels. We needed to decide how much independence agents should have during initial development.

### Decision

**Start with "Highly Supervised" mode: Human approval gates after each pipeline phase.**

Pipeline: `architect → spec → test-gen → dev → review → docs`

Human approves between each phase.

### Rationale

1. **Learning**: Understand agent behavior before increasing autonomy
2. **Quality**: Catch issues early in multi-step pipelines
3. **Trust building**: Build confidence incrementally
4. **Reversibility**: Easy to increase autonomy later, harder to recover from runaway agents

### Alternatives Considered

- **Fully autonomous**: Rejected for initial phases (too risky)
- **Semi-autonomous**: Approval only at start/end (considered for Phase 2+)
- **Batch approval**: Approve N steps at once (future consideration)

### Consequences

- More human interaction required initially
- Slower pipeline execution
- Better understanding of agent decision patterns
- Can relax constraints as confidence builds

### Status

**Accepted** - Session 1 (2026-01-19)

---

## Decision 5: Exclude EOL/Deprecated/Preview APIs

### Context

Twilio has 44+ API namespaces. Many are deprecated, end-of-life, or in preview. We needed to decide scope.

### Decision

**Only implement tools for stable, supported APIs. Exclude:**

- Assistants, Autopilot, Chat, Conversations, Flex, Frontline
- Fax, IP-Messaging, Microvisor, Preview, Supersim, Wireless
- Marketplace, Connect Apps, Authorized Connect Apps

**Version policy**: When v1 and v2 exist, use v2.

### Rationale

1. **Maintenance burden**: Deprecated APIs will eventually break
2. **Best practices**: Don't encourage use of sunset products
3. **Focus**: Limited time, focus on active products
4. **Clarity**: Clear guidance on what's supported

### Consequences

- Smaller initial tool surface (20 APIs vs 44)
- May need to add APIs if customer needs arise
- Version upgrades handled proactively

### Status

**Accepted** - Session 2 (2026-01-20)

---

## Decision 6: Priority Tiers for Tool Implementation

### Context

Even among supported APIs, not all are equally important. We needed an implementation order.

### Decision

**Four priority tiers based on usage frequency and agent utility:**

| Priority | APIs | Rationale |
|----------|------|-----------|
| **P0** | messaging, voice, phone-numbers, verify, sync, taskrouter, debugger | Core Twilio operations, most common use cases |
| **P1** | lookups, studio, messaging-services, serverless | High-value for agents (intelligence, orchestration) |
| **P2** | intelligence, video, proxy, trusthub | Specialized use cases |
| **P3** | trunking, accounts, events, knowledge, pricing, notify | Edge cases, rarely needed |

### Rationale

1. **80/20 rule**: P0 covers 80% of typical Twilio usage
2. **Agent utility**: P1 adds capabilities that help agents reason
3. **Deferred complexity**: P2/P3 can wait until needed
4. **Testability**: Start with well-understood APIs

### Consequences

- P0 tools implemented first (Session 1)
- P1 tools next priority
- P2/P3 implemented on-demand
- Can reprioritize based on actual agent usage

### Status

**Accepted** - Session 2 (2026-01-20)

---

## Decision 7: TDD Enforcement for Agent-Generated Code

### Context

Agents will generate code. We needed to ensure quality without manual review of every line.

### Decision

**Enforce TDD workflow: Tests must exist before implementation code is written.**

Pipeline: `test-gen (write failing tests) → dev (make tests pass) → review`

Hooks block implementation if tests don't exist for the feature.

### Rationale

1. **Quality gate**: Tests define expected behavior upfront
2. **Reviewability**: Easier to review tests than implementation
3. **Confidence**: Green tests = working code
4. **Existing pattern**: Project already uses TDD (dev/test-gen subagents)

### Consequences

- `/test-gen` must run before `/dev`
- Hooks validate test existence before allowing implementation writes
- May slow initial development but catches issues earlier

### Status

**Accepted** - Inherited from project setup (pre-Session 1)

---

## Decision 8: Sync Documents for Agent State

### Context

Agents need to maintain state across webhook invocations and sessions. Options:
1. In-memory (lost on restart)
2. File system (requires storage access)
3. External database (adds dependency)
4. Twilio Sync (native to the platform)

### Decision

**Use Twilio Sync Documents for agent state persistence.**

### Rationale

1. **Native**: Already part of Twilio ecosystem
2. **Real-time**: Changes propagate instantly
3. **TTL support**: Automatic cleanup of ephemeral state
4. **No new dependencies**: MCP already has Sync tools
5. **Webhooks**: Functions can read/write same state

### Consequences

- State size limited (Sync document limits apply)
- Not suitable for large datasets (use external DB for that)
- Agent state becomes observable (good for debugging)

### Status

**Accepted** - Session 1 (2026-01-19)

---

## Decision 9: Cost Budget Caps

### Context

Agent operations cost money (Twilio API calls, Claude tokens). We needed guardrails.

### Decision

**Implement budget caps:**
- $5.00 per feature implementation
- $2.00 per test run
- Rate limits on Tier 2 operations (10 SMS/min, 5 calls/min)

### Rationale

1. **Predictability**: Know maximum cost before starting
2. **Runaway prevention**: Agent loops can't drain account
3. **Transparency**: Clear to users what operations cost
4. **Adjustability**: Can increase limits for specific tasks

### Consequences

- Need cost tracking in orchestrator
- Need cost estimation in MCP tool responses
- May need to split large features into smaller budgeted chunks

### Status

**Accepted** - Session 1 (2026-01-19)

---

## Decision 10: Don't Put Agents in Real-Time Call Paths

### Context

Should agents handle live voice calls directly?

### Decision

**No. Agents are too slow for real-time voice/messaging.**

Voice webhooks must return TwiML in <200ms. Agent reasoning takes seconds.

### Rationale

1. **Latency**: LLM inference is 1-10 seconds, webhooks need <200ms
2. **Reliability**: Agent failures would drop calls
3. **Cost**: Token costs for every utterance would be prohibitive
4. **Existing solution**: ConversationRelay handles real-time via WebSocket

### Alternatives Considered

- **Async processing**: Agent analyzes call after completion (acceptable)
- **Hybrid**: Function handles real-time, agent does post-processing (preferred)

### Consequences

- Voice AI uses ConversationRelay pattern (direct LLM WebSocket)
- Agents do post-call analysis, not real-time handling
- Keeps agent use cases to planning/testing/debugging

### Status

**Accepted** - Session 1 (2026-01-19)

---

## Decision 11: Use Git Rev-Parse for Hook Paths

### Context

Claude Code hooks configured in `.claude/settings.json` use relative paths like `.claude/hooks/pre-write-validate.sh`. When Claude Code operates from subdirectories (e.g., running tests in `agents/mcp-servers/twilio/`), these relative paths fail with "No such file or directory".

### Decision

**Use `$(git rev-parse --show-toplevel)` in hook commands to find the project root.**

```json
{
  "command": "$(git rev-parse --show-toplevel)/.claude/hooks/pre-write-validate.sh"
}
```

### Rationale

1. **CWD independence**: Works regardless of which subdirectory Claude Code is in
2. **Portability**: Works on any machine without hardcoded paths
3. **Git-native**: Uses git's own mechanism to find repo root
4. **Shell expansion**: Claude Code expands `$()` subshells in hook commands

### Alternatives Considered

- **Absolute paths**: Would work but not portable across machines
- **Wrapper scripts**: Each hook finds its own path - adds complexity
- **Always cd to root**: Not always feasible in multi-directory workflows

### Consequences

- Hooks only work inside git repositories (acceptable for this project)
- Slight overhead from git rev-parse call (negligible)
- Pattern should be documented for anyone adding new hooks

### Status

**Accepted** - Session 3 (2026-01-20)

---

## Decision 12: Auto-Setup Script for Resource Provisioning

### Context

Setting up a Twilio development environment requires creating multiple resources manually via Console:
- Phone numbers
- Verify Service
- Sync Service
- TaskRouter Workspace/Workflow
- Messaging Service
- API Keys

This is tedious and error-prone. Users must leave Claude Code, navigate Console, create resources, copy SIDs back.

### Decision

**Create an auto-setup script that provisions Twilio resources via API after user provides base credentials.**

Flow:
1. User provides Account SID + Auth Token (or API Key + Secret)
2. Script prompts: "Which resources should I provision?" (checkboxes)
3. Script creates resources via Twilio SDK
4. Script updates .env file with new SIDs
5. Script configures webhooks to use STATUS_CALLBACK_URL and FALLBACK_URL

### Resources to Auto-Provision

| Resource | API | SID Prefix | Notes |
|----------|-----|------------|-------|
| Phone Number | api:v2010 IncomingPhoneNumbers | PN | Searches and purchases first available local number |
| Verify Service | verify:v2 Services | VA | Creates service named "Agent Factory" |
| Sync Service | sync:v1 Services | IS | Creates default service |
| TaskRouter Workspace | taskrouter:v1 Workspaces | WS | Creates workspace + default workflow |
| Messaging Service | messaging:v1 Services | MG | Creates service, adds phone number to pool |
| API Key | iam:v1 Keys | SK | Creates key for production use |

### Implementation

Location: `scripts/setup.ts` or `npx twilio-agent-factory setup`

```typescript
interface SetupOptions {
  accountSid: string;
  authToken: string;
  resources: ('phone' | 'verify' | 'sync' | 'taskrouter' | 'messaging' | 'apiKey')[];
  countryCode?: string; // For phone number search
  statusCallbackUrl?: string;
  fallbackUrl?: string;
}
```

### Rationale

1. **Developer experience**: Get started in seconds, not hours
2. **Consistency**: All resources configured correctly by default
3. **Discoverability**: Users learn what resources exist
4. **Idempotency**: Can detect existing resources and skip

### Consequences

- Need Tier 3 approval for purchases (phone numbers cost money)
- Script should show estimated costs before provisioning
- Must handle partial failures gracefully (some resources created, others failed)
- Should support `--dry-run` mode

### Status

**Implemented** - Session 3c (2026-01-22)

Implementation: `scripts/setup.js` (run via `npm run setup`)

---

## Decision 13: Deep Validation Pattern for API Responses

### Context

A 200 OK from Twilio API doesn't guarantee success. The message may be queued but:
- TwiML validation could fail later
- Carrier could reject the message
- Webhook could return errors
- Call could fail to connect

Tests that only check for 200 OK give false confidence.

### Decision

**Implement a deep validation helper that checks multiple signals after API operations.**

For each operation type, check:

| Operation | Primary Check | Secondary Checks |
|-----------|--------------|------------------|
| **SMS/MMS** | Message status (queued→sent→delivered) | Debugger alerts, error codes |
| **Voice Call** | Call status (queued→ringing→in-progress→completed) | Call events, Voice Insights summary |
| **Verification** | Verification status | Debugger alerts |

### Implementation

Location: `agents/mcp-servers/twilio/src/validation/deep-validator.ts`

```typescript
interface ValidationResult {
  success: boolean;
  primaryStatus: string;
  checks: {
    resourceStatus: { passed: boolean; status: string };
    debuggerAlerts: { passed: boolean; alerts: Alert[] };
    callEvents?: { passed: boolean; events: Event[] };
    voiceInsights?: { passed: boolean; summary: object };
  };
  errors: string[];
  warnings: string[];
}

async function validateMessage(sid: string, options?: { waitForDelivery?: boolean }): Promise<ValidationResult>;
async function validateCall(sid: string, options?: { waitForComplete?: boolean }): Promise<ValidationResult>;
async function validateVerification(sid: string): Promise<ValidationResult>;
```

### Deep Validation Workflow

1. **Immediate check**: Fetch resource status via API
2. **Debugger check**: Query monitor API for alerts related to resource SID (last 60 seconds)
3. **Events check** (calls only): Fetch call events for HTTP request/response logs
4. **Insights check** (calls only): Fetch Voice Insights call summary
5. **Aggregate**: Return structured result with all checks

### Rationale

1. **Confidence**: Know operations actually succeeded end-to-end
2. **Debugging**: When tests fail, have rich diagnostic info
3. **Realism**: Catch issues that simple status checks miss
4. **Learning**: Understand Twilio's async behavior

### Consequences

- Integration tests take longer (polling for status)
- More API calls per test (may affect rate limits)
- Need to handle async nature (some checks may need retries)
- Better error messages when things fail

### Status

**Implemented** - Session 3c (2026-01-22)

Implementation: `agents/mcp-servers/twilio/src/validation/deep-validator.ts`

Also includes:
- Callback Functions infrastructure (`functions/callbacks/`) for Sync-based callback data
- Test helper with Jest matchers (`__tests__/helpers/deep-validation.ts`)

---

## Open Questions

Questions we haven't resolved yet:

1. **Multi-tenant**: How do we handle multiple Twilio accounts?
2. **Agent memory**: How much context should persist across sessions?
3. **Parallel agents**: Can multiple agents work on same codebase?
4. **Rollback**: How do we undo agent-generated changes?
5. **Audit trail**: How detailed should agent action logging be?
6. **Auto-setup approval**: Should phone number purchase require explicit user confirmation?
7. **Validation timeouts**: How long should deep validation wait for message delivery?

---

## Changelog

| Date | Session | Decision | Change | Reference |
|------|---------|----------|--------|-----------|
| 2026-01-19 | 1 | D4 | Initial autonomy mode: highly supervised | Plan approved |
| 2026-01-19 | 1 | D7 | TDD enforcement confirmed | Inherited from project |
| 2026-01-19 | 1 | D8 | Sync for agent state | MCP sync tools implemented |
| 2026-01-19 | 1 | D9 | Cost budget caps defined | Plan approved |
| 2026-01-19 | 1 | D10 | No agents in real-time paths | Anti-patterns documented |
| 2026-01-20 | 2 | D1 | MCP as pure API wrapper | TOOL_BOUNDARIES.md created |
| 2026-01-20 | 2 | D2 | Four-tier risk model | TOOL_BOUNDARIES.md created |
| 2026-01-20 | 2 | D3 | Functions vs MCP clarified | TOOL_BOUNDARIES.md created |
| 2026-01-20 | 2 | D5 | EOL/deprecated APIs excluded | API_REFERENCE.md created |
| 2026-01-20 | 2 | D6 | P0-P3 priority tiers | todo.md updated |
| 2026-01-20 | 3 | D11 | Git rev-parse for hook paths | commit 4f84cd8 |
| 2026-01-22 | 3b | D12 | Auto-setup script proposed | User request |
| 2026-01-22 | 3b | D13 | Deep validation pattern proposed | User request |
| 2026-01-22 | 3c | D12 | Auto-setup script implemented | scripts/setup.js |
| 2026-01-22 | 3c | D13 | Deep validation implemented | src/validation/deep-validator.ts |

---

## How to Update This Document

When making architectural decisions:

1. **Add a new Decision section** with Context, Decision, Rationale, Alternatives, Consequences, Status
2. **Update the Changelog** with date, session, decision ID, change summary, reference
3. **If revisiting a decision**, update Status to "Superseded by Dxx" and add new decision
4. **Link to PRs/commits** when available for traceability

When merging PRs that affect architecture:

- Add PR number to the Reference column
- Example: `PR #42` or `commit abc123`
