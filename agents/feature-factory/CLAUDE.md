# Feature Factory

Autonomous Twilio feature development orchestrator using Claude Agent SDK.

## Purpose

The Feature Factory coordinates specialized subagents in TDD-enforced development pipelines:

```
Developer: "Add SMS verification to user signup"
    ↓
Feature Factory Pipeline:
    architect → spec → test-gen → dev → review → docs
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
│   ├── review.ts         # Code review, security audit
│   └── docs.ts           # Documentation updates
├── workflows/            # Pipeline definitions
│   └── new-feature.ts    # Full TDD pipeline
└── hooks/                # Pre-phase quality gates
    ├── index.ts          # Hook registry and execution
    └── tdd-enforcement.ts # Verifies tests exist and FAIL before dev
```

## Subagent Roles

| Agent | Role | Tools | Approval |
|-------|------|-------|----------|
| **architect** | Design review, pattern selection | Read, Glob, Grep | Yes |
| **spec** | Detailed specifications | Read, Glob, Grep, Write | Yes |
| **test-gen** | Write failing tests (TDD Red) | Read, Glob, Write, Bash | No |
| **dev** | Implement to pass tests (TDD Green) | Read, Write, Edit, Bash | No |
| **review** | Code review, security audit | Read, Glob, Grep | Yes |
| **docs** | Documentation updates | Read, Write, Edit | No |

## Workflows

### new-feature (MVP)

Full TDD pipeline for new Twilio features:

1. **architect** - Evaluates architecture fit, selects patterns
2. **spec** - Creates detailed specification with test scenarios
3. **test-gen** - Writes failing tests (must fail initially)
4. **dev** - Implements minimal code to pass tests
5. **review** - Validates code quality and security
6. **docs** - Updates documentation

Human approval required after: architect, spec, review

### bug-fix (Planned)

Diagnosis and fix pipeline:
`twilio-logs → architect → test-gen → dev → review`

### refactor (Planned)

Safe refactoring pipeline:
`test → architect → dev → review → test`

## Configuration

```typescript
interface FeatureFactoryConfig {
  maxBudgetUsd: number;        // Default: $5.00 per feature
  maxTurnsPerAgent: number;    // Default: 50
  defaultModel: 'sonnet' | 'opus' | 'haiku';
  approvalMode: 'after-each-phase' | 'at-end' | 'none';
  twilioMcpEnabled: boolean;
  deepValidationEnabled: boolean;
}
```

## CLI Usage

```bash
# Run new feature pipeline
npx feature-factory new-feature "Add SMS verification to signup"

# With options
npx feature-factory new-feature "Add call recording" \
  --budget 10.00 \
  --no-approval

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

### Pre-Phase Hooks

Workflow phases can specify `prePhaseHooks` that run before the agent starts:

```typescript
{
  agent: 'dev',
  name: 'TDD Green Phase',
  prePhaseHooks: ['tdd-enforcement'],  // Blocks if tests don't fail
  // ...
}
```

Hook failures emit `workflow-error` events and stop the workflow.

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
