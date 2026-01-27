# Documentation Reference Map

Quick lookup for which documentation to check BEFORE taking action.

## Documentation Index

### By Topic

| Topic | Primary Doc | Related |
|-------|-------------|---------|
| Project overview | [README.md](/README.md) | [CLAUDE.md](/CLAUDE.md) |
| Agent architecture | [agents/README.md](/agents/README.md) | [feature-factory/CLAUDE.md](/agents/feature-factory/CLAUDE.md) |
| MCP Server tools | [agents/mcp-servers/twilio/CLAUDE.md](/agents/mcp-servers/twilio/CLAUDE.md) | [API_REFERENCE.md](/agents/mcp-servers/twilio/docs/API_REFERENCE.md) |
| Voice AI Builder | [agents/voice-ai-builder/CLAUDE.md](/agents/voice-ai-builder/CLAUDE.md) | [conversation-relay/CLAUDE.md](/functions/conversation-relay/CLAUDE.md) |
| Deep validation | [validation/CLAUDE.md](/agents/mcp-servers/twilio/src/validation/CLAUDE.md) | - |
| Twilio CLI | [twilio-cli.md](/.claude/references/twilio-cli.md) | - |
| Tool boundaries | [tool-boundaries.md](/.claude/references/tool-boundaries.md) | - |
| Getting started | [WALKTHROUGH.md](/WALKTHROUGH.md) | - |

### By Directory

**Root**: README.md, CLAUDE.md, WALKTHROUGH.md, DESIGN_DECISIONS.md

**Agents** (`agents/`):
- `agents/README.md` - Architecture overview
- `agents/mcp-servers/twilio/CLAUDE.md` - MCP Server (P0 tools implemented)
- `agents/feature-factory/CLAUDE.md` - Feature Factory orchestrator
- `agents/voice-ai-builder/CLAUDE.md` - Voice AI generators

**Functions** (`functions/`): Each domain has its own CLAUDE.md
- voice, messaging, conversation-relay, verify, sync, taskrouter, callbacks, messaging-services

**References** (`.claude/references/`): twilio-cli.md, tool-boundaries.md, doc-map.md

---

## Principle: Check → Act → Record

1. **CHECK** the relevant doc below before any operation
2. **ACT** using the documented patterns exactly
3. **RECORD** discoveries to `.claude/learnings.md` if patterns are missing or wrong

---

## Before CLI Operations

| Operation | Check First | Key Sections |
|-----------|-------------|--------------|
| `twilio *` | `.claude/references/twilio-cli.md` | Relevant command section |
| `twilio serverless:*` | `.claude/references/twilio-cli.md` | Serverless section |
| `twilio phone-numbers:*` | `.claude/references/twilio-cli.md` | Phone Numbers section |
| `twilio api:*` | `.claude/references/twilio-cli.md` | API Commands section |
| `twilio profiles:*` | `.claude/references/twilio-cli.md` | Profile Management section |
| `npm test` | Root `CLAUDE.md` | Testing section |
| `npm run deploy` | `.claude/references/tool-boundaries.md` | Deployment boundaries |
| `git commit` | Root `CLAUDE.md` | Writing code section |

---

## Before API/SDK Operations

| Domain | Check First | Key Patterns |
|--------|-------------|--------------|
| Voice calls | `functions/voice/CLAUDE.md` | TwiML verbs, webhooks |
| SMS/MMS | `functions/messaging/CLAUDE.md` | Message parameters, status callbacks |
| Verification (OTP) | `functions/verify/CLAUDE.md` | Start/check flow, error codes |
| Real-time state | `functions/sync/CLAUDE.md` | Documents, Lists, Maps, Streams |
| Task routing | `functions/taskrouter/CLAUDE.md` | Workers, queues, workflows |
| Messaging Services | `functions/messaging-services/CLAUDE.md` | Sender pools, compliance |
| Voice AI | `functions/conversation-relay/CLAUDE.md` | WebSocket protocol |
| Status callbacks | `functions/callbacks/CLAUDE.md` | Callback signatures, Sync logging |

---

## Before Code Changes

| Area | Check First | What to Look For |
|------|-------------|------------------|
| New serverless function | Domain `CLAUDE.md` | File naming, access levels, patterns |
| MCP tool implementation | `agents/mcp-servers/twilio/CLAUDE.md` | Tool structure, validation patterns |
| MCP deep validation | `agents/mcp-servers/twilio/src/validation/CLAUDE.md` | Validation helpers |
| Feature Factory agent | `agents/feature-factory/CLAUDE.md` | Agent config structure |
| Hook script | Root `CLAUDE.md` | Hooks section, exit codes |
| Test file | Root `CLAUDE.md` | Testing frameworks, TDD process |

---

## Before Deployment

| Step | Check First | Verify |
|------|-------------|--------|
| Pre-deploy | `.claude/references/tool-boundaries.md` | Correct tool for job |
| Environment vars | `.env.example` | All required vars documented |
| Webhook URLs | Domain `CLAUDE.md` | URL patterns, callback setup |

---

## When Uncertain

If you don't know which doc to check:

1. **Start with root `CLAUDE.md`** - Has documentation navigator table
2. **Check this file** - Scan tables above for keywords
3. **If still unclear** - Add a question to `.claude/learnings.md` under "Open Questions"

---

## Recording Discoveries

When you find:
- **Missing patterns**: Add to `.claude/learnings.md`, then update the relevant doc
- **Wrong patterns**: Fix the doc immediately, note in learnings
- **API quirks**: Add to learnings for review and promotion
- **CLI gotchas**: Update `.claude/references/twilio-cli.md`

### Learnings Format

```markdown
## [YYYY-MM-DD] Session N - Topic

**Discoveries:**

1. **Title**: Brief description
   - What you tried
   - What happened
   - Correct approach
   - **Promote to**: [target doc]
```

---

## Quick Reference: Common Mistakes

| Mistake | Prevention |
|---------|------------|
| Wrong CLI flag syntax | Check twilio-cli.md, flags are presence-based not `=true` |
| Wrong Twilio account | Verify `twilio profiles:list` shows correct active profile |
| Missing callback URL | Check domain CLAUDE.md for required webhooks |
| Hardcoded credentials | Pre-write hook blocks this, use env vars |
| Skipping tests | TDD required, write failing test first |
