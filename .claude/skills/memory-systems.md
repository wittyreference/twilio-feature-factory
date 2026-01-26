# Memory Systems for Twilio Prototypes

This skill covers state tracking and memory management for Twilio development sessions.

## Memory Types

| Memory Type | Scope | Duration | Storage |
|-------------|-------|----------|---------|
| Session | Current conversation | Until session ends | In-context |
| Project | Across sessions | Persistent | Files (CLAUDE.md, git) |
| Call/Message | Per interaction | Until call/message ends | Twilio + logs |
| Workflow | Per feature/task | Until task complete | Todo list, commits |

## Session Memory (In-Context)

Track progress within the current Claude Code session.

### What to Track

- Current task/feature being built
- Files created or modified
- Tests written and their status
- Key decisions made
- Blockers encountered

### Session Summary Format

Maintain a mental summary after each major action:

```markdown
## Session: Voice IVR Feature

### Completed
- [x] Created functions/voice/ivr-menu.js
- [x] Added 3-option menu (sales, support, billing)
- [x] Unit tests passing (4/4)

### In Progress
- [ ] Integration test for full flow

### Decisions Made
- Using Polly.Amy voice for consistency
- DTMF-only input (no speech) for reliability
- Action URLs use relative paths

### Files Modified
- functions/voice/ivr-menu.js (new)
- functions/voice/ivr-handler.protected.js (new)
- __tests__/unit/voice/ivr-menu.test.js (new)

### Next Steps
- Write integration test
- Run /review for approval
```

### When to Update Session Memory

- After completing a file
- After tests pass/fail
- After making an architectural decision
- Before switching to a different task
- When resuming after interruption

## Project Memory (Persistent)

Information that persists across sessions via files and Twilio Sync.

### Twilio Sync for Agent State (D8)

Use Twilio Sync Documents for state that needs to persist across webhook invocations or sessions:

```javascript
// Store agent state
const syncService = client.sync.v1.services(context.SYNC_SERVICE_SID);
await syncService.documents.create({
  uniqueName: `agent-state-${sessionId}`,
  data: {
    workflowPhase: 'dev',
    testsWritten: ['unit/voice.test.js'],
    decisions: ['Use Conference for warm transfer'],
    lastUpdated: new Date().toISOString()
  },
  ttl: 86400  // 24hr TTL for ephemeral state
});

// Retrieve state
const doc = await syncService.documents(`agent-state-${sessionId}`).fetch();
const state = doc.data;
```

**When to use Sync vs files:**

| Storage | Use When |
|---------|----------|
| Sync Documents | Webhook state, cross-function sharing, real-time updates |
| Git/files | Code, configuration, permanent documentation |
| In-context | Current session only, will be lost on restart |

### CLAUDE.md as Project Memory

Root CLAUDE.md stores:
- Project standards and conventions
- Available commands and workflows
- Environment variable requirements
- Testing requirements

Subdirectory CLAUDE.md stores:
- API-specific patterns
- TwiML examples
- Webhook parameter references
- Common error codes

### Git History as Memory

```bash
# Recent decisions
git log --oneline -10

# What changed for a feature
git log --oneline --grep="voice IVR"

# Files touched recently
git diff --name-only HEAD~5
```

### Todo.md as Task Memory

```markdown
# Project Todo

## In Progress
- [ ] Voice IVR menu (MC)

## Pending
- [ ] SMS keyword routing
- [ ] Verify 2FA flow

## Completed
- [x] Initial project setup
- [x] Voice incoming-call handler
- [x] Messaging incoming-sms handler
```

## Call/Message State Memory

Track state across Twilio webhook invocations.

### The Challenge

Twilio webhooks are stateless. Each request is independent:

```
Call 1: /voice/incoming-call
  ↓ (new HTTP request)
Call 2: /voice/gather-handler
  ↓ (new HTTP request)
Call 3: /voice/transfer
```

### State Tracking Patterns

**Pattern 1: URL Parameters**

Pass state in TwiML action URLs:

```javascript
// In incoming-call.js
twiml.gather({
  action: `/voice/menu-handler?attempt=1&caller=${encodeURIComponent(event.From)}`,
  numDigits: 1
});

// In menu-handler.js
const attempt = parseInt(event.attempt, 10) || 1;
const caller = event.caller;

if (attempt >= 3) {
  // Max retries reached
}
```

**Pattern 2: Twilio Sync**

Use Sync for complex state:

```javascript
// Store state
const syncService = await client.sync.v1.services(context.SYNC_SERVICE_SID);
await syncService.documents.create({
  uniqueName: `call-${event.CallSid}`,
  data: {
    stage: 'menu',
    selections: [],
    startTime: new Date().toISOString()
  }
});

// Retrieve state
const doc = await syncService.documents(`call-${event.CallSid}`).fetch();
const callState = doc.data;
```

**Pattern 3: Session Cookies**

Use Twilio's built-in cookie support:

```javascript
// Set cookie
const response = new Twilio.Response();
response.setCookie('menu_selection', '2');
response.appendHeader('Content-Type', 'text/xml');
response.setBody(twiml.toString());

// Read cookie (in next request)
const previousSelection = event.menu_selection;
```

### State Logging for Debugging

Log state transitions for debugging:

```javascript
// ABOUTME: Logs call state transitions for debugging.
// ABOUTME: Append-only log pattern for call flow tracing.

const logStateTransition = (callSid, fromState, toState, data) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    callSid,
    transition: `${fromState} → ${toState}`,
    data
  }));
};

// Usage
logStateTransition(event.CallSid, 'menu', 'transfer', { digit: event.Digits });
```

## Workflow Memory

Track progress through development workflows.

### Git as Source of Truth (D14)

Per project design decisions, git history is the primary activity log:
- Commits capture what changed and why
- `todo.md` captures session progress
- `learnings.md` captures discoveries (capture → promote → clear)
- `DESIGN_DECISIONS.md` captures architectural rationale

```bash
# What was done recently
git log --oneline -10

# What files changed for a feature
git log --name-only --oneline --grep="voice IVR"

# Diff since last tag/checkpoint
git diff HEAD~5 --name-only
```

### Documentation Flywheel (D16)

The documentation flywheel uses file-based communication:
- Hooks write suggestions to `.claude-dev/pending-actions.md`
- Agent reads file before commits
- File is cleared after actions addressed

```
Hook runs → pending-actions.md → Agent reads → Takes action → Clears file
```

### Workflow State Tracking

For orchestrated workflows, track phase completion:

```markdown
## Workflow: new-feature "Voice IVR"

Status: IN_PROGRESS

### Phase History
| Phase | Agent | Status | Timestamp |
|-------|-------|--------|-----------|
| 1 | /architect | COMPLETE | 10:23 |
| 2 | /spec | COMPLETE | 10:35 |
| 3 | /test-gen | COMPLETE | 10:52 |
| 4 | /dev | IN_PROGRESS | 11:05 |

### Artifacts Created
- spec.md (phase 2)
- __tests__/unit/voice/ivr.test.js (phase 3)
- functions/voice/ivr.js (phase 4, in progress)

### Blockers
- None

### Decisions Log
- Phase 1: Chose orchestrator pattern
- Phase 2: DTMF-only, 3 options
- Phase 3: 6 test cases defined
```

## Memory Anti-Patterns

### Don't Store

- Full webhook payloads (too large)
- Passing test output (no longer relevant)
- Resolved error messages
- Old file versions (git handles this)

### Don't Repeat

- Information already in CLAUDE.md
- Standard Twilio API signatures
- Boilerplate patterns
- Previously stated decisions

### Don't Persist

- Session-specific debugging info
- Temporary workarounds
- One-time configuration steps

## Memory Retrieval Patterns

### "What did we decide about X?"

```bash
# Search git commits
git log --all --oneline --grep="X"

# Search CLAUDE.md files
grep -r "X" --include="CLAUDE.md" .
```

### "What files did we change for feature Y?"

```bash
# If committed
git log --name-only --oneline --grep="Y"

# If in progress
git status
```

### "What was the error we fixed?"

```bash
# Check recent test changes
git diff HEAD~3 __tests__/

# Check Twilio logs
twilio debugger:logs:list --limit 10
```

## Implementation Checklist

For new Twilio features, track:

- [ ] Requirements understood
- [ ] Architecture decided
- [ ] Tests written (failing)
- [ ] Implementation complete (tests passing)
- [ ] Code reviewed
- [ ] Documentation updated
- [ ] Committed to git

This checklist serves as memory of what's done and what remains.
