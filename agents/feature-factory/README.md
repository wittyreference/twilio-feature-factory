# @twilio-feature-factory/feature-factory

Autonomous Twilio feature development orchestrator using Claude Agent SDK. Coordinates specialized subagents in TDD-enforced pipelines.

## Install

```bash
npm install @twilio-feature-factory/feature-factory
```

## CLI Usage

```bash
# New feature (full TDD pipeline)
npx feature-factory new-feature "Add SMS verification to signup"

# Bug fix (diagnosis pipeline)
npx feature-factory bug-fix "Fix timeout error in verification flow"

# Safe refactoring
npx feature-factory refactor "Extract shared validation logic"

# Autonomous mode (no prompts, no limits, quality gates still enforced)
npx feature-factory new-feature "Add voice AI" --dangerously-autonomous

# Session management
npx feature-factory status
npx feature-factory resume
```

## Workflows

### new-feature
`architect → spec → test-gen → dev → qa → review → docs`

Full TDD pipeline. Human approval after architect, spec, and review phases.

### bug-fix
`architect → test-gen → dev → review → qa`

Diagnosis and minimal fix. Tests must reproduce the bug first (TDD Red).

### refactor
`qa (baseline) → architect → dev → review → qa (final)`

Tests must pass throughout. No new tests — existing tests are the safety net.

## Quality Gates (Always Enforced)

- TDD: Tests must fail first, then pass
- Coverage: 80% threshold
- Linting: Must pass
- Credential safety: No hardcoded secrets
- Git safety: No `--no-verify`, no force push

## Programmatic Usage

```typescript
import { FeatureFactoryOrchestrator } from '@twilio-feature-factory/feature-factory';

const orchestrator = new FeatureFactoryOrchestrator({
  maxBudgetUsd: 5.0,
  approvalMode: 'after-each-phase',
  twilioMcpEnabled: true,
});

orchestrator.on('workflow-completed', (result) => {
  console.log('Done:', result.sessionId);
});

await orchestrator.runWorkflow('new-feature', {
  description: 'Add SMS verification to signup',
});
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `TWILIO_ACCOUNT_SID` | For MCP tools | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | For MCP tools | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | For MCP tools | Default from number |

## License

MIT
