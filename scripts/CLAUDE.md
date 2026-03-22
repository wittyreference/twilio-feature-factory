# ABOUTME: CLI scripts for project setup, validation, and maintenance.
# ABOUTME: See REFERENCE.md for detailed per-script documentation.

For detailed per-script documentation, setup instructions, usage examples, and troubleshooting, see [REFERENCE.md](./REFERENCE.md).

## Available Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `bootstrap.sh` | `npm run bootstrap` | Complete post-clone setup wizard (prerequisites with fnm/direnv auto-install, credentials, provisioning, MCP verification) |
| `setup.js` | `npm run setup` | Interactive setup for provisioning Twilio resources (also called by bootstrap.sh) |
| `fresh-install-validation.sh` | `./scripts/fresh-install-validation.sh` | Automated test of post-clone onboarding in /tmp (validates bootstrap flow, MCP protocol handshake, minimal-env startup) |
| `enable-autonomous.sh` | `./scripts/enable-autonomous.sh` | Launch Claude Code in autonomous mode (interactive) |
| `run-headless.sh` | `./scripts/run-headless.sh` | Run Claude Code non-interactively via `claude -p` (CI/CD) |
| `validation-reset.sh` | `./scripts/validation-reset.sh` | Reset Twilio account to clean state for validation runs |
| `check-claude-doc-drift.sh` | `./scripts/check-claude-doc-drift.sh` | Compare actual files vs CLAUDE.md inventories; exit 1 on drift |
| `demo.sh` | `npm run demo` | One-command demo launcher with ngrok, env verification, URL banner |
| `check-demo-health.sh` | `./scripts/check-demo-health.sh` | Pre-demo health check (ngrok, server, API keys, credentials) |
| `run-validation-suite.sh` | `./scripts/run-validation-suite.sh` | Run E2E deep validation suite against live US1 Twilio APIs |
| `run-sip-lab-e2e.sh` | `./scripts/run-sip-lab-e2e.sh` | Run SIP Lab E2E tests (PSTN connectivity, recording, transcription) |
| `generate-postman-collection.js` | `node scripts/generate-postman-collection.js > postman/collection.json` | Generate Newman E2E collection from compact spec (44 requests, 14 folders) |
| `check-updates.sh` | `./scripts/check-updates.sh` | Check local version against latest GitHub release; cached, session-start integrated |
| `check-changelog.sh` | `./scripts/check-changelog.sh` | Monitor Claude Code + Agent SDK releases for new features; cross-references against harness config |
| `update.sh` | `./scripts/update.sh` | Self-contained updater — handles clones, forks, and templates uniformly |
| `validate-updates.sh` | `./scripts/validate-updates.sh` | Cross-repo validation of check-updates.sh and update.sh across 3 GitHub repos |
| `verify-mcp.sh` | `./scripts/verify-mcp.sh` | Verify MCP server can start (Node.js version, build artifacts, .mcp.json, credentials, dry-run) |
| `env-doctor.sh` | `./scripts/env-doctor.sh` | Detect shell vs .env conflicts, orphaned regional vars, direnv status |
| `dogfood-env.sh` | `./scripts/dogfood-env.sh` | Simulate new-user onboarding with conflicting shell env vars |
| `validate-provisioning.sh` | `./scripts/validate-provisioning.sh` | Clean-room provisioning validator — ephemeral resources, full lifecycle, auto-teardown |
| `provision-ephemeral.sh` | `./scripts/provision-ephemeral.sh <env-file>` | Create ephemeral Twilio resources (Sync, Verify, Messaging, TaskRouter) for isolated validation |
| `cleanup-ephemeral.sh` | `./scripts/cleanup-ephemeral.sh <env-file>` | Delete ephemeral resources created by provision-ephemeral.sh |
| `run-regression.sh` | `./scripts/run-regression.sh` | Regression validation orchestrator — parallel fast checks + headless validation lanes |
| `headless-preflight.sh` | `./scripts/headless-preflight.sh` | Pre-flight setup: deploy, ngrok, agent servers, SIP Lab droplet lifecycle |
| `check-readme-drift.sh` | `./scripts/check-readme-drift.sh` | Detect structural drift between README.md and actual project contents |
| `check-wiki-drift.sh` | `./scripts/check-wiki-drift.sh [--quiet\|--json]` | Detect stat drift between GitHub wiki pages and actual codebase; session-checklist integrated |
| `sync-wiki.sh` | `./scripts/sync-wiki.sh [--fix\|--push]` | Clone/pull wiki, detect drift, optionally auto-fix numbers and push |
| `architect-metrics.sh` | `./scripts/architect-metrics.sh [--json\|--snapshot\|--diff]` | Collect codebase metrics for architect summary drift detection; session-checklist integrated |
| `api-sync/` | `cd scripts/api-sync && npm run sync` | Automated Twilio API drift detection and coverage analysis |
| `save-coverage-baseline.sh` | `./scripts/save-coverage-baseline.sh` | Save current test coverage snapshot for regression detection (used by pre-commit guardrail) |
| `score-validation.sh` | `./scripts/score-validation.sh [--label NAME] [FILE]` | Score validation results as 0-100, append to scores.jsonl (accepts MCP JSON or provisioning text) |
| `validation-trend.sh` | `./scripts/validation-trend.sh [--summary]` | Show validation score trends, flag regressions (>10 point drop) |

## Headless Gotchas

These issues were discovered across 16 headless sessions and 4 rounds of prompt iteration:

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
| **Headless validation burns turns on infrastructure** | Setup, deploy, and webhook config consume 30-40% of turn budget before validation starts | Use `--preflight` flag to handle deploy/ngrok/agents BEFORE claude launches |
| **jq required for all safety hooks** | Without jq, ALL hooks silently skip credential detection, --no-verify blocking, meta-mode isolation, ABOUTME enforcement | bootstrap.sh now fails without jq; hooks emit stderr warning when jq is absent |
| **Validation reuses existing resources by default** | Headless lanes use .env SIDs, masking provisioning friction | Use `--fresh-resources` flag for ephemeral resources per session |
