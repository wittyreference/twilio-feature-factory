# Agent Teams Guide

Agent Teams (experimental) coordinate multiple Claude Code instances for parallel work. Each teammate gets its own context window and can communicate via direct messaging and a shared task list.

## How to Use

```
/team new-feature "Add SMS verification"
/team bug-fix "webhook returning 500 for empty body"
/team code-review functions/voice/
/team refactor functions/helpers/
```

## Configurations

| Team | Structure | Best For |
|------|-----------|----------|
| `new-feature` | Sequential build → parallel qa + review → docs | Complex features |
| `bug-fix` | 3 parallel investigators → fix → verify | Debugging |
| `code-review` | 3 parallel reviewers → cross-challenge | Thorough review |
| `refactor` | Parallel analysis → implement → parallel verify | Restructuring |

## Key Characteristics

- Lead operates in delegate mode (coordination only, no direct coding)
- Quality gates enforced via `TeammateIdle` and `TaskCompleted` hooks
- Teammates share findings via messaging — not just results flowing one direction
- ~2-3x token cost vs subagents — use for high-value tasks

## When to Use Teams vs Subagents

| Criteria | Use Subagents (`/orchestrate`) | Use Teams (`/team`) |
|----------|-------------------------------|---------------------|
| Task structure | Sequential, clear phases | Parallel or adversarial |
| Communication | Results flow one direction | Agents discuss findings |
| Context needs | Shared context is fine | Each agent needs fresh context |
| Token budget | Tight | Flexible (2-3x more) |
| Best for | Routine features | Bug debugging, code review, complex features |

## Enable/Disable

Enabled by default via `.claude/settings.json`:
```json
"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
```

To disable, remove the line above or override per-session:
```bash
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=0 claude
```

When disabled, `/team` won't work, `TeammateIdle`/`TaskCompleted` hooks are inert, and all existing subagent workflows continue unchanged.
