# Feature Factory

Autonomous Twilio feature development orchestrator using Claude Agent SDK.

## Purpose

The Feature Factory coordinates specialized subagents in TDD-enforced development pipelines:

```
Developer: "Add SMS verification to user signup"
    ↓
Feature Factory Pipeline:
    architect → spec → test-gen → dev → qa → review → docs
    ↓
Ready for deployment (human approved at checkpoints)
```

## Architecture

```
src/
├── index.ts              # Main entry point, exports
├── orchestrator.ts       # Workflow coordinator with agentic loop
├── config.ts             # Cost limits, model selection
├── types.ts              # TypeScript type definitions
├── cli.ts                # CLI interface
├── session.ts            # Session persistence for workflow resumption
├── sandbox.ts            # Sandbox lifecycle (create, copy-back, cleanup)
├── tools.ts              # Core tool implementations (Read, Write, Edit, etc.)
├── mcp-tools.ts          # MCP tool integration (Twilio APIs)
├── agents/               # Subagent configurations
│   ├── architect.ts      # Design review, pattern selection
│   ├── spec.ts           # Detailed specifications
│   ├── test-gen.ts       # TDD Red Phase (failing tests)
│   ├── dev.ts            # TDD Green Phase (implementation)
│   ├── qa.ts             # Test execution, coverage, security
│   ├── review.ts         # Code review, security audit
│   └── docs.ts           # Documentation updates
├── workflows/            # Pipeline definitions
│   ├── new-feature.ts    # Full TDD pipeline for new features
│   ├── bug-fix.ts        # Diagnosis and fix pipeline
│   └── refactor.ts       # Safe refactoring pipeline
├── hooks/                # Pre-phase quality gates
│   ├── index.ts          # Hook registry and execution
│   ├── tdd-enforcement.ts # Verifies tests exist and FAIL before dev
│   ├── coverage-threshold.ts # Enforces 80% coverage before QA
│   └── test-passing-enforcement.ts # Verifies all tests PASS (refactor safety)
├── checkpoints.ts        # Git checkpoint tags for phase rollback
├── stall-detection.ts    # Stuck agent detection (repetition, oscillation, idle)
├── discovery/            # Autonomous work discovery
│   ├── index.ts          # Exports
│   ├── work-discovery.ts # Work item types and priority classification
│   └── work-poller.ts    # Event-driven work queue from validation failures
├── metrics/              # Process metrics collection
│   ├── index.ts          # Exports
│   └── process-metrics.ts # Timing, quality, learning metrics
└── verification/         # Replay verification
    ├── index.ts          # Exports
    └── replay-verifier.ts # Validates learnings improve performance
```

## Subagent Roles

| Agent | Role | Tools | Approval |
|-------|------|-------|----------|
| **architect** | Design review, pattern selection | Read, Glob, Grep | Yes |
| **spec** | Detailed specifications | Read, Glob, Grep, Write | Yes |
| **test-gen** | Write failing tests (TDD Red) | Read, Glob, Write, Bash | No |
| **dev** | Implement to pass tests (TDD Green) | Read, Write, Edit, Bash | No |
| **qa** | Test execution, coverage, security | Read, Glob, Grep, Bash | No |
| **review** | Code review, security audit | Read, Glob, Grep | Yes |
| **docs** | Documentation updates | Read, Write, Edit | No |

## Workflows

### new-feature

Full TDD pipeline for new Twilio features:

1. **architect** - Evaluates architecture fit, selects patterns
2. **spec** - Creates detailed specification with test scenarios
3. **test-gen** - Writes failing tests (must fail initially)
4. **dev** - Implements minimal code to pass tests
5. **qa** - Test execution, coverage analysis, security scanning
6. **review** - Validates code quality and security
7. **docs** - Updates documentation

Human approval required after: architect, spec, review

### bug-fix

Diagnosis and fix pipeline for existing bugs:

1. **architect** - Root cause diagnosis and analysis
2. **test-gen** - Writes regression tests that reproduce the bug (must FAIL)
3. **dev** - Minimal fix to pass tests (TDD Green Phase)
4. **review** - Validates fix is correct and minimal
5. **qa** - Ensures no unintended side effects (regression check)

Human approval required after: architect, review

Key differences from new-feature:
- No spec phase (scope is the bug itself)
- Architect does diagnosis, not design
- Focus on minimal, targeted changes

### refactor

Safe refactoring pipeline that preserves behavior:

1. **qa** (baseline) - Verifies all tests PASS before starting
2. **architect** - Reviews refactoring rationale and scope
3. **dev** - Implements refactoring, keeps tests green
4. **review** - Validates code quality improvement
5. **qa** (final) - Confirms no regressions

Human approval required after: architect, review

Key differences from new-feature:
- Tests must PASS throughout (not TDD red-green)
- No test-gen phase (uses existing tests as safety baseline)
- `test-passing-enforcement` hook at multiple phases

## Configuration

```typescript
interface FeatureFactoryConfig {
  maxBudgetUsd: number;        // Default: $5.00 (autonomous: $50)
  maxTurnsPerAgent: number;    // Default: 50 (autonomous: 200)
  maxRetriesPerPhase: number;       // Default: 1 (autonomous: 2)
  maxDurationMsPerAgent: number;    // Default: 5min (autonomous: 10min)
  maxDurationMsPerWorkflow: number; // Default: 30min (autonomous: 60min)
  defaultModel: 'sonnet' | 'opus' | 'haiku';
  approvalMode: 'after-each-phase' | 'at-end' | 'none';
  twilioMcpEnabled: boolean;
  deepValidationEnabled: boolean;
  autonomousMode: AutonomousModeConfig;  // Optional, for unattended operation
  contextWindow?: Partial<ContextManagerConfig>;  // Optional, context management overrides
  stallDetection?: Partial<StallDetectionConfig>; // Optional, stall detection overrides
  sandbox?: {                  // Optional, isolated execution environment
    enabled: boolean;
    sourceDirectory?: string;
  };
}
```

## Context Window Management

Long-running agents accumulate tool output in their message history. Without management, this exceeds the 200k token API limit after ~30 turns. Three-layer defense prevents this:

| Layer | Mechanism | Module |
|-------|-----------|--------|
| **Layer 0** | Agent self-management prompts | Agent system prompts in `src/agents/` |
| **Layer 1** | Tool output truncation | `src/context-manager.ts` → `truncateToolOutput()` |
| **Layer 2** | Conversation history compaction | `src/context-manager.ts` → `compactMessages()` |

### Defaults

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `bashOutputMaxChars` | 30,000 | ~7.5k tokens. Head/tail split preserves errors and summaries. |
| `readOutputMaxChars` | 40,000 | ~10k tokens. Middle truncation. |
| `grepOutputMaxChars` | 20,000 | ~5k tokens. First matches kept. |
| `globMaxPaths` | 200 | Path count cap. |
| `compactionThresholdTokens` | 120,000 | 60% of 200k. Triggers history eviction. |
| `keepRecentTurnPairs` | 8 | 16 messages preserved during compaction. |

Override via config or env var `FEATURE_FACTORY_CONTEXT_COMPACTION_THRESHOLD`.

## Autonomous Mode

Autonomous mode enables unattended operation for CI/CD pipelines or when you want to start a task and return later to completed work.

### What Changes

| Aspect | Normal Mode | Autonomous Mode |
|--------|-------------|-----------------|
| Phase approval prompts | Required after architect, spec, review | Auto-approved |
| Budget limit | $5.00 default | $50.00 (`--budget unlimited` for Infinity) |
| Max turns/agent | 50 default | 200 |
| Time limit/agent | 5 min | 10 min |
| Time limit/workflow | 30 min | 60 min |
| Sandbox isolation | Off (opt-in with `--sandbox`) | **On by default** (opt-out with `--no-sandbox`) |
| Quality gates | Enforced | **Still enforced** |

### Quality Gates (Always Enforced)

Even in autonomous mode, these gates are **never bypassed**:

- **TDD enforcement**: Tests must fail first (Red), then pass (Green)
- **Linting**: Must pass
- **Coverage**: 80% threshold
- **Credential safety**: Secrets never committed
- **Documentation flywheel**: Learnings captured
- **Git safety**: No `--no-verify`, no force push

### Enabling Autonomous Mode

**Interactive (CLI):**
```bash
npx feature-factory new-feature "Add voice AI" --dangerously-autonomous
```

Displays warning box, requires typing `I ACKNOWLEDGE THE RISKS`.

**CI/CD (Environment):**
```bash
FEATURE_FACTORY_AUTONOMOUS=true \
FEATURE_FACTORY_AUTONOMOUS_ACKNOWLEDGED=true \
npx feature-factory new-feature "Add voice AI"
```

### Session Summary

When autonomous mode completes, you receive a comprehensive summary:

- Duration and cost
- Phases completed
- Test results (unit, integration, coverage, lint)
- Files created/modified
- Learnings captured (`.claude/learnings.md`)
- Recommended actions (`.claude/pending-actions.md`)
- Audit log path (`.feature-factory/autonomous-*.log`)

### Audit Logging

All autonomous sessions are logged to `.feature-factory/autonomous-<sessionId>.log` with timestamps for every phase start, completion, and error.

## Sandbox Mode

Sandbox mode isolates workflow execution in a temporary directory, preventing autonomous runs from polluting the user's shipping repo. Results are copied back only on successful completion.

### How It Works

```
Source repo (user's cwd)
    │
    ├── git clone --local ──► Temp sandbox directory
    │                            ├── Hard-linked .git/objects (fast, space-efficient)
    │                            ├── Real working tree copies
    │                            └── Symlinked node_modules → source
    │
    │   Workflow runs entirely in sandbox...
    │
    ├── On success: changed files copied back ◄── sandbox
    └── Sandbox directory removed (always, even on failure/SIGINT)
```

### Enabling Sandbox Mode

```bash
# Explicit opt-in (any workflow)
npx feature-factory new-feature "Add voice AI" --sandbox

# Automatic with autonomous mode
npx feature-factory new-feature "Add voice AI" --dangerously-autonomous
# sandbox is ON by default ↑

# Override: autonomous without sandbox
npx feature-factory new-feature "Add voice AI" --dangerously-autonomous --no-sandbox
```

### Prerequisites

- Source directory must be a **git repository**
- Working tree must be **clean** (no uncommitted changes). The CLI will error with a file list and instructions to commit or stash if dirty.

### What Gets Copied Back

On successful workflow completion, these files are copied from sandbox to source:
- **Committed changes** since sandbox creation (`git diff --name-only <start>..HEAD`)
- **Uncommitted modified files** (`git diff --name-only`)
- **New untracked files** (`git ls-files --others --exclude-standard`)

Skipped:
- `.feature-factory/sessions/` — session data stays in sandbox

On failure, nothing is copied. The sandbox is cleaned up either way.

### Path Escape Prevention

When sandbox is active, all file tool operations (Read, Write, Edit, Glob, Grep) are validated against the sandbox boundary. Any path that resolves outside the sandbox directory triggers a `SANDBOX VIOLATION` error. This catches:
- Absolute paths outside the sandbox (e.g., `/etc/hosts`)
- Relative traversal (e.g., `../../etc/passwd`)

### Implementation Details

| Aspect | Detail |
|--------|--------|
| Clone method | `git clone --local` — hard-links immutable git objects, fast and space-efficient |
| node_modules | Symlinked from source. If source has none and `package.json` exists, falls back to `npm install` |
| Signal handling | SIGINT/SIGTERM handlers ensure cleanup runs if process is interrupted |
| Config field | `sandbox: { enabled: boolean; sourceDirectory?: string }` |
| ToolContext field | `sandboxBoundary?: string` — when set, `resolvePath()` enforces containment |
| Module | `src/sandbox.ts` — `createSandbox()`, `copyResultsBack()`, `cleanupSandbox()`, `ensureCleanWorkingTree()` |

### Programmatic Usage

```typescript
import { createSandbox, copyResultsBack, cleanupSandbox } from '@twilio-feature-factory/feature-factory';

const sandbox = await createSandbox({
  sourceDirectory: '/path/to/repo',
  verbose: true,
});

try {
  // Run workflow with sandbox.sandboxDirectory as workingDirectory
  // ...

  // On success, copy results back
  const result = await copyResultsBack(sandbox);
  console.log('Copied:', result.filesCopied);
  console.log('Skipped:', result.skipped);
} finally {
  await cleanupSandbox(sandbox.sandboxDirectory);
}
```

## CLI Usage

```bash
# Run new feature pipeline
npx feature-factory new-feature "Add SMS verification to signup"

# Run bug-fix pipeline
npx feature-factory bug-fix "Fix timeout error in verification flow"

# Run refactor pipeline
npx feature-factory refactor "Extract shared validation logic into utility module"

# With options
npx feature-factory new-feature "Add call recording" \
  --budget 10.00 \
  --no-approval

# Run in sandbox (isolated temp directory)
npx feature-factory new-feature "Add call recording" --sandbox

# Fully autonomous (no prompts, no limits, sandbox on by default)
npx feature-factory new-feature "Add voice AI" --dangerously-autonomous

# Autonomous without sandbox
npx feature-factory new-feature "Add voice AI" --dangerously-autonomous --no-sandbox

# Check status of recent workflows
npx feature-factory status
npx feature-factory status --all    # Show all sessions

# Resume a paused workflow
npx feature-factory resume          # Auto-select most recent resumable
npx feature-factory resume <sessionId>

# Session management
npx feature-factory sessions list
npx feature-factory sessions cleanup --days 7
npx feature-factory sessions cleanup --days 7 --include-failed
```

## Integration with Twilio MCP

The Feature Factory uses our Twilio MCP server for:

1. **Self-verification**: Agents invoke MCP tools to test generated code
2. **Deep validation**: Beyond 200 OK - checks debugger alerts, callbacks, insights
3. **Error analysis**: Query debugger logs when tests fail

```typescript
// Example: dev agent verifies SMS sending works
const result = await mcpTools.send_sms({
  to: testPhoneNumber,
  body: 'Test message from Feature Factory'
});

const validation = await deepValidator.validateMessage(result.sid, {
  waitForTerminal: true
});

if (!validation.success) {
  // Report specific errors to orchestrator
}
```

## TDD Enforcement

The pipeline enforces Test-Driven Development via pre-phase hooks:

1. **test-gen** must create tests that **fail** initially
2. **tdd-enforcement hook** runs BEFORE dev phase and verifies:
   - test-gen phase completed successfully
   - Tests were created (`testsCreated > 0`)
   - Tests are FAILING (Red phase requirement)
3. **dev** is blocked with `TDD VIOLATION` error if tests pass or don't exist
4. **dev** commits only when tests pass
5. **review** validates TDD was followed

## Refactor Safety

The refactor workflow uses `test-passing-enforcement` to ensure behavior preservation:

1. **test-passing-enforcement hook** verifies ALL tests pass before proceeding
2. Runs at multiple checkpoints: baseline, after implementation, final verification
3. Blocks with `REFACTOR SAFETY VIOLATION` if any test fails
4. Ensures the refactoring doesn't break existing functionality

### Pre-Phase Hooks

Workflow phases can specify `prePhaseHooks` that run before the agent starts:

```typescript
// TDD: Tests must FAIL before implementation
{
  agent: 'dev',
  name: 'TDD Green Phase',
  prePhaseHooks: ['tdd-enforcement'],  // Blocks if tests don't fail
}

// Refactor: Tests must PASS throughout
{
  agent: 'dev',
  name: 'Refactor Implementation',
  prePhaseHooks: ['test-passing-enforcement'],  // Blocks if tests fail
}
```

Hook failures emit `workflow-error` events and stop the workflow.

### Available Hooks

| Hook | Purpose | Used By |
|------|---------|---------|
| `tdd-enforcement` | Verifies tests FAIL before dev (TDD Red Phase) | new-feature, bug-fix |
| `coverage-threshold` | Enforces 80% coverage | new-feature |
| `test-passing-enforcement` | Verifies tests PASS (behavior preservation) | refactor |

## Credential Safety

All Write and Edit operations are validated for hardcoded Twilio credentials:

| Pattern | Detects | Suggestion |
|---------|---------|------------|
| `AC[a-f0-9]{32}` | Account SID | Use `process.env.TWILIO_ACCOUNT_SID` |
| `SK[a-f0-9]{32}` | API Key SID | Use `process.env.TWILIO_API_KEY` |
| `authToken = "[32-char]"` | Auth Token | Use `process.env.TWILIO_AUTH_TOKEN` |
| `apiSecret = "[32-char]"` | API Secret | Use `process.env.TWILIO_API_SECRET` |

Validation is **skipped** for:
- Test files (`*.test.ts`, `*.spec.js`, `__tests__/`)
- Documentation (`*.md`, `docs/`)
- Environment examples (`.env.example`, `.env.sample`)

## Cost Controls

| Control | Default | Autonomous | Purpose |
|---------|---------|------------|---------|
| `maxBudgetUsd` | $5.00 | $50.00 | Total budget per feature |
| `maxTurnsPerAgent` | 50 | 200 | Prevent infinite loops |
| `maxDurationMsPerAgent` | 5 min | 10 min | Per-agent time limit |
| `maxRetriesPerPhase` | 1 | 2 | Retry failed phases with feedback |
| `maxDurationMsPerWorkflow` | 30 min | 60 min | Per-workflow time limit |
| `approvalMode` | after-each-phase | none | Human checkpoints |

Use `--budget unlimited` to set Infinity budget (explicit opt-in only).

## Stall Detection

Agents can get stuck in unproductive loops — reading the same file repeatedly, oscillating between two approaches, or spinning without writing code. Stall detection replaces blunt turn limits with behavioral analysis.

### Detection Patterns

| Pattern | What It Detects | Default Threshold |
|---------|----------------|-------------------|
| **Repetition** | Same tool + same input N consecutive times | 3 calls |
| **Oscillation** | A-B-A-B alternating pattern | 6-call window |
| **Idle** | No file writes/edits/bash for extended period | 15 turns |

Detection priority: repetition > oscillation > idle (first match wins).

### Intervention Strategy

1. **First stall detected**: Inject intervention message into the conversation, nudging the agent to try a different approach
2. **Second stall detected**: Another intervention message
3. **After max interventions (default: 2)**: Hard stop — agent returns with `STALLED:` error

### Configuration

```typescript
interface StallDetectionConfig {
  enabled: boolean;              // default: true
  repetitionThreshold: number;   // default: 3
  oscillationWindowSize: number; // default: 6
  idleTurnThreshold: number;     // default: 15
  maxInterventions: number;      // default: 2
}
```

Override programmatically:
```typescript
const orchestrator = new FeatureFactoryOrchestrator({
  stallDetection: {
    repetitionThreshold: 5,
    maxInterventions: 3,
  },
});
```

CLI flag to disable:
```bash
npx feature-factory new-feature "Add SMS" --no-stall-detection
```

### Module

Source: `src/stall-detection.ts`
Tests: `__tests__/stall-detection.test.ts`

Exports: `createStallTracker`, `hashToolInput`, `buildInterventionMessage`, `DEFAULT_STALL_DETECTION_CONFIG`

## Phase Retry

When a phase fails (agent hits turn limit, stall hard-stop, or validation failure), the orchestrator can retry with feedback about what went wrong. The retrying agent receives context about partial progress and instructions to continue rather than start over.

### Configuration

| Parameter | Default | Autonomous | Env Var | Purpose |
|-----------|---------|------------|---------|---------|
| `maxRetriesPerPhase` | 1 | 2 | `FEATURE_FACTORY_MAX_RETRIES_PER_PHASE` | Global retry limit |
| `WorkflowPhase.maxRetries` | — | — | — | Per-phase override |

### Per-Phase Overrides

Workflow phases can override the global retry limit:

```typescript
{
  agent: 'dev',
  name: 'TDD Green Phase',
  maxRetries: 2,  // Dev benefits most from retry
}
```

Current per-phase overrides:
- **new-feature** dev phase: `maxRetries: 2`
- **bug-fix** dev phase: `maxRetries: 2`
- **refactor**: uses global default (1)

### Retry Strategy

1. On recoverable failure (agent error or validation failure), emit `phase-retry` event
2. Re-run pre-phase hooks (e.g., TDD enforcement re-checks test state after partial work)
3. Prepend retry feedback to agent context: what failed, partial progress, guidance
4. Accumulate `filesCreated`, `filesModified`, `commits`, cost, and turns across retries
5. Final `AgentResult` reflects total effort with `retryAttempts` field

### What Is NOT Retried

- **Hook failures**: Pre-phase hook failure means a prerequisite problem — the previous phase needs re-running
- **Budget exceeded**: Non-recoverable, no retry
- **Workflow time limit**: Non-recoverable, no retry

### CLI

```bash
# Disable retry for a workflow
npx feature-factory new-feature "Add SMS" --no-retry
```

### Events

The `phase-retry` event is emitted before each retry attempt:

```typescript
interface PhaseRetryEvent {
  type: 'phase-retry';
  phase: string;
  agent: AgentType;
  attempt: number;       // 1-indexed retry number
  maxRetries: number;
  reason: string;
  timestamp: Date;
}
```

### Module

Source: `src/orchestrator.ts` — `executePhaseWithRetry()`, `buildRetryFeedback()`
Tests: `__tests__/orchestrator.test.ts` — "Phase Retry" and "Phase Retry Config" describe blocks

## Git Checkpoints

Lightweight git tags capture the state before each phase, enabling surgical rollback if a phase fails or approval is rejected. In non-sandbox mode, this is the primary undo mechanism.

### How It Works

1. **Before each phase**: A tag `ff-checkpoint/<sessionId>/pre-<index>-<slug>` is created at HEAD
2. **On failure/rejection**: CLI prompts "Roll back changes from <phase>?" (never auto-rollback)
3. **On rollback**: `git reset --hard <tag>` + `git clean -fd` (preserves gitignored files)
4. **On workflow completion**: All session checkpoint tags are deleted

Checkpoints are created once per phase, before the first attempt — retries build on partial progress.

### Configuration

| Parameter | Default | Env Var | CLI Flag |
|-----------|---------|---------|----------|
| `gitCheckpoints` | `true` | `FEATURE_FACTORY_GIT_CHECKPOINTS=false` | `--no-checkpoints` |

### CLI Usage

```bash
# Checkpoints enabled by default
npx feature-factory new-feature "Add SMS"

# Disable checkpoints
npx feature-factory new-feature "Add SMS" --no-checkpoints

# Verbose mode shows checkpoint tags
npx feature-factory new-feature "Add SMS" --verbose
# Output: 📌 Checkpoint: ff-checkpoint/sess-abc/pre-0-design-review (abc1234)
```

### Rollback Flow

On phase failure or approval rejection (non-sandbox mode):
```
✗ TDD Green Phase failed
  Roll back changes from TDD Green Phase? (y/N) y
  ↩ Rolled back to before TDD Green Phase
```

Rollback is **not offered** when:
- Sandbox mode is active (sandbox provides isolation)
- No checkpoint exists for the failed phase
- The phase is not associated with a specific agent

### Module

Source: `src/checkpoints.ts` — `createCheckpoint()`, `rollbackToCheckpoint()`, `cleanupCheckpoints()`, `listCheckpoints()`, `sanitizePhaseSlug()`
Tests: `__tests__/checkpoints.test.ts`, `__tests__/orchestrator.test.ts` — "Git Checkpoints" describe block

## Process Validation Infrastructure

The Feature Factory includes infrastructure to validate the diagnose → fix → learn cycle.

### Work Discovery

Listens to DeepValidator events and queues work items for autonomous processing:

```typescript
import { WorkPoller, createWorkPoller } from '@twilio-feature-factory/feature-factory';
import { DeepValidator } from '@twilio-feature-factory/mcp-twilio';

const validator = new DeepValidator(twilioClient);
const poller = createWorkPoller({ autoHandleLowTier: true });

// Register validator to listen for failures
poller.registerValidator(validator);

// Listen for discovered work
poller.on('work-discovered', (work) => {
  console.log('Priority:', work.priority);   // critical | high | medium | low
  console.log('Tier:', work.tier);           // 1-2 auto-handle, 3-4 human review
  console.log('Workflow:', work.suggestedWorkflow); // bug-fix | refactor | etc.
});

// Validation failures now trigger work discovery
const result = await validator.validateMessage('SMxxx');
```

### Process Metrics

Tracks timing, quality, and learning metrics for the fix cycle:

```typescript
import { ProcessMetricsCollector, createProcessMetricsCollector } from '@twilio-feature-factory/feature-factory';

const collector = createProcessMetricsCollector();

// Start tracking a fix cycle
collector.startCycle(discoveredWork);

// Record fix attempts
collector.recordFixAttempt(work.id);
collector.recordLearningCapture(work.id, isNovel);

// Complete and get metrics
const metrics = collector.completeCycle(work.id, 'Fixed the issue', {
  diagnosisAccurate: true,
  rootCauseMatched: true,
  workflowUsed: 'bug-fix',
});

// Get aggregate statistics
const aggregates = collector.computeAggregates();
console.log('First fix success rate:', aggregates.qualityRates.firstFixSuccessRate);
console.log('Average cycle time:', aggregates.averageTiming.totalCycleTime);
```

### Replay Verification

Validates that captured learnings actually improve fix performance:

```typescript
import { ReplayVerifier, createReplayVerifier } from '@twilio-feature-factory/feature-factory';

const verifier = createReplayVerifier();

// Register a scenario
verifier.registerScenario({
  id: 'webhook-timeout',
  name: 'Webhook Timeout Scenario',
  description: 'Simulates webhook timeout failure',
  diagnosis: capturedDiagnosis,
  capturedLearnings: ['Increase timeout to 30s', 'Add retry logic'],
  resolution: 'Added retry with exponential backoff',
  validateSuccess: async () => checkWebhookWorks(),
  setupFailure: async () => configureSlowWebhook(),
});

// Compare with and without learnings
const comparison = await verifier.compare('webhook-timeout');

console.log('Time saved:', comparison.improvement.timeSavedMs);
console.log('Attempts saved:', comparison.improvement.attemptsSaved);
console.log('Learnings helped:', comparison.improvement.learningsHelped);

// Verify all scenarios
const summary = await verifier.verifyAll();
console.log('Scenarios improved:', summary.scenariosImproved);
console.log('Success rate with learnings:', summary.successRateWithLearnings);
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Development mode (watch)
npm run dev
```

## Related Documentation

- [Root CLAUDE.md](/CLAUDE.md) - Project-wide standards
- [MCP Server](/agents/mcp-servers/twilio/CLAUDE.md) - Twilio MCP tools
- [Deep Validation](/agents/mcp-servers/twilio/src/validation/CLAUDE.md) - Validation patterns
- [Tool Boundaries](/.claude/references/tool-boundaries.md) - MCP vs CLI vs Functions
- [Design Decisions](/DESIGN_DECISIONS.md) - Architectural rationale
