# Documentation Flywheel

This document describes the documentation flywheel system - an automated workflow for keeping project documentation in sync with code changes.

## Overview

The flywheel automatically tracks file changes and suggests documentation updates. It combines three sources of information:

1. **Uncommitted files** - Changes detected via `git status`
2. **Recent commits** - Files changed since the session started
3. **Session-tracked files** - All files touched during the current work session

## Workflow

```
1. Work happens (Write/Edit/Bash operations)
        |
        v
2. post-write.sh tracks files to .session-files
        |
        v
3. flywheel-doc-check.sh analyzes all sources
        |
        v
4. Suggestions appended to pending-actions.md
        |
        v
5. Pre-commit shows pending action count
        |
        v
6. Review and address suggestions
```

## Files

| File | Purpose |
|------|---------|
| `.claude/hooks/flywheel-doc-check.sh` | Analyzes changes and generates suggestions |
| `.claude/hooks/flywheel-session-summary.sh` | End-of-session review reminder |
| `.claude/pending-actions.md` | Queued documentation suggestions |
| `.claude/learnings.md` | Session discoveries (capture -> promote -> clear) |
| `.claude/.session-start` | Timestamp when session began |
| `.claude/.session-files` | Files touched during session |
| `.claude/.last-doc-check` | Debounce for doc-update-check |

## Suggestions Generated

| Files Changed | Suggested Doc Update |
|---------------|---------------------|
| `agents/mcp-servers/*` | MCP CLAUDE.md, tool-boundaries.md |
| `functions/<domain>/*` | Domain CLAUDE.md |
| `agents/feature-factory/*` | Feature Factory CLAUDE.md |
| `.claude/hooks/*` | Root CLAUDE.md hooks section |
| `__tests__/*` | Root CLAUDE.md test patterns |
| `*.env*` | .env.example |

## Learnings Workflow

Use `learnings.md` for the capture-promote-clear workflow:

### 1. Capture (During Work)

Add discoveries to `learnings.md`:

```markdown
## [YYYY-MM-DD] Session X - Topic

**Discoveries:**

1. **Finding title**: What you learned
   - Details and context
```

### 2. Promote (After Session)

Move stable learnings to permanent docs:

| Discovery Type | Target Doc |
|----------------|------------|
| Architectural choices | DESIGN_DECISIONS.md |
| API quirks/gotchas | Relevant CLAUDE.md |
| CLI patterns | .claude/references/twilio-cli.md |
| Tool boundaries | .claude/references/tool-boundaries.md |

### 3. Clear

Remove promoted entries from `learnings.md` to keep it focused on current session.

## Enabling the Flywheel

The flywheel hooks are available but disabled by default. To enable them, add to your `.claude/settings.json`:

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "command": "./.claude/hooks/flywheel-doc-check.sh",
        "description": "Documentation flywheel - suggest doc updates"
      }
    ],
    "Stop": [
      {
        "command": "./.claude/hooks/flywheel-session-summary.sh",
        "description": "Session documentation review"
      }
    ]
  }
}
```

## Key Documents to Maintain

| Document | Update When |
|----------|-------------|
| `DESIGN_DECISIONS.md` | New architectural choice made |
| `API_REFERENCE.md` | New API used/discovered |
| `.claude/references/tool-boundaries.md` | Boundary clarified/changed |
| `.claude/references/twilio-cli.md` | New CLI pattern used |
| Various `CLAUDE.md` files | New patterns learned |
| `todo.md` | Session work completed |

## Session State Reset

To reset session tracking:

```bash
rm .claude/.session-start .claude/.session-files
```

The next file write operation will automatically recreate these files.
