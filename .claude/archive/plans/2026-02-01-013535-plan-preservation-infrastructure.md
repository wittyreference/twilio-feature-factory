---
archived: 2026-02-01T01:35:35-08:00
branch: main
project: twilio-agent-factory
source: ~/.claude/plans/deep-nibbling-castle.md
title: Plan Preservation Infrastructure
---


# Plan Preservation Infrastructure

## Objective

Ensure plan files are saved for posterity when exiting plan mode, not just temporarily stored in `~/.claude/plans/` and potentially overwritten.

---

## Current State

**Where plans live now:**
- `~/.claude/plans/` - Claude Code's native storage (user home, not project)
- Files have auto-generated names like `deep-nibbling-castle.md`
- Plans get overwritten when new plans are created for the same session

**Available hook events:**
- `PreToolUse`, `PostToolUse`, `SubagentStop`, `Stop`
- **No `ExitPlanMode` event exists** - this is a limitation

**Existing session artifacts in project:**
- `.claude-dev/` - gitignored local development directory
- `.claude/logs/` - subagent activity logs
- `.claude/.session-files` - file tracking

---

## Proposed Solution

Create a `Stop` hook that archives the current plan when a session ends.

### How It Works

```
Session ends (Stop event)
        ↓
archive-plan.sh hook runs
        ↓
Finds most recent plan in ~/.claude/plans/
        ↓
Copies to .claude-dev/plans/ with metadata
        ↓
Optionally commits to .claude/archive/plans/ (version controlled)
```

### Storage Locations

| Location | Purpose | Git Status |
|----------|---------|------------|
| `~/.claude/plans/` | Claude Code's working copy | N/A (user home) |
| `.claude-dev/plans/` | Local archive with metadata | gitignored |
| `.claude/archive/plans/` | Version-controlled archive | committed |

---

## Implementation Tasks

### Task 1: Create Directory Structure

```
.claude-dev/plans/           # Meta-work archive (gitignored, our development plans)
.claude/archive/plans/       # Shipped product archive (committed, for users)
```

### Task 2: Create `archive-plan.sh` Hook

**File:** `.claude/hooks/archive-plan.sh`

**Logic:**
1. Find most recent `.md` file in `~/.claude/plans/`
2. Extract plan title from first `# ` heading
3. Generate archive filename: `YYYY-MM-DD-HHMMSS-title-slug.md`
4. Add metadata header (timestamp, branch, project, source)
5. Copy to BOTH archive locations:
   - `.claude-dev/plans/` (always, for meta-work)
   - `.claude/archive/plans/` (for shipped product feature)

**Filename format:** `2026-02-01-153045-plan-preservation-infrastructure.md`

**Metadata header:**
```markdown
---
archived: 2026-02-01T15:30:45Z
branch: main
project: twilio-agent-factory
source: ~/.claude/plans/deep-nibbling-castle.md
title: Plan Preservation Infrastructure
---
```

### Task 3: Register Hook in settings.json

Add to existing `.claude/settings.json` hooks:
```json
{
  "hooks": {
    "Stop": [
      {
        "command": ".claude/hooks/archive-plan.sh"
      }
    ]
  }
}
```

### Task 4: Create Example Plan File

**File:** `.claude/archive/plans/example.md`

A template showing the expected format for archived plans. This ships with the repo so users understand the feature.

### Task 5: Update .gitignore

Add explicit entry for `.claude-dev/plans/` (covered by `.claude-dev/` but explicit is clearer).

Keep `.claude/archive/plans/` tracked (NOT in gitignore).

### Task 6: Document the Feature

**In root CLAUDE.md** under "Claude Code Hooks" section:
- Explain plan archival behavior
- Where to find archived plans (`.claude/archive/plans/`)
- How metadata is captured
- Note that meta-work plans go to `.claude-dev/plans/` (local only)

### Task 7: Initial Archive of This Plan

After implementing, archive the current plan as the first entry in `.claude-dev/plans/`.

---

## Critical Files

| File | Action | Ships? |
|------|--------|--------|
| `.claude/hooks/archive-plan.sh` | NEW - archive hook | Yes |
| `.claude/settings.json` | Add Stop hook entry | Yes |
| `.claude/archive/plans/` | NEW - directory | Yes |
| `.claude/archive/plans/example.md` | NEW - example template | Yes |
| `CLAUDE.md` | Document feature | Yes |
| `.claude-dev/plans/` | NEW - directory | No (gitignored) |

---

## Verification

1. Create directories and hook
2. End a session (triggers Stop event)
3. Check `.claude-dev/plans/` for archived plan
4. Check `.claude/archive/plans/` for archived plan
5. Verify filename format: `YYYY-MM-DD-HHMMSS-title-slug.md`
6. Verify metadata header is present
7. Run `git status` - `.claude/archive/plans/` should show new file
8. Run `git status` - `.claude-dev/plans/` should NOT appear (gitignored)

---

## Alternatives Considered

### Alternative A: Manual `/archive-plan` Command
- Pro: User controls when to archive
- Con: Easy to forget, defeats "for posterity" goal

### Alternative B: PostToolUse on Plan File Writes
- Pro: Captures every plan update
- Con: Too noisy, no way to match tool to plan file path

### Alternative C: Commit Plans Automatically
- Pro: Full git history
- Con: Clutters commit history with meta artifacts

**Chosen: Stop Hook** - Best balance of automation and minimal noise.

---

## Design Decision (User Input)

**Two separate archive locations with different purposes:**

| Location | Purpose | Git Status |
|----------|---------|------------|
| `.claude-dev/plans/` | Meta-work plans (our development) | gitignored |
| `.claude/archive/plans/` | Shipped product (for users of this repo) | committed |

**Key requirements:**
1. Every plan mode exit creates a NEW file (not overwritten)
2. Filename: descriptive + timestamped for debugging
3. Meta-work plans stay in `.claude-dev/` only (never public)
4. Public repo gets the hook + example file only

**What ships vs. what stays local:**

| Artifact | Ships? | Location |
|----------|--------|----------|
| `archive-plan.sh` hook | Yes | `.claude/hooks/` |
| Example plan file | Yes | `.claude/archive/plans/example.md` |
| Hook documentation | Yes | Root CLAUDE.md |
| Our actual plans | No | `.claude-dev/plans/` only |
