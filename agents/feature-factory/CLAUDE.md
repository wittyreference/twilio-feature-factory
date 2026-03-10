// ABOUTME: Autonomous Twilio feature development orchestrator using Claude Agent SDK.
// ABOUTME: Coordinates specialized subagents in TDD-enforced development pipelines.

For full workflow details, autonomous mode docs, and implementation patterns, see [REFERENCE.md](./REFERENCE.md).

# Feature Factory

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
├── schemas/              # Phase output Zod schemas (advisory validation)
├── workflows/            # Pipeline definitions (new-feature, bug-fix, refactor)
├── hooks/                # Pre-phase quality gates (TDD, coverage, test-passing)
├── checkpoints.ts        # Git checkpoint tags for phase rollback
├── stall-detection.ts    # Stuck agent detection (repetition, oscillation, idle)
├── discovery/            # Autonomous work discovery
├── worker/               # Autonomous worker infrastructure
├── metrics/              # Process metrics collection
└── verification/         # Replay verification
```

## Subagent Roles

| Agent | Role | Approval |
|-------|------|----------|
| **architect** | Design review, pattern selection | Yes |
| **spec** | Detailed specifications | Yes |
| **test-gen** | Write failing tests (TDD Red) | No |
| **dev** | Implement to pass tests (TDD Green) | No |
| **qa** | Test execution, coverage, security | No |
| **review** | Code review, security audit | Yes |
| **docs** | Documentation updates | No |

## Workflows

### new-feature
Full TDD pipeline: architect → spec → test-gen → dev → qa → review → docs.
Human approval after: architect, spec, review.

### bug-fix
Diagnosis and fix: architect → test-gen → dev → review → qa.
No spec phase (scope is the bug). Human approval after: architect, review.

### refactor
Safe refactoring: qa (baseline) → architect → dev → review → qa (final).
Tests must PASS throughout. Human approval after: architect, review.

## Configuration Interface

```typescript
interface FeatureFactoryConfig {
  maxBudgetUsd: number;                // Default: $5.00 (autonomous: $50)
  maxTurnsPerAgent: number;            // Default: 200 (autonomous: 500)
  maxRetriesPerPhase: number;          // Default: 1 (autonomous: 2)
  maxDurationMsPerAgent: number;       // Default: 5min (autonomous: 10min)
  maxDurationMsPerWorkflow: number;    // Default: 30min (autonomous: 60min)
  defaultModel: 'sonnet' | 'opus' | 'haiku';
  approvalMode: 'after-each-phase' | 'at-end' | 'none';
  twilioMcpEnabled: boolean;
  deepValidationEnabled: boolean;
  autonomousMode?: AutonomousModeConfig;
  contextWindow?: Partial<ContextManagerConfig>;
  stallDetection?: Partial<StallDetectionConfig>;
  sandbox?: { enabled: boolean; sourceDirectory?: string };
}
```

## TDD Enforcement Rules

1. **test-gen** must create tests that **fail** initially (Red phase)
2. **tdd-enforcement hook** verifies before dev: tests created and FAILING
3. **dev** blocked with `TDD VIOLATION` if tests pass or don't exist
4. **dev** commits only when tests pass (Green phase)
5. **review** validates TDD was followed

## Refactor Safety

1. **test-passing-enforcement hook** verifies ALL tests PASS before proceeding
2. Runs at multiple checkpoints: baseline, after implementation, final verification
3. Blocks with `REFACTOR SAFETY VIOLATION` if any test fails
4. Ensures refactoring doesn't break existing functionality

## Credential Safety

All Write/Edit operations validated against hardcoded Twilio credentials:
- Account SID: `AC[a-f0-9]{32}` → Use `process.env.TWILIO_ACCOUNT_SID`
- API Key SID: `SK[a-f0-9]{32}` → Use `process.env.TWILIO_API_KEY`
- Auth Token / API Secret → Use environment variables

Skipped for: test files, docs, `.env.example` files

## Cost Controls

| Control | Default | Autonomous | Purpose |
|---------|---------|------------|---------|
| `maxBudgetUsd` | $5.00 | $50.00 | Total budget per feature |
| `maxTurnsPerAgent` | 200 | 500 | Fallback ceiling |
| `maxDurationMsPerAgent` | 5 min | 10 min | Per-agent time limit |
| `maxRetriesPerPhase` | 1 | 2 | Retry failed phases |
| `maxDurationMsPerWorkflow` | 30 min | 60 min | Per-workflow time limit |
| `approvalMode` | after-each-phase | none | Human checkpoints |

Use `--budget unlimited` to set Infinity budget (explicit opt-in only).

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `FEATURE_FACTORY_AUTONOMOUS` | Enable autonomous mode | false |
| `FEATURE_FACTORY_AUTONOMOUS_ACKNOWLEDGED` | Skip acknowledgment prompt | false |
| `FEATURE_FACTORY_GIT_CHECKPOINTS` | Enable git checkpoints | true |
| `FEATURE_FACTORY_MAX_RETRIES_PER_PHASE` | Global retry limit | 1 |
| `FEATURE_FACTORY_CONTEXT_COMPACTION_THRESHOLD` | Token threshold for history compaction | 120,000 |

## Development

```bash
npm install
npm run build
npm test
npm run dev
```

## Related Documentation

- [REFERENCE.md](./REFERENCE.md) - Detailed workflows, autonomous modes, schemas, validation
- [Root CLAUDE.md](/CLAUDE.md) - Project-wide standards
- [MCP Server](/agents/mcp-servers/twilio/CLAUDE.md) - Twilio MCP tools
- [Tool Boundaries](/.claude/references/tool-boundaries.md) - MCP vs CLI vs Functions
- [Design Decisions](/DESIGN_DECISIONS.md) - Architectural rationale
