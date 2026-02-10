---
paths:
  - "agents/**"
  - ".claude/commands/**"
  - ".claude/skills/**"
---

# Development Tools Architecture

## How It Works

```text
┌─────────────────────────────────────────────────────────────────┐
│  Claude Code (Interactive Orchestrator)                         │
│  ───────────────────────────────────────────────────────────────│
│  Single session │ Agent Teams │ Plan mode → Approval            │
└─────────────────────────────────────────────────────────────────┘
                              │
                    invokes as needed
                              │
    ┌───────────────┬─────────┼─────────┬─────────────────┐
    │               │         │         │                 │
    ▼               ▼         ▼         ▼                 ▼
┌─────────────┐ ┌─────────┐ ┌─────────────┐ ┌─────────────────┐
│ Slash Cmds  │ │  Agent  │ │ MCP Server  │ │ Voice AI Builder│
│ ────────────│ │  Teams  │ │ ────────────│ │ ────────────────│
│ /architect  │ │ ────────│ │ Twilio APIs │ │ Code generators │
│ /spec       │ │ /team   │ │ as tools    │ │ for voice apps  │
│ /test-gen   │ │ Parallel│ │             │ │                 │
│ /dev        │ │ multi-  │ │ • Send SMS  │ │ • TwiML handlers│
│ /review     │ │ agent   │ │ • Make calls│ │ • WebSocket svrs│
│ /docs       │ │ work    │ │ • Query logs│ │ • Templates     │
└─────────────┘ └─────────┘ └─────────────┘ └─────────────────┘

         OR (for headless automation)

┌─────────────────────────────────────────────────────────────────┐
│  Feature Factory (Claude Agent SDK)                             │
│  ───────────────────────────────────────────────────────────────│
│  npx feature-factory new-feature "task"                         │
│  CI/CD pipelines, programmatic access                           │
└─────────────────────────────────────────────────────────────────┘
```

## When to Use What

**Claude Code (Interactive — Single Session):**
- Working in the CLI interactively
- Plan mode + approval workflow
- Invoke slash commands as needed

**Claude Code (Interactive — Agent Teams):**
- Parallel work where agents communicate
- Bug debugging with competing hypotheses
- Multi-lens code review (security + performance + tests)
- See the `agent-teams-guide` skill for details

**Feature Factory (Headless):**
- CI/CD automation, programmatic access
- Running workflows without human interaction

## MCP Server (`agents/mcp-servers/twilio/`)

Exposes Twilio APIs as 248+ tools: Messaging, Voice, Verify, Sync, TaskRouter, Debugger, Phone Numbers, and more. See `agents/mcp-servers/twilio/CLAUDE.md` for patterns.
