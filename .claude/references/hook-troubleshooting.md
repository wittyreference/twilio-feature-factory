<!-- ABOUTME: Consolidated troubleshooting guide for all 17 Claude Code hooks. -->
<!-- ABOUTME: Covers common blocks, bypass env vars, and debugging instructions. -->

# Hook Troubleshooting Guide

When a hook blocks your action, this guide tells you why and how to fix it.

## Quick Reference: All Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| `pre-write-validate.sh` | PreToolUse (Write/Edit) | Credential safety, ABOUTME headers, meta-mode isolation, pipeline gate |
| `pre-bash-validate.sh` | PreToolUse (Bash) | Git safety (`--no-verify`, force push), deploy validation |
| `post-write.sh` | PostToolUse (Write/Edit) | Auto-lint, session file tracking |
| `flywheel-doc-check.sh` | PostToolUse (Write/Edit) | Suggests doc updates from code changes |
| `post-bash.sh` | PostToolUse (Bash) | Logs deployments, sends notifications |
| `session-start-log.sh` | SessionStart | Logs session events, bootstrap checks |
| `post-compact-summary.sh` | SessionStart (compact) | Captures compaction summary |
| `pre-compact.sh` | PreCompact | Logs pre-compaction token count |
| `session-checklist.sh` | Stop | Reminds about learnings, docs, uncommitted work |
| `archive-plan.sh` | Stop | Archives current plan file with dedup |
| `notify-ready.sh` | Stop | Desktop notification when Claude finishes |
| `subagent-log.sh` | SubagentStop | Doc update reminder after subagent work |
| `task-completed-check.sh` | TaskCompleted | TDD/coverage/credential verification |
| `teammate-idle-check.sh` | TeammateIdle | TDD/lint/coverage gate for team agents |
| `generate-learning-exercises.sh` | PostToolUse | Creates learning exercises from session logs |
| `_meta-mode.sh` | (sourced) | Helper: detects meta-development environment |

## Common Blocks and Fixes

### "PIPELINE GATE: New functions require tests"

**Hook:** `pre-write-validate.sh`
**Trigger:** Creating a new file in `functions/` without a corresponding test file.
**Why:** TDD enforcement — tests must exist before implementation.

**Fix:** Write the test file first (use `/test-gen`), then create the function.
**Bypass:** `SKIP_PIPELINE_GATE=true` (prepend to bash command)

### "CREDENTIAL DETECTED: Hardcoded SID/token/key"

**Hook:** `pre-write-validate.sh`
**Trigger:** File content contains patterns matching Twilio SIDs (`AC`, `SK`), auth tokens, or API keys.
**Why:** Prevents credential leaks in committed code.

**Fix:** Use environment variables (`process.env.TWILIO_ACCOUNT_SID`) instead of hardcoded values.
**Bypass:** `SKIP_CREDENTIALS=true` (only for test fixtures with fake credentials)

### "META MODE: Cannot write to production paths"

**Hook:** `pre-write-validate.sh`
**Trigger:** Writing to `functions/`, `agents/`, or `.claude/` paths when `.meta/` exists (meta-development mode).
**Why:** Separates factory development from shipped product code.

**Fix:** Use bash with the env var override:
```bash
CLAUDE_ALLOW_PRODUCTION_WRITE=true cat > functions/path/file.js << 'EOF'
...
EOF
```
**Do NOT:** Edit hooks, modify settings.json env blocks, or rename `.meta/`.

### "ABOUTME header required"

**Hook:** `pre-write-validate.sh`
**Trigger:** Creating a new `.js`, `.ts`, `.sh`, or `.md` file without ABOUTME comments in the first 2 lines.
**Why:** Every file should have a brief description for grepability.

**Fix:** Add two comment lines starting with `ABOUTME:` at the top of the file.

### "Blocked: --no-verify / force push"

**Hook:** `pre-bash-validate.sh`
**Trigger:** Git commands with `--no-verify`, `--force`, or force push to main/master.
**Why:** Prevents skipping pre-commit hooks and destructive remote operations.

**Fix:** Fix the underlying issue that's causing hook failures rather than bypassing them.

### "Pending actions require attention"

**Hook:** `session-checklist.sh` (at session end) or commit-time check
**Trigger:** Unresolved entries in pending-actions file.
**Why:** Documentation flywheel — ensures doc updates aren't forgotten.

**Fix:** Address the pending actions or defer them with a note.
**Bypass:** `SKIP_PENDING_ACTIONS=true git commit ...`

## Bypass Environment Variables

| Variable | Hook | Purpose |
|----------|------|---------|
| `SKIP_PIPELINE_GATE=true` | pre-write-validate | Skip TDD test-first enforcement |
| `SKIP_CREDENTIALS=true` | pre-write-validate | Skip credential pattern detection |
| `CLAUDE_ALLOW_PRODUCTION_WRITE=true` | pre-write-validate | Allow writes to production paths in meta-mode |
| `SKIP_PENDING_ACTIONS=true` | commit-time check | Skip pending actions blocker |

**Usage:** Prepend to a bash command:
```bash
SKIP_PIPELINE_GATE=true cat > functions/new-file.js << 'EOF'
// ABOUTME: ...
EOF
```

## Debugging Hook Failures

1. **Check which hook fired:** The error message includes the hook filename
2. **Read the hook source:** `.claude/hooks/<hook-name>.sh` — hooks are well-commented
3. **Check settings.json:** `.claude/settings.json` maps events to hooks
4. **Check settings.local.json:** May contain additional permissions or overrides
5. **Test a hook manually:** `printf '{"tool_input":{"file_path":"test.js","content":"test"}}' | bash .claude/hooks/pre-write-validate.sh`

## Hook Configuration

Hooks are configured in `.claude/settings.json` under the `hooks` key. Each hook maps to a lifecycle event:

- `PreToolUse` — Runs before Write/Edit or Bash (can block the action)
- `PostToolUse` — Runs after Write/Edit or Bash (observational, cannot block)
- `SessionStart` — Runs when a session begins or after context compaction
- `Stop` — Runs when the session ends
- `PreCompact` — Runs before context window compaction
- `SubagentStop` — Runs after a subagent completes
- `TaskCompleted` — Runs when a team task is marked complete
- `TeammateIdle` — Runs when a team agent goes idle
