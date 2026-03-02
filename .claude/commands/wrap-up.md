# Session Wrap-Up

Review the current session's work and update all relevant documentation before committing.

## Steps

### 1. Gather Session Context

Determine environment:
- If `.meta/` exists → meta-development mode (learnings: `.meta/learnings.md`, pending: `.meta/pending-actions.md`, todo: `.meta/todo.md`)
- Otherwise → standard mode (learnings: `.claude/learnings.md`, pending: `.claude/pending-actions.md`, todo: `todo.md`)

Collect what changed this session:
```bash
git diff --name-only HEAD  # unstaged + staged changes vs last commit
git diff --cached --name-only  # staged changes only
```

Read the pending actions file for flywheel-generated suggestions.

### 2. Capture Learnings

Review the session's changes and identify anything worth recording:
- Debugging insights or root causes discovered
- API quirks or gotchas encountered
- Patterns that worked (or didn't)
- Configuration pitfalls

Add entries to the learnings file using the standard format:
```markdown
## [YYYY-MM-DD] Topic

**Discoveries:**

1. **Finding**: What was learned
   - Context and details
```

If a learning is stable and broadly applicable, promote it directly to the target doc (CLAUDE.md, DESIGN_DECISIONS.md, hooks-reference, etc.) and note "Promoted to: [target]" in the learnings entry.

### 3. Update Documentation

For each changed file, determine if documentation needs updating:

| Changed Area | Check These Docs |
|--------------|------------------|
| `.claude/hooks/` | `.claude/skills/hooks-reference.md`, root CLAUDE.md (if behavior changed) |
| `functions/voice/` | `functions/voice/CLAUDE.md` |
| `functions/messaging/` | `functions/messaging/CLAUDE.md` |
| `functions/conversation-relay/` | `functions/conversation-relay/CLAUDE.md` |
| `agents/mcp-servers/twilio/` | `agents/mcp-servers/twilio/CLAUDE.md` |
| `scripts/` | `scripts/CLAUDE.md` |
| Architecture changes | `DESIGN_DECISIONS.md` |
| New slash commands or skills | Root CLAUDE.md slash command table |
| New invariants | Root CLAUDE.md "Architectural Invariants" section |

Only update docs where the session's changes actually warrant it. Don't touch docs for unrelated areas.

### 4. Sync Auto-Memory ↔ Shipped Docs

**Promote outward**: Check auto-memory for entries that should be in shipped docs:

| Entry Type | Promote To |
|------------|------------|
| API/SDK gotcha (clear domain) | Domain CLAUDE.md Gotchas section |
| Cross-cutting gotcha | `.claude/references/operational-gotchas.md` |
| CLI quirk | `.claude/references/twilio-cli.md` |
| High-impact rule | Root CLAUDE.md "Architectural Invariants" |
| Architectural decision (why X over Y) | `DESIGN_DECISIONS.md` (new D## entry) |
| Per-developer convention | Keep in auto-memory |

After promoting, replace the detailed item with a pointer (e.g., "See functions/voice/CLAUDE.md#gotchas"). Don't delete — pointers prevent re-discovery of the same gotcha.

**Cross-check learnings ↔ auto-memory**: Ensure nothing fell through the cracks:
- Read the session learnings file — are there entries that should also be in auto-memory (for cross-session persistence)?
- Read auto-memory — are there entries from this session that should also be in the learnings file (for the promote/clear flywheel)?
- Are there auto-memory entries that represent an architectural choice worth recording in `DESIGN_DECISIONS.md`? Signs: "we chose X over Y", "US1 is default because...", "regional requires explicit opt-in".

**Capture inward**: Add session learnings that should persist across sessions to auto-memory at `~/.claude/projects/-Users-mcarpenter-workspaces-twilio-feature-factory/memory/MEMORY.md`.

### 4b. Refresh meta-for-dummies.md (meta mode only)

If in meta-development mode and this session produced debugging gotchas or operational discoveries:
- Check if `.meta/meta-for-dummies.md` covers the gotcha
- If not, add it to the relevant section (Environment & MCP Gotchas, The 5 Things You'll Get Wrong, or Validation Gotchas)
- This is a quick check, not a rewrite — skip if nothing was discovered

### 5. Update Todo

If the session completed or progressed a tracked task, update the todo file.

### 5b. Generate Learning Exercises

If significant code was produced this session (especially from autonomous work via headless, `/orchestrate`, or `/team`), check for and generate learning exercises:

1. Check if `.meta/learning/session-log.jsonl` has events
2. If so, run the exercise generation: `bash .claude/hooks/generate-learning-exercises.sh`
3. Report how many exercises were generated for the next interactive session
4. If no events were logged, skip this step

### 6. Clear Pending Actions

After addressing flywheel suggestions, clear the pending actions file:
```markdown
# Pending Documentation Actions

Actions detected by the documentation flywheel. Review before committing.

---

<!-- Doc suggestions will be appended below this line by flywheel-doc-check.sh -->
```

### 7. Summary

Output what was updated:

```markdown
## Session Wrap-Up Complete

### Learnings Captured
- [list of entries added]

### Docs Updated
- [list of files modified with brief reason]

### Todo
- [items checked off or updated]

### Ready to Commit
[yes/no — and what to commit]
```

## Notes

- This is a review-and-update pass, not a rewrite. Make targeted edits.
- If nothing meaningful was learned or no docs need updating, say so — don't manufacture busywork.
- The user should review the changes before committing.

## Scope

$ARGUMENTS
