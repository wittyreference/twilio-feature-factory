# ABOUTME: Detailed reference documentation for all scripts and subcommands.
# ABOUTME: Extracted from CLAUDE.md to keep main docs concise.

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
| `chaos-only` | Chaos resilience validation — no Twilio APIs, safe for parallel. Use `--max-turns 60`. |
| `nonvoice-only` | Nonvoice validation: SMS, Verify, Sync, TaskRouter via MCP. Use `--max-turns 120`. |

### Task Prompt Files

For complex tasks that don't fit in a one-liner, store prompt files in `scripts/headless-tasks/`:

- `validate.md` — Full validation plan with step-by-step reporting
- `test-fix.md` — Test-fix cycle with retry logic
- `e2e-validate.md` — Autonomous E2E validation: deploy → live calls → callback verification → auto-fix (3 phases, 3 retries each)
- `parallel-refactor.md` — Scope-parallel refactoring: spawns one Task subagent per domain/package, each self-verifying. Requires companion spec at `.meta/refactor-spec.md`.
- `random-validation.md` — Headless-optimized random use case: select UC, build inline (no slash commands), deploy, deep validate with MCP tools, capture learnings. Requires `FORCE_USE_CASE=UCN` for parallel diversity.
- `chaos-only.md` — Chaos resilience validation: generates novel scenarios from 7 archetypes × 7 categories, evaluates architect instructions, scores 5 dimensions. No Twilio API calls.
- `nonvoice-only.md` — Nonvoice product validation: deploys functions, validates Messaging (MC1-MC3), Verify (VC1-VC2), Sync (SY1-SY4), TaskRouter (TR1-TR3) via MCP tools. 12 checks total.

Use with: `./scripts/run-headless.sh --prompt-file scripts/headless-tasks/validate.md`

**Parallel refactor workflow:**
```bash
# 1. Write your refactor spec
echo "Replace setBody(obj) with setBody(JSON.stringify(obj)) + Content-Type header" > .meta/refactor-spec.md

# 2. Run it
CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh \
  --prompt-file scripts/headless-tasks/parallel-refactor.md --max-turns 60
```

### Isolation Flags

| Flag | Effect |
|------|--------|
| `--clean` | Runs `validation-reset.sh --quiet` AFTER session ends (post-session cleanup) |
| `--fresh-resources` | Provisions ephemeral Sync/Verify/Messaging/TaskRouter resources before the session. Uses `provision-ephemeral.sh` to create, `cleanup-ephemeral.sh` to delete on exit. Session sees fresh SIDs instead of `.env` ones. |
| `--env-file FILE` | Use an alternative env file instead of `.env` |

```bash
# Isolated validation with fresh resources + cleanup
CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh \
  --task nonvoice-only --max-turns 120 --fresh-resources --clean
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

## Regression Testing Script

The `run-regression.sh` script orchestrates parallel validation after significant codebase changes.

### Modes

| Mode | What It Runs | Time | LLM Turns |
|------|-------------|------|-----------|
| `--quick` | Phase 1 only: parallel fast checks | ~5 min | 0 |
| `--standard` | Phase 1 + chaos validation | ~60 min | ~60 |
| `--full` | Phase 1 + 3 parallel headless lanes | ~2 hours | ~300 |
| `--serial` | Phase 1 + headless lanes sequentially | ~3-4 hours | ~300 |

### Phase 1: Parallel Fast Checks

Runs up to 7 checks in background (`&`), waits for all, collects exit codes:
- `npm test --bail` — unit/integration tests
- `npm run lint` — ESLint
- `npx tsc --noEmit` — MCP server typecheck
- `check-claude-doc-drift.sh` — CLAUDE.md inventory drift
- `validate-meta-separation.sh` — .meta/ file isolation
- `npm run test:e2e` — Newman collection (if available)
- `verify-shipping-ready.sh` — shipping readiness (if available)

### Phase 2: Headless Validation Lanes

Three lanes with resource isolation:

| Lane | Task | Resources | Turns |
|------|------|-----------|-------|
| Lane A | `random-validation` | Default `.env` (voice, webhooks, ngrok) | 120 |
| Lane B | `nonvoice-only` | `.env.lane-b` (separate Sync, Verify, TaskRouter, Messaging) | 120 |
| Lane C | `chaos-only` | None (no Twilio API calls) | 60 |

`--full` runs all three in parallel. `--serial` runs them sequentially (no `.env.lane-b` needed). `--standard` runs only Lane C.

### Lane B Resource Isolation

For `--full` mode, provision a second set of Twilio resources stored in `.env.lane-b`:
- 2 phone numbers (voice+SMS enabled)
- Sync service, Verify service, Messaging service
- TaskRouter workspace + default workflow

One-time setup via `scripts/setup.js` or manually. `.env.lane-b` is gitignored.

### Usage

```bash
# Fast checks only (no LLM, no Twilio costs)
./scripts/run-regression.sh --quick

# + chaos validation
CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-regression.sh --standard

# Full parallel (requires .env.lane-b)
CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-regression.sh --full

# Full sequential (no .env.lane-b needed)
CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-regression.sh --serial
```

### Reports

Results are saved to `.meta/regression-reports/YYYYMMDD-HHMMSS/`:
- `phase1-*.log` / `phase1-*.exit` — fast check logs and exit codes
- `lane-*.log` / `lane-*.exit` — headless lane logs and exit codes
- `*-results.json` — structured JSON results from headless tasks
- `summary.md` — consolidated markdown report

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

## MCP Server Verification Script

The `verify-mcp.sh` script proves the MCP server can start with current credentials. Run it after bootstrap or whenever MCP tools aren't working in Claude Code.

### What It Checks (4 Sections)

1. **Build Artifacts** — `dist/serve.js` and `dist/index.js` exist
2. **MCP Configuration** — `.mcp.json` exists and is valid JSON
3. **Environment Variables** — `.env` has non-empty, non-placeholder values for `TWILIO_ACCOUNT_SID`, auth credentials, and `TWILIO_PHONE_NUMBER`
4. **Dry-Run Startup** — Constructs the MCP server without making API calls (validates credential format and presence)

### Usage

```bash
./scripts/verify-mcp.sh
```

Exit code 0 = ready, 1 = fix needed (with actionable remediation in output).

## Environment Doctor Script

The `env-doctor.sh` script detects conflicts between the user's shell environment and the project's `.env` file before they cause mysterious auth failures.

### What It Checks (5 Sections)

1. **Project .env** — Verifies `.env` file exists
2. **Credential conflicts** — Compares `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` between shell and `.env`. Flags mismatches with masked values.
3. **Regional routing** — Detects orphaned `TWILIO_REGION`/`TWILIO_EDGE` set in shell but absent from `.env` (causes silent 401 failures)
4. **API key auth** — Detects API key mismatches between shell and `.env`
5. **Environment isolation** — Checks direnv installation and `.envrc` allow status

### Usage

```bash
# Standalone
./scripts/env-doctor.sh

# Runs automatically before npm start (via prestart hook in package.json)
npm start
```

### Exit Codes

- `0` — No conflicts (or warnings only)
- `1` — Conflicts detected that will cause auth failures

### Integration

- Called by the `prestart` npm script — runs before every `npm start`
- Referenced in README Quick Start step 5
- Referenced in `.env.example` header

## Dogfood Environment Script

The `dogfood-env.sh` script simulates a new user with pre-existing conflicting Twilio shell vars cloning and setting up the repo. Validates all protection layers.

### What It Tests (6 Sections, 17 Tests)

1. **dotenv override** — Proves `{ override: true }` makes `.env` win, and default mode loses
2. **env-doctor detection** — Verifies env-doctor catches account SID mismatch and regional contamination
3. **`.envrc` presence** — Confirms `.envrc` ships with the repo and contains unset commands
4. **Shell script unsets** — Checks all 4 scripts have unset blocks before sourcing `.env`
5. **npm prestart** — Verifies `package.json` runs env-doctor before start
6. **README guidance** — Confirms README warns about conflicts and provides fix commands

### Usage

```bash
# Run simulation
./scripts/dogfood-env.sh

# Keep the /tmp clone for inspection
./scripts/dogfood-env.sh --keep

# Show full env-doctor output
./scripts/dogfood-env.sh --verbose
```

### How It Works

1. Saves current shell env, exports fake conflicting Twilio vars
2. Copies working tree to `/tmp/ff-dogfood-TIMESTAMP` (rsync, not git clone, so uncommitted changes are included)
3. Creates a `.env` with different values than the shell vars
4. Runs each test section, comparing expected vs actual behavior
5. Restores original env and cleans up `/tmp` clone

### Exit Code

Exit code equals the number of failed tests (0 = all passed).

## Ephemeral Provisioning Scripts

Two scripts work together to create and clean up isolated Twilio resources for validation runs.

### provision-ephemeral.sh

Creates ephemeral Sync, Verify, Messaging, and TaskRouter resources with `validation-{TIMESTAMP}` prefix. Appends new SIDs to the specified env file and writes an `EPHEMERAL_SIDS` manifest for cleanup.

```bash
# Create ephemeral resources, appending SIDs to a temp env file
./scripts/provision-ephemeral.sh /tmp/my-test-env
```

**Resources created**: Sync service (IS*), Verify service (VA*), Messaging service (MG*), TaskRouter workspace (WS*). Does NOT purchase phone numbers (uses existing from env).

**FriendlyName convention**: `validation-{type}-{unix-timestamp}` (e.g., `validation-sync-1774027823`). The Verify service uses an alpha-only hash to avoid the 60200 digit restriction.

### cleanup-ephemeral.sh

Reads the `EPHEMERAL_SIDS` manifest from the env file and deletes each resource. Reports success/failure per resource.

```bash
# Clean up resources created by provision-ephemeral.sh
./scripts/cleanup-ephemeral.sh /tmp/my-test-env
```

**Cascade behavior**: TaskRouter workspace deletion cascades to queues and workflows (same as Twilio Console behavior).

**Integration**: `run-headless.sh --fresh-resources` calls both scripts automatically — provision before the session, cleanup on EXIT trap.

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
