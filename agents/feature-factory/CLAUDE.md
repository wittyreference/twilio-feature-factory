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
  maxBudgetUsd: number;        // Default: $5.00 per feature
  maxTurnsPerAgent: number;    // Default: 50
  defaultModel: 'sonnet' | 'opus' | 'haiku';
  approvalMode: 'after-each-phase' | 'at-end' | 'none';
  twilioMcpEnabled: boolean;
  deepValidationEnabled: boolean;
  autonomousMode: AutonomousModeConfig;  // Optional, for unattended operation
  contextWindow?: Partial<ContextManagerConfig>;  // Optional, context management overrides
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
| Budget limit | $5.00 default | Unlimited |
| Max turns | 50 default | Unlimited |
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

# Fully autonomous (no prompts, no limits)
npx feature-factory new-feature "Add voice AI" --dangerously-autonomous

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

| Control | Default | Purpose |
|---------|---------|---------|
| `maxBudgetUsd` | $5.00 | Total budget per feature |
| `maxTurnsPerAgent` | 50 | Prevent infinite loops |
| `approvalMode` | after-each-phase | Human checkpoints |

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
