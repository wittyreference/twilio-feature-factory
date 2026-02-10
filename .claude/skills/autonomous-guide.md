# Autonomous Mode Guide

Both Claude Code and Feature Factory support autonomous mode for unattended operation. Autonomous mode pre-approves permission prompts while **keeping all quality gates enforced**.

## Quality Gates (Always Enforced)

Even in autonomous mode, these gates are never bypassed:

| Gate | Enforcement |
|------|-------------|
| TDD | Tests must fail first (Red), then pass (Green) |
| Linting | Must pass before commit |
| Coverage | 80% threshold |
| Credential safety | No hardcoded secrets (AC..., SK..., tokens) |
| Git safety | No `--no-verify`, no force push to main |

## Claude Code Path

Launch with pre-approved permissions:

```bash
./scripts/enable-autonomous.sh
```

Displays a warning, requires typing `I ACKNOWLEDGE THE RISKS`, then launches with expanded permissions.

**Pre-approved:**
- `npm test`, `npm run lint`, `npm run build`
- `twilio serverless:deploy`, `twilio api:*`
- `git add`, `git commit`, `git status`, `git diff`
- All file operations (Read, Write, Edit, Glob, Grep)

**Still blocked:**
- `git push --force`, `git reset --hard`
- Destructive operations (`rm -rf`)
- Arbitrary network requests

Session logs saved to `.claude/autonomous-sessions/`.

## Feature Factory Path

Run workflows without approval prompts:

```bash
# Interactive
npx feature-factory new-feature "task" --dangerously-autonomous

# CI/CD
FEATURE_FACTORY_AUTONOMOUS=true \
FEATURE_FACTORY_AUTONOMOUS_ACKNOWLEDGED=true \
npx feature-factory new-feature "task"
```

Removes budget/turn limits, auto-approves phase transitions. Session summary displayed at completion.

See [Feature Factory CLAUDE.md](/agents/feature-factory/CLAUDE.md) for full documentation.

> **Note**: Agent teams should NOT be used in autonomous overnight runs. Teammates cannot resume sessions, so if a teammate's session is interrupted, its work is lost. Keep team tasks small enough to complete in one session.
