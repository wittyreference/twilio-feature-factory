# Claude Code Hooks Reference

This project uses Claude Code hooks (configured in `.claude/settings.json`) to enforce coding standards automatically.

## Active Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| `pre-write-validate.sh` | PreToolUse (Write/Edit) | Blocks credentials, magic test numbers; warns on naming |
| `pre-bash-validate.sh` | PreToolUse (Bash) | Blocks --no-verify, pending-actions, validates deploy |
| `flywheel-doc-check.sh` | PreToolUse (Bash) | Suggests doc updates including todo.md |
| `post-write.sh` | PostToolUse (Write/Edit) | Auto-lints JS/TS files with ESLint |
| `post-bash.sh` | PostToolUse (Bash) | Logs deploy/test completions |
| `session-start-log.sh` | SessionStart (all) | Logs session starts, captures compaction summaries, resets session tracking |
| `post-compact-summary.sh` | SessionStart (compact) | Extracts compaction summary from transcript |
| `subagent-log.sh` | SubagentStop | Logs workflow activity |
| `teammate-idle-check.sh` | TeammateIdle | Quality gate before teammate goes idle |
| `task-completed-check.sh` | TaskCompleted | TDD/coverage/credential gate on task completion |
| `archive-plan.sh` | Stop | Archives plan files with metadata |
| `notify-ready.sh` | Stop | Desktop notification when done |

## What Gets Blocked (Exit Code 2)

- Hardcoded Twilio credentials (`AC...`, `SK...`, auth tokens)
- `git commit --no-verify` or `git commit -n`
- `git commit` with unaddressed pending-actions.md (override: `SKIP_PENDING_ACTIONS=true`)
- `git push --force` to main/master
- Deployment when tests fail
- Deployment when coverage < 80% (statements or branches)
- Deployment when linting fails
- New function files without ABOUTME comments
- Twilio magic test numbers (`+15005550xxx`) in non-test files

## What Gets Warned (Non-blocking)

- Non-evergreen naming patterns (`ImprovedX`, `NewHandler`, `BetterY`, `EnhancedZ`)
- High-risk assertions in CLAUDE.md files without citations
- Test files without ABOUTME comments
- `.meta/` references in staged changes (potential leakage)

## Commit Checklist

On every `git commit`, the hook displays a reminder checklist:
- Updated `.meta/todo.md`?
- Captured learnings in `.claude/learnings.md`?
- Design decision documented if architectural?

## Hook Scripts Location

All hook scripts are in `.claude/hooks/` and can be modified to adjust behavior.

## Plan Archival

When a Claude Code session ends, `archive-plan.sh` preserves the current plan file.

**Environment-aware archival:**

| Environment | Writes To | Purpose |
|-------------|-----------|---------|
| Meta-development (`.meta/` exists) | `.meta/plans/` | Local plans (gitignored) |
| Shipped product (no `.meta/`) | `.claude/archive/plans/` | User plans (committed) |

**What gets archived:**
- Plans modified within the last hour (likely from current session)
- Plan content with added metadata header (timestamp, branch, project, source)
- Descriptive filename: `YYYY-MM-DD-HHMMSS-plan-title-slug.md`

**Metadata captured:**
```yaml
archived: 2026-02-01T15:30:45-08:00
branch: main
project: twilio-agent-factory
source: ~/.claude/plans/deep-nibbling-castle.md
title: Plan Title From First Heading
```
