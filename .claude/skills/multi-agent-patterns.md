# Multi-Agent Patterns for Twilio

This skill describes orchestration and coordination patterns for Twilio development workflows.

## Pattern Overview

| Pattern | Best For | Twilio Use Case |
|---------|----------|-----------------|
| Orchestrator | Sequential flows | Feature development pipeline |
| Agent Teams | Parallel + adversarial | Bug debugging, code review, parallel QA |
| Peer-to-Peer | Parallel work | Debugging + fixing simultaneously |
| Hierarchical | Complex features | Multi-channel solutions |
| Evaluator | Quality gates | Code review with standards |
| TDD Pipeline | Code quality | Red → Green → Refactor |

## Cross-Cutting Concerns

### Human Approval Gates

The project operates in "Highly Supervised" autonomy mode. Human approval is required at key checkpoints:

```
architect → [APPROVAL] → spec → [APPROVAL] → test-gen → dev → qa → review → [APPROVAL] → docs
```

Approval gates pause execution until human confirms:
- Architecture decisions are sound
- Specifications are correct
- Code is ready for merge

### TDD Enforcement

All development workflows enforce Test-Driven Development via pre-phase hooks:

1. **test-gen** must create tests that **fail** initially (Red phase)
2. **tdd-enforcement hook** runs BEFORE dev phase and verifies:
   - Tests exist (`testsCreated > 0`)
   - Tests are FAILING
3. **dev** is blocked with `TDD VIOLATION` if tests pass or don't exist
4. **dev** implements minimal code to make tests pass (Green phase)
5. **review** validates TDD was followed

```typescript
// Pre-phase hooks in workflow definition
{
  agent: 'dev',
  name: 'TDD Green Phase',
  prePhaseHooks: ['tdd-enforcement'],  // Blocks if tests don't fail
}
```

See `.claude/skills/tdd-workflow.md` for detailed TDD patterns.

## Orchestrator Pattern (Default)

A central coordinator manages the workflow, invoking specialists in sequence.

### Structure

```
                    ┌─────────────┐
                    │ Orchestrator│
                    │ /orchestrate│
                    └──────┬──────┘
                           │
     ┌─────────┬───────────┼───────────┬─────────┐
     ▼         ▼           ▼           ▼         ▼
┌─────────┐ ┌─────┐ ┌──────────┐ ┌─────┐ ┌────────┐
│/architect│ │/spec│ │/test-gen │ │/dev │ │/review │
└─────────┘ └─────┘ └──────────┘ └─────┘ └────────┘
```

### When to Use

- New feature development (sequential phases)
- Bug fixes (diagnose → test → fix → verify)
- Refactoring (test → change → test)

### Twilio Example: New Voice Feature

```
/orchestrate new-feature "Add voicemail recording"

Phase 1: /architect
  → Design: functions/voice/voicemail.protected.js
  → Pattern: Record verb with callback

Phase 2: /spec
  → Input: CallSid, RecordingUrl
  → Output: TwiML with Record, callback handling

Phase 3: /test-gen
  → Unit tests for TwiML generation
  → Integration test for recording callback

Phase 4: /dev
  → Implement voicemail.protected.js
  → Make tests pass

Phase 5: /review
  → Security: Protected endpoint ✓
  → Patterns: Matches voice/CLAUDE.md ✓

Phase 6: /test
  → All tests passing ✓
```

### Handoff Protocol

Each agent passes structured context to the next:

```markdown
## Handoff: /architect → /spec

Files identified:
- functions/voice/voicemail.protected.js (create)
- __tests__/unit/voice/voicemail.test.js (create)

Architecture decisions:
- Use Record verb with transcribe=true
- Store recordings via callback to /voice/recording-complete
- Protected endpoint (requires Twilio signature)

Ready for: Detailed specification
```

## Peer-to-Peer Pattern

Agents work in parallel on related but independent tasks. For true parallel coordination with inter-agent messaging, see [Agent Teams Pattern](#agent-teams-pattern) above.

### Structure

```
        ┌─────────────┐
        │    User     │
        └──────┬──────┘
               │
       ┌───────┴───────┐
       ▼               ▼
  ┌─────────┐    ┌─────────┐
  │ Agent A │◄──►│ Agent B │
  └─────────┘    └─────────┘
```

### When to Use

- Debugging (analyze logs while reviewing code)
- Multi-file changes (update function + tests simultaneously)
- Documentation (code + docs in parallel)

### Twilio Example: Debugging SMS Failure

```
Parallel agents:

Agent A: /twilio-logs
  → Analyzing debugger for error 30003
  → Found: Unreachable destination +1555...

Agent B: /dev (investigating)
  → Reading send-sms.protected.js
  → Found: No validation on 'to' parameter

Sync point:
  → Root cause: Invalid phone number passed through
  → Fix: Add E.164 validation before API call
```

### Coordination Mechanism

Agents share findings through explicit sync points:

```markdown
## Sync: Debug Analysis Complete

Agent A findings:
- Error 30003: Unreachable destination
- 5 failures in last hour
- All to same number pattern

Agent B findings:
- No input validation in send-sms
- Phone number from user input without sanitization

Combined insight:
- Need E.164 validation before Twilio API call
- Add test for invalid phone number handling
```

## Hierarchical Pattern

A lead agent delegates to sub-agents, which may further delegate.

### Structure

```
              ┌──────────────┐
              │  Lead Agent  │
              │  /architect  │
              └───────┬──────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │  Voice  │   │   SMS   │   │ Verify  │
   │  Team   │   │  Team   │   │  Team   │
   └────┬────┘   └────┬────┘   └────┬────┘
        │             │             │
     ┌──┴──┐       ┌──┴──┐       ┌──┴──┐
     ▼     ▼       ▼     ▼       ▼     ▼
   /spec  /dev   /spec  /dev   /spec  /dev
```

### When to Use

- Multi-channel features (voice + SMS + web)
- Large refactoring (multiple subsystems)
- Complex IVR with nested menus

### Twilio Example: Multi-Channel Notification System

```
Lead: /architect "Build notification system with voice, SMS, and email fallback"

Delegation:
├── Voice Team
│   ├── /spec voice notification (call + TTS)
│   └── /dev functions/voice/notify.protected.js
│
├── SMS Team
│   ├── /spec SMS notification
│   └── /dev functions/messaging/notify.protected.js
│
└── Orchestration Team
    ├── /spec fallback logic (voice → SMS → email)
    └── /dev functions/helpers/notify-orchestrator.private.js

Rollup:
- Each team reports completion + test status
- Lead verifies integration
- Final /review of complete system
```

### Supervision Protocol

Lead agent maintains oversight:

```markdown
## Status: Multi-Channel Notification

Voice Team: COMPLETE
- notify-voice.protected.js ✓
- Tests passing ✓

SMS Team: IN_PROGRESS
- notify-sms.protected.js ✓
- Tests: 1 failing (rate limit handling)

Verify Team: BLOCKED
- Waiting on SMS team completion

Lead action: Assist SMS team with rate limit test
```

## Evaluator Pattern

An evaluator agent assesses work quality against standards.

### Structure

```
┌─────────┐     ┌───────────┐     ┌──────────┐
│Producer │────►│ Evaluator │────►│ Decision │
│  /dev   │     │  /review  │     │PASS/FAIL │
└─────────┘     └───────────┘     └──────────┘
                      │
                      ▼
               ┌────────────┐
               │ Feedback   │
               │ Loop       │
               └────────────┘
```

### When to Use

- Code review gates
- Security audits
- TDD verification (tests must fail first)

### Twilio Example: Code Review Gate

```
/review functions/voice/transfer-call.protected.js

Evaluation criteria (from CLAUDE.md):

□ ABOUTME comments present
  ✓ Line 1-2: Descriptive ABOUTME

□ No hardcoded credentials
  ✓ Uses context.TWILIO_ACCOUNT_SID

□ Error handling present
  ✓ Validates 'to' parameter
  ✗ Missing try/catch around client call

□ Protected endpoint for sensitive operations
  ✓ .protected.js suffix

□ Tests exist and pass
  ✓ 4 unit tests passing

Verdict: NEEDS_CHANGES
Reason: Add try/catch for Twilio API call
```

## Agent Teams Pattern

Real parallel coordination with inter-agent messaging. Unlike subagents (which share the parent's context and can only report back), teammates have their own context windows and communicate directly with each other.

### Structure

```
              ┌──────────────┐
              │   Lead Agent │
              │  (delegate   │
              │    mode)     │
              └───────┬──────┘
                      │ shared task list
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐
   │Teammate │◄►│Teammate │◄►│Teammate │
   │    A    │  │    B    │  │    C    │
   └─────────┘  └─────────┘  └─────────┘
        ◄── direct messaging ──►
```

### When to Use

- Bug debugging with competing hypotheses (3 investigators challenge each other)
- Multi-lens code review (security + performance + tests in parallel)
- Parallel QA + review after implementation
- Cross-layer changes (functions + agents + config)

### Comparison: Subagents vs Agent Teams vs Feature Factory

| Aspect | Subagents | Agent Teams | Feature Factory |
|--------|-----------|-------------|-----------------|
| **Context** | Shared with parent | Own window per teammate | Own SDK session |
| **Communication** | Return results to caller | Message each other + shared tasks | Phase handoffs |
| **Parallelism** | Sequential | Parallel | Sequential |
| **Token cost** | Lowest | ~2-3x | Medium |
| **Resumable** | Yes | No | Yes |
| **Best for** | Sequential workflows | Adversarial/parallel work | CI/CD automation |

### Twilio Example: Bug Fix with Competing Hypotheses

```
/team bug-fix "SMS webhook returning 500 for empty body"

Parallel investigators:

Teammate "code-tracer":
  → Reading send-sms.protected.js
  → Found: No body validation, crashes on undefined
  → Confidence: HIGH

Teammate "log-analyst":
  → Checking debugger for error 11200
  → Found: 500 errors from /messaging/send-sms endpoint
  → Confirms code-tracer's finding

Teammate "config-checker":
  → Checking webhook config, env vars
  → All correct — rules out configuration issue
  → Supports code-level root cause

Lead synthesis:
  → Root cause: Missing body validation
  → Fix: Add null check before Twilio API call
  → Regression test: Empty body should return 400, not 500
```

### Quality Gates

Teammates are subject to `TeammateIdle` and `TaskCompleted` hooks:
- test-gen tasks: Tests must exist AND fail
- dev tasks: Tests must pass + lint clean
- qa tasks: Coverage >= 80%
- All tasks: No hardcoded credentials

## Pattern Selection Guide

```
Is work sequential with clear phases?
├── Yes → Orchestrator Pattern
│         Use /orchestrate command
│
└── No → Do agents need to discuss findings?
         ├── Yes → Agent Teams Pattern
         │         Use /team command
         │
         └── No → Can tasks run independently?
                  ├── Yes → Peer-to-Peer Pattern
                  │         Run multiple commands in parallel
                  │
                  └── No → Is there natural hierarchy?
                           ├── Yes → Hierarchical Pattern
                           │         Lead agent delegates to teams
                           │
                           └── No → Evaluator Pattern
                                     Quality gate with feedback loop
```

## Twilio-Specific Considerations

### Webhook Chains = Orchestrator

Twilio webhooks naturally follow orchestrator pattern:

```
Incoming Call → IVR Menu → Gather Input → Route Call → Record → Hangup
     │              │            │            │           │
     ▼              ▼            ▼            ▼           ▼
  Handler 1    Handler 2    Handler 3    Handler 4   Handler 5
```

Each handler is a function that passes control to the next via TwiML action URLs.

### Real-Time Features = Peer Pattern

ConversationRelay and real-time features benefit from peer coordination:

```
┌─────────────────┐     ┌─────────────────┐
│  Voice Handler  │◄───►│  WebSocket AI   │
│  (TwiML setup)  │     │  (LLM backend)  │
└─────────────────┘     └─────────────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
              ┌─────────────┐
              │ Shared State│
              │  (context)  │
              └─────────────┘
```

### Multi-Channel = Hierarchical

Voice + SMS + Verify solutions need hierarchical coordination:

```
User Verification Flow
├── Channel Selection (Lead)
│   ├── Voice: Call with OTP
│   ├── SMS: Text with code
│   └── Email: Link with token
└── Verification Check (Shared)
```
