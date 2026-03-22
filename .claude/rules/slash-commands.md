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

## Domain Guides

| Command | Description |
|---------|-------------|
| `/video` | Twilio Video development guide — rooms, participants, recordings, compositions |
| `/voice` | Twilio Voice development guide — IVR, contact centers, Voice AI, TwiML, Calls API |
| `/voice-use-case-map` | Voice use case to Twilio product mapping — IVR, contact center, conferencing, SIP |

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
| `/super-uber-validation` | Exhaustive validation — ALL 10 UCs, ALL 7 chaos archetypes, ALL 6 FF repos (~70-90 min) |
| `/uber-review` | Parallel multi-persona code review with synthesized cross-cutting report |
| `/value-audit` | Three-pass adversarial review — detect value leakage to plugin/ff repos |
| `/help-twilio [use case]` | Find the right Twilio skill — use case to skill navigator |
| `/check-updates [--force]` | Check for Claude Code and Agent SDK updates and new features |
| `/worktree-start [name]` | Start isolated git worktree for concurrent Claude Code sessions |
