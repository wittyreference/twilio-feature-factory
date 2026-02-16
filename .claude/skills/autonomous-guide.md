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

## Headless Path (CI/CD / Unattended)

Run Claude Code non-interactively with `claude -p`. No terminal UI, no human input — true fire-and-forget. Acknowledgment via env var (CI/CD pattern).

```bash
# One-off task
CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh "Run npm test and fix failures"

# Pre-defined task
CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh --task test-fix

# Complex task from file
CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh --prompt-file .meta/plans/validation-plan.md --max-turns 80

# CI/CD pipeline (low turn limit for quick checks)
CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh --task validate --max-turns 20
```

**Pre-defined tasks:**

| Task | What it does |
|------|-------------|
| `validate` | Run /preflight, then npm test --bail |
| `test-fix` | Run tests, fix failures, commit fixes |
| `lint-fix` | Run linter, fix errors, commit fixes |
| `typecheck` | Run tsc --noEmit, fix type errors, commit fixes |
| `deploy-dev` | Run /preflight, then deploy to dev |

**Key differences from interactive autonomous mode:**
- Uses `claude -p` (non-interactive) — no terminal UI, no countdown, no typing prompt
- Acknowledgment via `CLAUDE_HEADLESS_ACKNOWLEDGED=true` env var only
- Configurable `--max-turns` (default 30)
- Machine-readable output via `--output-format stream-json`
- Supports `--prompt-file` for complex multi-step plans
- Audit logs saved to `.claude/autonomous-sessions/headless-*.log`

See `scripts/run-headless.sh --help` for full usage.

> **Note**: Agent teams should NOT be used in autonomous overnight runs. Teammates cannot resume sessions, so if a teammate's session is interrupted, its work is lost. Keep team tasks small enough to complete in one session.
