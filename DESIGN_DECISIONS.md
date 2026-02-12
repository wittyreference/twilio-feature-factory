# Twilio Agent Factory - Design Decisions

This document captures the architectural thinking behind the Twilio Agent Factory. Decisions may be revisited as you learn more - the changelog at the bottom tracks the evolution.

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

**Accepted**

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

**Accepted**

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

**Accepted**

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
- **Semi-autonomous**: Approval only at start/end (considered for later phases)
- **Batch approval**: Approve N steps at once (future consideration)

### Consequences

- More human interaction required initially
- Slower pipeline execution
- Better understanding of agent decision patterns
- Can relax constraints as confidence builds

### Status

**Accepted**

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

**Accepted**

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

- P0 tools implemented first
- P1 tools next priority
- P2/P3 implemented on-demand
- Can reprioritize based on actual agent usage

### Status

**Accepted**

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

**Accepted**

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

**Accepted**

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

**Accepted**

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

**Accepted**

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

**Accepted**

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

Location: `scripts/setup.js` (run via `npm run setup`)

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

**Implemented**

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

**Implemented**

Implementation: `agents/mcp-servers/twilio/src/validation/deep-validator.ts`

Also includes:
- Callback Functions infrastructure (`functions/callbacks/`) for Sync-based callback data
- Test helper with Jest matchers (`__tests__/helpers/deep-validation.ts`)

---

## Decision 14: Git as Source of Truth for Activity Tracking

### Context

We attempted to enhance subagent activity logging to capture richer information:
- Subagent type (which command was invoked)
- Files modified during the subagent's work
- Commits created
- Duration

The goal was to have a queryable log of what agents did.

### Decision

**Don't log agent activity separately. Git history + todo.md + learnings.md are sufficient.**

### Rationale

1. **Git already captures this**: Commits show what changed, when, why, and who (via Co-Authored-By)
2. **Transcript parsing is unreliable**: Different agent types (Explore, Plan, Task) populate transcripts differently
3. **Hook timing mismatch**: SubagentStop fires when exploration completes, not after implementation
4. **Meaningless IDs**: Agent IDs are internal hashes with no human value
5. **Duplication**: todo.md session log already tracks work per session

### Alternatives Considered

- **Enhanced transcript parsing**: Attempted, but transcripts don't have consistent structure
- **Structured JSON logging**: Would add complexity without adding value over git
- **Database tracking**: Over-engineering for the problem at hand

### Consequences

- Rely on existing mechanisms (git, todo.md, learnings.md, DESIGN_DECISIONS.md)
- subagent-log.sh just triggers doc-update-check.sh (the useful part)
- No separate activity log to maintain or query
- Simpler hook implementation

### Status

**Implemented**

---

## Decision 15: Why MCP + Agent SDK Over CLI-Only

### Context

When asked "why build a custom MCP server instead of just using Twilio CLI commands via Claude Code?", we needed a clear answer for the fundamental value proposition.

### Decision

**MCP tools enable autonomous agent pipelines where agents verify their own work. CLI-only workflows require human verification at each step.**

### The Comparison

| Aspect | CLI via Bash | MCP Tools |
|--------|--------------|-----------|
| **Output** | Text to parse | Structured JSON |
| **Errors** | Exit codes + stderr | Typed error objects |
| **Validation** | Hope it worked | Programmatic verification |
| **Agent reasoning** | "I ran a command..." | "SMS delivered to +1555..., status: delivered" |
| **Self-verification** | Not possible | Deep validation built-in |

### The Fundamental Value Proposition

> "Claude Code + Twilio CLI lets you build Twilio apps with Claude's help."
>
> "Twilio Agent Factory lets Claude **build, test, and validate** Twilio apps autonomously, with you approving at checkpoints."

The difference is **who does the verification work**:

**CLI-only workflow:**
1. Claude writes code
2. Claude runs CLI commands
3. Human tests, finds issues
4. Human tells Claude what's wrong
5. Repeat until working

**Agent Factory workflow:**
1. Agent writes failing tests (TDD Red)
2. Agent writes code to pass tests (TDD Green)
3. Agent validates via deep validation (not just "200 OK")
4. Agent presents verified result
5. Human approves or requests changes

### When This Adds Value

**Agent Factory approach is better when:**
- Complex features with multiple async operations (verify + SMS + call)
- Webhook dependencies (did the callback fire?)
- Quality requirements (TDD enforcement)
- Reduced iteration cycles (agent catches its own mistakes)

**CLI-only is sufficient when:**
- Simple, single-step operations
- Human is actively watching and testing
- Prototyping where speed > reliability

### Rationale

1. **Structured output enables reasoning**: JSON responses let agents make decisions based on actual data, not parsed text
2. **Deep validation catches async failures**: Twilio's async nature means 200 OK ≠ success; agents need to verify
3. **TDD enforcement at pipeline level**: MCP tools integrate with test-gen/dev pipeline for quality gates
4. **Self-verification reduces iterations**: Agent confirms success before asking human to review

### Consequences

- MCP tools are infrastructure, not the product (Feature Factory is the product)
- For simple use cases, the complexity isn't worth it—CLI is fine
- The real value emerges when autonomous pipelines use these tools
- Deep validation is the moat; without it, we'd just use CLI

### Status

**Accepted**

---

## Decision 16: File-Based Documentation Flywheel

### Context

The documentation flywheel (capture → promote → clear workflow) had hooks that ran at key checkpoints (subagent completion, commits, session end), but hook output to stdout/stderr didn't reach the agent's context. Reminders were generated but never acted upon because the agent never saw them.

### Problem

1. Hooks output to stderr which flashes in terminal but doesn't enter agent context
2. `learnings.md` hadn't been updated in 4+ sessions despite discoveries
3. Pure discipline-based reminders don't work without visibility

### Decision

**Replace stdout/stderr hook output with file-based communication.**

Hooks write to `pending-actions.md` → Agent reads file at key moments → File is cleared after actions addressed.

### Implementation

```
┌─────────────────┐     writes to      ┌──────────────────────┐
│ doc-update-check│ ──────────────────►│ pending-actions.md   │
│ session-summary │                    └──────────────────────┘
└─────────────────┘                              │
                                                 ▼ agent reads
                                       ┌──────────────────────┐
                                       │ Before git commits   │
                                       │ (per CLAUDE.md)      │
                                       └──────────────────────┘
```

**Changes:**
- `doc-update-check.sh` appends to `pending-actions.md` instead of stdout
- `pre-bash-validate.sh` displays file contents before commits
- `notify-ready.sh` tells the developer about pending action count in desktop notification
- `CLAUDE.md` instructs agent to read `pending-actions.md` before commits

### Rationale

1. **Files persist, stdout doesn't**: Writing to a file ensures reminders survive until addressed
2. **Agent can read files**: The Read tool works reliably; stderr output doesn't reach context
3. **Developer gets notification**: Desktop notification prompts review of pending actions
4. **Clear when done**: Removing the file signals completion, prevents stale reminders

### Alternatives Considered

- **Injecting into system reminders**: Not possible from hooks
- **Writing to a special hook output**: Claude Code doesn't have this mechanism
- **Relying on discipline**: Already proven not to work

### Consequences

- Documentation reminders now persist and are visible to agent
- Requires agent discipline to read file before commits (documented in CLAUDE.md)
- Developer sees pending count in notifications
- File-based communication pattern can be reused for other hook→agent communication

### Status

**Implemented**

---

## Decision 17: Three-Path Coordination Model

### Context

The project had two coordination paths: interactive slash commands (sequential, single session) and Feature Factory (headless, CI/CD). Both are sequential — agents work one at a time, passing results forward. This created pain points:

1. **Context bloat**: By phases 5-7, the orchestrator's context was overloaded with accumulated conversation
2. **Sequential bottleneck**: QA and review couldn't run in parallel
3. **No inter-agent discussion**: Agents couldn't challenge each other's findings
4. **SubagentStop timing**: Hook fired before implementation, not after

Claude Code Agent Teams (experimental) solve these by spawning multiple Claude Code instances that each get their own context window and can communicate via messaging and shared task lists.

### Decision

**Three coordination paths, each optimized for different use cases:**

| Path | Best For | Parallelism | Token Cost | Resumable? |
|------|----------|-------------|------------|------------|
| **Single session + subagents** | Simple features, routine work | Sequential | Lowest | Yes |
| **Agent Teams** | Bug debugging, code review, parallel review | Parallel | ~2-3x | No |
| **Feature Factory** | CI/CD, unattended, programmatic | Sequential | Medium | Yes |

### Rationale

1. **Each path optimizes for different constraints**: Subagents minimize tokens, teams maximize parallelism, Feature Factory enables automation
2. **Agent teams solve 4 of 7 documented pain points**: Context bloat, sequential bottleneck, no inter-agent discussion, SubagentStop timing
3. **No disruption to existing workflows**: Agent teams are additive — behind a feature flag, existing paths unchanged
4. **Strongest for adversarial workflows**: Bug-fix (competing hypotheses) and code-review (multi-lens) benefit most from inter-agent communication

### Alternatives Considered

- **Replace subagents entirely with teams**: Rejected — teams have higher token cost and no session resumption
- **Teams without quality gate hooks**: Rejected — teammates need same TDD/coverage enforcement as subagents
- **Feature Factory with parallel phases**: Rejected — SDK-based approach can't spawn CLI instances

### Consequences

- Users choose based on task complexity and token budget
- Higher token cost for team workflows (~2-3x)
- Experimental feature flag dependency (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`)
- No session resumption for teammates — tasks must complete in one session
- `TeammateIdle` and `TaskCompleted` hooks enforce quality gates for team members

### Status

**Implemented**

---

## Decision 18: Three-Layer Context Window Management

### Context

The Feature Factory orchestrator's agentic loop (`orchestrator.ts:runAgent()`) accumulates unbounded message history. Each turn pushes assistant responses and tool results onto the `messages` array with zero truncation or eviction. A single `npm test` Bash output can be 50-200KB (~12-50k tokens). After 8-10 test runs, the context exceeds the 200k token API limit and the agent crashes.

First observed during Phase 11.3 validation: dev agent failed at turn 32/60 with "prompt is too long: 213990 tokens > 200000 maximum". This blocked all long-running agents from completing multi-phase workflows.

### Decision

**Three-layer defense against context exhaustion:**

| Layer | Mechanism | When | Impact |
|-------|-----------|------|--------|
| **Layer 0** | Agent self-management prompts | Before context grows | Agents learn to read selectively, batch edits, run targeted tests |
| **Layer 1** | Tool output truncation | Per tool call | Caps individual outputs before they enter message history |
| **Layer 2** | Conversation history compaction | At 120k tokens (60%) | Evicts older turn-pairs, replaces with heuristic summary |

### Implementation

**Layer 0** — Context management sections added to dev, qa, test-gen, review system prompts. Agent-specific rules (e.g., dev: `tail -100` for test output; test-gen: write ALL tests before any verification run).

**Layer 1** — `truncateToolOutput()` with per-tool strategies:
- Bash: head/tail split (150 lines each, preserving errors and summaries)
- Read: middle truncation within char limit
- Grep: character cap keeping first matches
- Glob: path count cap (200)

**Layer 2** — `compactMessages()` triggered by `shouldCompact(inputTokensUsed)`:
- Always preserves `messages[0]` (initial prompt with task context)
- Always preserves last 8 turn-pairs (recent working context)
- Evicts middle messages, replaces with summary (tool names, file paths, test status)
- Summary appended to `messages[0]` to maintain user/assistant alternation

### Rationale

1. **Defense in depth**: Each layer catches what the previous misses
2. **Layer 0 is highest leverage**: Prevents context bloat at the source
3. **Layer 1 prevents any single tool from consuming excessive context**: A 200KB test output becomes 30KB
4. **Layer 2 handles long-tail accumulation**: Even with truncation, 40+ turns accumulate
5. **Pure functions, no side effects**: `context-manager.ts` is fully testable with hand-crafted `MessageParam[]`

### Alternatives Considered

- **Sliding window (drop oldest messages)**: Loses task context. Summary approach preserves key information.
- **LLM-generated summaries**: Would require an API call during compaction. Heuristic summaries are free and fast.
- **Reduce agent turn limits**: Symptom treatment, not cure. Some tasks genuinely need 40+ turns.

### Consequences

- Agents can now run indefinitely (turn limit, not token limit, is the binding constraint)
- Compaction loses detailed context from early turns (acceptable — recent work matters more)
- Verbose mode logs truncation and compaction events for debugging
- 23 unit tests cover all truncation strategies and compaction invariants

### Status

**Implemented** — Validated across 3 autonomous runs. Zero token crashes.

---

## Decision 19: Stall Detection Over Fixed Turn Limits

### Context

After context window management eliminated token crashes, fixed turn limits (`maxTurns: 40-60`) became the binding constraint. The dev agent used all 60 turns during autonomous validation — sometimes making real progress (TDD green loop), sometimes potentially stuck. Fixed turn limits can't distinguish between productive iteration and stalled loops.

Industry survey (15+ systems including SWE-Agent, OpenHands, Ralph, Aider, Codex) revealed that nobody relies on fixed turn limits as their primary guardrail. Instead, they use stall detection: tracking whether the agent is making progress and intervening only when it's stuck.

### Decision

**Replace fixed turn limits with stall detection as the primary agent loop guardrail.**

Detection signals (inspired by Ralph's circuit breaker and gantz.ai's action hashing):
- Same tool + same input called 3+ times → stall
- Alternating A-B-A-B pattern over 6+ calls → oscillation
- No file changes in last N turns → idle
- Same error message repeated → stuck loop

Response escalation:
1. First stall: inject "You appear stuck. Try a different approach." into context
2. Second stall with no progress: hard stop with diagnostic report

Fixed turn limits remain as a backstop (elevated to 200 in autonomous mode) but are not the primary control.

### Rationale

1. **Progress-aware**: A productive 80-turn session should continue; a stuck 20-turn session should stop
2. **Industry consensus**: No major autonomous coding system relies primarily on fixed turn limits
3. **Cost-effective**: Budget caps handle cost control; turn limits shouldn't duplicate that concern
4. **Better diagnostics**: Stall detection explains WHY it stopped, not just THAT it stopped

### Alternatives Considered

- **Just raise turn limits**: Doesn't solve the core problem — an agent can waste 200 turns just as easily as 60
- **Time-based limits only**: Doesn't distinguish productive work from busy-waiting
- **LLM-based progress assessment**: Too expensive — would add API calls per turn

### Consequences

- Agents can run longer when making progress (better completion rates)
- Stall interventions provide actionable feedback to the agent
- Requires tracking tool call history within `runAgent()` (new `StallDetector` class)
- Fixed turn limits become a safety net, not the primary control

### Status

**Accepted** — Implementation planned in Phase 12.2.

---

## Decision 20: Sandbox Mode for Autonomous Validation

### Context

Autonomous Feature Factory runs write files directly to the user's repository — test files, implementation code, CLAUDE.md files, postman collections, audit logs. During validation testing, this polluted the shipping repo with generated artifacts that had to be manually cleaned up after each run.

The `workingDirectory` config defaults to `process.cwd()`, which is the project root. There is no isolation between autonomous agent output and the real codebase.

### Decision

**Add sandbox mode that isolates autonomous runs in a temporary directory.**

Two-phase approach:
1. **Phase 1 (MVP)**: `--sandbox` flag creates a temp directory, clones/copies the repo, sets `workingDirectory` to the temp dir. Results copied back on explicit success.
2. **Phase 2 (future)**: Git worktree per session — lighter weight, shares `.git` database, agents work on isolated branches merged via PR review.

### Rationale

1. **Non-destructive validation**: Can run autonomous pipelines repeatedly without manual cleanup
2. **Rollback is free**: Delete the temp dir instead of reverting individual files
3. **CI/CD ready**: Autonomous runs in CI should never pollute the source checkout
4. **Industry standard**: Devin, OpenHands, Codex all use isolated environments by default

### Alternatives Considered

- **Docker containers**: Full isolation but heavyweight for a dev tool. Better suited for Phase 2/3.
- **Git stash/branch per run**: Lighter but still modifies the local repo.
- **Just `.gitignore` the output**: Doesn't prevent file conflicts or disk pollution.

### Consequences

- Autonomous validation runs become repeatable and safe
- Small overhead for initial clone/copy (acceptable for multi-minute workflows)
- Need to handle `.env` and credentials in the sandbox (copy or symlink)
- Git worktree approach in Phase 2 would be more efficient for large repos

### Status

**Accepted** — Implementation planned in Phase 12.1.

---

## Adding Your Own Decisions

When making architectural decisions:

1. **Add a new Decision section** with Context, Decision, Rationale, Alternatives, Consequences, Status
2. **Update the Changelog** with date, decision ID, and change summary
3. **If revisiting a decision**, update Status to "Superseded by Dxx" and add new decision

### Decision Template

```markdown
## Decision N: [Title]

### Context

[Describe the situation, problem, or need]

### Decision

**[Brief statement of the decision]**

### Rationale

1. [Reason 1]
2. [Reason 2]
3. [Reason 3]

### Alternatives Considered

- **[Alternative 1]**: [Why rejected]
- **[Alternative 2]**: [Why rejected]

### Consequences

- [Consequence 1]
- [Consequence 2]

### Status

**Accepted** - [Date]
```

---

## Changelog

| Date | Decision | Change |
|------|----------|--------|
| 2026-01-19 | D4 | Initial autonomy mode: highly supervised |
| 2026-01-19 | D7 | TDD enforcement confirmed |
| 2026-01-19 | D8 | Sync for agent state |
| 2026-01-19 | D9 | Cost budget caps defined |
| 2026-01-19 | D10 | No agents in real-time paths |
| 2026-01-20 | D1 | MCP as pure API wrapper |
| 2026-01-20 | D2 | Four-tier risk model |
| 2026-01-20 | D3 | Functions vs MCP clarified |
| 2026-01-20 | D5 | EOL/deprecated APIs excluded |
| 2026-01-20 | D6 | P0-P3 priority tiers |
| 2026-01-20 | D11 | Git rev-parse for hook paths |
| 2026-01-22 | D12 | Auto-setup script implemented |
| 2026-01-22 | D13 | Deep validation pattern implemented |
| 2026-01-23 | D14 | Git as source of truth for activity tracking |
| 2026-01-23 | D15 | MCP + Agent SDK value proposition documented |
| 2026-01-25 | D7 | TDD enforcement hook implemented |
| 2026-01-25 | D2 | Credential safety hook implemented |
| 2026-01-25 | D6 | P1 MCP tools complete (13 tools) |
| 2026-01-25 | D16 | File-based documentation flywheel implemented |
| 2026-02-10 | D17 | Three-path coordination model (subagents, agent teams, Feature Factory) |
| 2026-02-11 | D18 | Three-layer context window management (agent prompts, truncation, compaction) |
| 2026-02-11 | D19 | Stall detection over fixed turn limits (industry survey-informed) |
| 2026-02-11 | D20 | Sandbox mode for autonomous validation (temp dir isolation) |
