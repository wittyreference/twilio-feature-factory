# Context Optimization

Optimize context for the current session. Load the `context-engineering` skill for techniques.

## Actions

**`/context summarize`** — Summarize session progress: completed tasks, in-progress work, key decisions, files modified. Use after 10+ exchanges to free up context.

**`/context load [task]`** — Identify which domain CLAUDE.md, skills, and reference docs to load for a task. Avoid loading unrelated domains.

**`/context analyze`** — Audit current context efficiency: estimate token usage, flag candidates for removal, recommend compression.

## Quick Compression Reference

| Content | Compress To |
|---------|-------------|
| TwiML | `Say(x) → Gather(y) → Dial(z)` |
| Webhook | `SMS from +1555...4567: "Hello" (SMxxx)` |
| Tests (pass) | `Tests: 12 passed (voice: 4, msg: 4, verify: 4)` |
| Errors | `Error 11200: /voice/incoming 502 — 5x in 2 min` |

For full techniques, load the `context-engineering` skill.

$ARGUMENTS
