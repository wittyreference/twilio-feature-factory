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
├── index.ts              # Main entry point
├── orchestrator.ts       # Workflow coordinator
├── config.ts             # Cost limits, model selection
├── types.ts              # TypeScript type definitions
├── cli.ts                # CLI interface
├── agents/               # Subagent configurations
│   ├── architect.ts      # Design review, pattern selection
│   ├── spec.ts           # Detailed specifications
│   ├── test-gen.ts       # TDD Red Phase (failing tests)
│   ├── dev.ts            # TDD Green Phase (implementation)
│   ├── review.ts         # Code review, security audit
│   └── docs.ts           # Documentation updates
├── workflows/            # Pipeline definitions
│   └── new-feature.ts    # Full TDD pipeline
└── hooks/                # Quality gates
    ├── tdd-enforcement.ts
    └── validation.ts
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

# Check status
npx feature-factory status
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

The pipeline enforces Test-Driven Development:

1. **test-gen** must create tests that **fail** initially
2. **dev** is blocked if tests don't exist or already pass
3. **dev** commits only when tests pass
4. **review** validates TDD was followed

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
