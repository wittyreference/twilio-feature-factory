---
paths:
  - ".claude/commands/**"
  - ".claude/skills/**"
---

# Custom Slash Commands

## Workflow Commands

| Command | Description |
|---------|-------------|
| `/team [workflow] [task]` | Agent team coordinator - parallel multi-agent workflows |

## Development Subagents

| Command | Description |
|---------|-------------|
| `/architect [topic]` | Architect - design review, pattern selection, CLAUDE.md maintenance |
| `/prototype [topic]` | Quick spike to test unknowns — no tests, no docs, produces learnings |
| `/spec [feature]` | Specification writer - creates detailed technical specifications |
| `/test-gen [feature]` | Test generator - TDD Red Phase, writes failing tests first |
| `/dev [task]` | Developer - TDD Green Phase, implements to pass tests |
| `/review [target]` | Senior developer - code review, security audit, approval authority |
| `/test [scope]` | Test runner - executes and validates test suites |
| `/docs [scope]` | Technical writer - documentation updates and maintenance |

## Utility Commands

| Command | Description |
|---------|-------------|
| `/commit [scope]` | Git commit with pre-commit checks, conventional messages, todo tracking |
| `/push` | Push to remote with test verification and branch tracking |
| `/preflight` | Environment verification — CLI profile, env vars, auth validity |
| `/twilio-docs [topic]` | Searches Twilio documentation |
| `/twilio-logs` | Fetches and analyzes Twilio debugger logs |
| `/deploy [env]` | Deployment helper with pre/post checks |
| `/e2e-test [scope]` | E2E tests against live Twilio — real numbers, deep validation |
| `/validate [type] [SID]` | Deep validation of individual Twilio resources |
| `/context [action]` | Context optimization - summarize, load, or analyze context |
| `/recall [topic]` | Search accumulated knowledge — learnings, decisions, gotchas, domain docs |
| `/wrap-up [scope]` | End-of-session doc updates — learnings, CLAUDE.md, todo, pending actions |
| `/learn [action]` | Interactive learning exercises on autonomous work |
| `/plugin-sync` | Detect and reconcile drift between factory source and plugin distribution |
| `/ff-sync` | Detect drift between factory and generic feature-factory distribution |
| `/uber-validation` | Unified cross-repo validation — plugin dogfooding, sequential, chaos, FF cross-repo |
| `/uber-review` | Parallel multi-persona code review with synthesized cross-cutting report |
| `/check-updates [--force]` | Check for Claude Code and Agent SDK updates and new features |
| `/worktree-start [name]` | Start isolated git worktree for concurrent Claude Code sessions |
