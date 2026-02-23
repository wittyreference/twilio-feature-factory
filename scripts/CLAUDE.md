# Scripts Directory

This directory contains CLI scripts for project setup and maintenance.

## Available Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `setup.js` | `npm run setup` | Interactive setup for provisioning Twilio resources |
| `enable-autonomous.sh` | `./scripts/enable-autonomous.sh` | Launch Claude Code in autonomous mode (interactive) |
| `run-headless.sh` | `./scripts/run-headless.sh` | Run Claude Code non-interactively via `claude -p` (CI/CD) |
| `validation-reset.sh` | `./scripts/validation-reset.sh` | Reset Twilio account to clean state for validation runs |
| `api-sync/` | `cd scripts/api-sync && npm run sync` | Automated Twilio API drift detection and coverage analysis |

## Setup Script

The setup script (`scripts/setup.js`) provides an interactive CLI for bootstrapping a Twilio Agent Factory project:

### What it does

1. **Credential Validation**: Prompts for Account SID and Auth Token if not in .env
2. **Resource Selection**: Interactive checkboxes to select which resources to provision
3. **Resource Provisioning**: Creates selected resources via Twilio API
4. **Callback Deployment**: Deploys status callback Functions via Serverless Toolkit
5. **Webhook Configuration**: Configures all resources to use deployed callback URLs
6. **Environment Update**: Updates .env file with new SIDs and URLs

### Resources Available for Provisioning

| Resource | Creates | Env Variable |
|----------|---------|--------------|
| Phone Number | Local US number (SMS+Voice enabled) | `TWILIO_PHONE_NUMBER` |
| Verify Service | OTP verification service | `TWILIO_VERIFY_SERVICE_SID` |
| Sync Service | Real-time state sync | `TWILIO_SYNC_SERVICE_SID` |
| Messaging Service | Sender pools, compliance | `TWILIO_MESSAGING_SERVICE_SID` |
| TaskRouter Workspace | Skills-based routing | `TWILIO_TASKROUTER_WORKSPACE_SID` |
| TaskRouter Workflow | Default routing workflow | `TWILIO_TASKROUTER_WORKFLOW_SID` |
| Callback Functions | Status callback handlers | `TWILIO_CALLBACK_BASE_URL` |

### Usage

```bash
# Run interactively
npm run setup

# Or directly
node scripts/setup.js
```

### Prerequisites

- Node.js 18+
- Twilio CLI installed (`npm install -g twilio-cli`)
- Serverless plugin installed (`twilio plugins:install @twilio-labs/plugin-serverless`)
- Valid Twilio Account SID and Auth Token

### What Gets Deployed

When "Callback Functions" is selected, the script deploys:

- `functions/callbacks/message-status.protected.js` - SMS/MMS delivery callbacks
- `functions/callbacks/call-status.protected.js` - Voice call status callbacks
- `functions/callbacks/task-status.protected.js` - TaskRouter event callbacks
- `functions/callbacks/verification-status.protected.js` - Verify callbacks
- `functions/callbacks/fallback.protected.js` - Universal fallback handler
- `functions/callbacks/helpers/sync-logger.private.js` - Shared logging utility

All callbacks log to Sync for deep validation during testing.

### Callback URL Configuration

After deployment, the script automatically configures:

| Resource | Callback URL | Fallback URL |
|----------|-------------|--------------|
| Phone Number | `/callbacks/message-status`, `/callbacks/call-status` | `/callbacks/fallback` |
| Messaging Service | `/callbacks/message-status` | `/callbacks/fallback` |
| TaskRouter Workspace | `/callbacks/task-status` | - |

### Security

- Auth Token is hidden during input
- Credentials are validated before any operations
- All deployed Functions use `.protected.js` (require Twilio request signatures)

### Troubleshooting

**"Twilio CLI is not installed"**
```bash
npm install -g twilio-cli
```

**"Serverless plugin not found"**
```bash
twilio plugins:install @twilio-labs/plugin-serverless
```

**"Invalid credentials"**
- Verify Account SID starts with `AC`
- Verify Auth Token is correct (not API Secret)
- Check credentials at https://console.twilio.com/

**Deployment fails**
- Ensure you're logged into Twilio CLI: `twilio login`
- Check for syntax errors in Functions: `npm run lint`

## Enable Autonomous Script

The `enable-autonomous.sh` script launches Claude Code with pre-approved permissions for unattended operation.

### What It Does

1. **Displays Warning**: Shows consequences of autonomous mode (real money, real calls)
2. **Requires Acknowledgment**: User must type `I ACKNOWLEDGE THE RISKS`
3. **Launches Claude Code**: Starts with expanded permissions
4. **Creates Audit Log**: Logs session to `.claude/autonomous-sessions/`

### Usage

```bash
# From project root
./scripts/enable-autonomous.sh

# With initial prompt
./scripts/enable-autonomous.sh "Add SMS verification to signup"

# Resume a conversation
./scripts/enable-autonomous.sh --resume
```

### Pre-Approved Commands

The script pre-approves these patterns (no permission prompts):

| Category | Patterns |
|----------|----------|
| Testing | `npm test*`, `npx jest*` |
| Building | `npm run build*`, `npx tsc*` |
| Linting | `npm run lint*`, `npx eslint*` |
| Twilio CLI | `twilio serverless:*`, `twilio api:*`, `twilio profiles:*` |
| Git (safe) | `git add`, `git commit`, `git status`, `git diff`, `git log` |
| File tools | `Read`, `Write`, `Edit`, `Glob`, `Grep` |
| Web | `WebSearch`, `WebFetch` |
| Agents | `Task`, `Skill` |

### Still Blocked (Require Approval)

- `git push --force`, `git reset --hard`
- `rm -rf` and destructive operations
- Network requests to unknown hosts
- Any command not in the pre-approved list

### Quality Gates (Always Enforced)

Even in autonomous mode, Claude Code hooks still enforce:

- **TDD**: Tests must fail first, then pass
- **Linting**: Must pass before commit
- **Credential safety**: No hardcoded secrets
- **Git safety**: No `--no-verify`, no force push

### Audit Logs

Session logs are saved to `.claude/autonomous-sessions/autonomous-YYYYMMDD-HHMMSS.log` with:

- Session start/end timestamps
- Acknowledgment method
- All tool invocations (via hooks)

## Headless Runner Script

The `run-headless.sh` script runs Claude Code non-interactively via `claude -p` for CI/CD and unattended workflows.

### What It Does

1. **Clears nested-session env**: Unsets `CLAUDECODE` to prevent child `claude -p` from detecting a parent session
2. **Validates environment**: Project root, `claude` CLI, env vars
3. **Requires env var acknowledgment**: `CLAUDE_HEADLESS_ACKNOWLEDGED=true` (no interactive prompt)
4. **Launches `claude -p`**: Non-interactive — receives prompt, executes autonomously, exits. Automatically adds `--verbose` when output format is `stream-json` (required by the CLI).
5. **Creates audit log**: Logs to `.claude/autonomous-sessions/headless-YYYYMMDD-HHMMSS.log`
6. **Captures output**: Streams to both stdout and audit log via `tee`

### Usage

```bash
# One-off prompt
CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh "Run npm test and fix failures"

# Pre-defined task
CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh --task test-fix

# Complex prompt from file
CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh --prompt-file .meta/plans/validation-plan.md --max-turns 80

# Custom turn limit
CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh --task validate --max-turns 20
```

### Pre-defined Tasks

| Task | Prompt |
|------|--------|
| `validate` | Run /preflight, then `npm test --bail`. Report results. |
| `test-fix` | Run tests, fix failures, re-run, commit fixes. |
| `lint-fix` | Run linter, fix errors, commit fixes. |
| `typecheck` | Run `tsc --noEmit` in MCP server, fix errors, commit. |
| `deploy-dev` | Run /preflight, then deploy to dev. Report URLs. |
| `e2e-validate` | Full E2E: deploy, live calls, callback verification, auto-fix. Use `--max-turns 80`. |
| `random-validation` | Random use case build + deploy + deep validation. Use `--max-turns 120`. |

### Task Prompt Files

For complex tasks that don't fit in a one-liner, store prompt files in `scripts/headless-tasks/`:

- `validate.md` — Full validation plan with step-by-step reporting
- `test-fix.md` — Test-fix cycle with retry logic
- `e2e-validate.md` — Autonomous E2E validation: deploy → live calls → callback verification → auto-fix (3 phases, 3 retries each)
- `parallel-refactor.md` — Scope-parallel refactoring: spawns one Task subagent per domain/package, each self-verifying. Requires companion spec at `.meta/refactor-spec.md`.
- `random-validation.md` — Headless-optimized random use case: select UC, build inline (no slash commands), deploy, deep validate with MCP tools, capture learnings. Requires `FORCE_USE_CASE=UCN` for parallel diversity.

Use with: `./scripts/run-headless.sh --prompt-file scripts/headless-tasks/validate.md`

**Parallel refactor workflow:**
```bash
# 1. Write your refactor spec
echo "Replace setBody(obj) with setBody(JSON.stringify(obj)) + Content-Type header" > .meta/refactor-spec.md

# 2. Run it
CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh \
  --prompt-file scripts/headless-tasks/parallel-refactor.md --max-turns 60
```

### Key Differences from enable-autonomous.sh

| | `enable-autonomous.sh` | `run-headless.sh` |
|-|----------------------|-------------------|
| Mode | Interactive (`claude`) | Non-interactive (`claude -p`) |
| Acknowledgment | Type phrase in terminal | Env var `CLAUDE_HEADLESS_ACKNOWLEDGED=true` |
| Terminal | Required (box UI, countdown) | Not required |
| Human present | Yes (types acknowledgment) | No (fire-and-forget) |
| Turn limit | None (runs until done) | `--max-turns` (default 30) |
| Output | Interactive terminal | `stream-json` (machine-readable) |
| Use case | Developer at keyboard | CI/CD, cron, unattended |

### Permissions

Same `--allowedTools` list as `enable-autonomous.sh`, plus `mcp__twilio__*` for all MCP tools. Same quality gates enforced. Same things still blocked (force push, destructive ops).

### Headless Gotchas

These were discovered across 16 headless sessions and 4 rounds of prompt iteration:

| Issue | Impact | Fix |
|-------|--------|-----|
| **Skill tool terminates `claude -p` sessions** | Slash commands (`/architect`, `/spec`, etc.) produce text that becomes the session's final response, exiting with 75-80% of turn budget unused | Headless prompts must do all work inline (Read/Write/Edit/Bash), never via Skill tool |
| **MCP tools need `--allowedTools`** | All MCP tool calls get "permission not granted" without explicit `--allowedTools "mcp__twilio__*"` | Already added to `run-headless.sh` |
| **Sandbox blocks shell substitutions** | `${}`, `$()`, and `printenv` are rejected by a security layer independent of `--allowedTools` | Use `python3 -c "import os; print(os.environ.get('VAR', 'default'))"` for env var access |
| **`mkdir` blocked in headless sandbox** | Even with `Bash(mkdir*)` in allowedTools, some directory creation is denied | Use git branches instead of temp clones; use Write tool (implicitly creates directories) |
| **`AskUserQuestion` blocks forever** | No terminal in `claude -p` mode, so interactive prompts hang | Headless prompts must explicitly forbid `AskUserQuestion` |
| **Parallel sessions pick same UC** | `random.choice()` with same timing produces identical results | Pass `FORCE_USE_CASE=UCN` per session for diversity |
| **Parallel sessions share working directory** | Multiple `git checkout -b` commands in the same repo — last one wins | All code lands on one branch; acceptable for validation but unexpected |
| **Wrong prompt file wastes sessions** | `--prompt-file .meta/random-validation.md` (interactive plan) vs `--task random-validation` (headless-optimized) | Always use `--task random-validation` for headless runs |
| **MCP server needs `.env` sourced** | MCP tools fail with auth errors if env vars aren't exported | `run-headless.sh` must export env vars for MCP tools to work |
| **Headless validation burns turns on infrastructure** | Setup, deploy, and webhook config consume 30-40% of turn budget before validation starts | Use `--task random-validation` with `--max-turns 120` to leave room |

## Validation Reset Script

The `validation-reset.sh` script resets the Twilio account to a clean state before validation runs.

### What It Does (7 Phases)

1. **Remove serverless deployment** — finds the `prototype` service and deletes it, clears `TWILIO_CALLBACK_BASE_URL`
2. **Reset phone number webhooks** — blanks voice URL, SMS URL, fallback URLs, status callbacks on all numbers (numbers are kept)
3. **Delete & recreate services** — Sync, Verify, Messaging, TaskRouter (workspace + default queue + default workflow). Updates `.env` with new SIDs
4. **Delete recordings** — removes up to 200 recordings from the account
5. **Delete transcripts** — removes up to 200 Voice Intelligence transcripts
6. **Clear validation state** — removes `.meta/sequential-validation-state.json` and local `validation-*` branches
7. **Summary** — prints what was cleaned and new SIDs

### Usage

```bash
# Standalone
./scripts/validation-reset.sh

# Via headless runner (recommended)
CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh --task random-validation --clean --max-turns 120
```

### Prerequisites

- Must run from project root
- `.env` with `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
- Twilio CLI installed (for serverless service listing)
- `curl` and `python3` available

### After Running

1. Re-source `.env` if in a shell session
2. Run `npm run deploy:dev` to create a fresh serverless deployment
3. Configure webhooks on phone numbers as needed

## API Sync Script

The `api-sync/` directory contains an automated pipeline for detecting drift between Twilio's OpenAPI specs and our MCP tool implementations.

### What It Does

1. **Snapshot**: Fetches the latest Twilio OpenAPI specs from `github.com/twilio/twilio-oai`, normalizes them into a flat endpoint inventory
2. **Inventory**: Extracts tool metadata from 26 MCP tool files via regex (names, SDK calls, Zod params)
3. **Diff**: Compares current vs previous OAI snapshots for new/removed/changed endpoints. Also compares against our tool inventory for coverage analysis
4. **Report**: Generates dual-format output (JSON for subagents, Markdown for humans)

### Usage

```bash
cd scripts/api-sync

# Full pipeline (snapshot → diff → report)
npm run sync

# Individual stages
npm run snapshot           # Fetch latest OAI specs
npm run extract            # Parse MCP tool files
npm run diff               # Compare snapshots + coverage
npm run report             # Generate Markdown report

# Force re-scan even if version unchanged
FORCE=true npm run snapshot

# Run tests
npm test
```

### Key Files

| File | Purpose |
|------|---------|
| `sync-state.json` | Tracks last synced OAI/CLI/SDK versions |
| `tool-endpoint-map.json` | Maps 272 MCP tools to OAI endpoints |
| `snapshots/<version>.json` | Normalized OAI API surface snapshots |
| `reports/latest.json` | Machine-readable drift report |
| `reports/latest.md` | Human-readable Markdown report |
| `inventory.json` | Extracted MCP tool metadata |
| `headless-tasks/review-drift.md` | Headless prompt for acting on drift |

### Automation

The pipeline runs weekly via `.github/workflows/api-drift-check.yml`:
- **Schedule**: Every Monday 9 AM UTC
- **Manual trigger**: `workflow_dispatch` with optional force flag
- **Outputs**: Creates GitHub Issue with `api-drift` label when drift is detected
- **Commits**: Snapshots and reports are committed automatically

### Report Contents

- **Breaking changes**: From CHANGES.md annotations
- **New/removed endpoints**: Between OAI versions
- **Parameter changes**: Added/removed params between versions
- **Coverage summary**: % of OAI endpoints with MCP tools
- **Tool parameter drift**: MCP tools missing OAI params
- **Domain coverage table**: Per-domain coverage breakdown
