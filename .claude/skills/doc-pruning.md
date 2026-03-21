---
name: doc-pruning
description: Identify stale, redundant, or oversized documentation. Companion to doc-flywheel. Use when context costs seem high, docs feel bloated, or before major releases to trim documentation debt.
---

# Documentation Pruning

Companion to the doc-flywheel's capture-promote-clear cycle. The flywheel adds knowledge; pruning removes what no longer earns its context cost.

## When to Prune

- After several sessions of flywheel captures (learnings growing unbounded)
- When Claude Code feels slow or ignores instructions (context overload signal)
- Before distribution or plugin sync (shipping minimal, high-signal docs)
- When the ETH Zurich rule applies: less context often outperforms more

## Pruning Checklist

### 1. Learnings File Audit

Check for entries that were promoted but never cleared:

```bash
# Show learnings file size
wc -l .meta/learnings.md 2>/dev/null || wc -l .claude/learnings.md 2>/dev/null

# Compare learnings entries against stable docs for duplication
# Promoted entries should be in domain CLAUDE.md, DESIGN_DECISIONS.md, or operational-gotchas.md
```

**Action**: Clear promoted entries (archive to `learnings-archive.md` first per flywheel protocol).

### 2. Pending Actions Staleness

```bash
# Show pending actions age
cat .meta/pending-actions.json 2>/dev/null || cat .claude/pending-actions.json 2>/dev/null
```

**Action**: Items older than 7 days are likely stale. Remove them — if they were important, they'll resurface.

### 3. CLAUDE.md Context Cost

Estimate total tokens loaded across all CLAUDE.md files:

```bash
# Count total lines across all CLAUDE.md files
find . -name "CLAUDE.md" -not -path "*/node_modules/*" -not -path "*/.meta/*" | \
    xargs wc -l | tail -1
```

**Target**: Root CLAUDE.md under 300 lines. Domain CLAUDE.md files under 150 lines each. Total system under 2000 lines.

### 4. Duplicate Content Detection

Check for the same guidance appearing in multiple locations:

```bash
# Find potential duplicates across CLAUDE.md files
for term in "FriendlyName" "jq" "ABOUTME" "--no-verify" "coverage"; do
    echo "=== $term ==="
    grep -rl "$term" --include="CLAUDE.md" . 2>/dev/null | grep -v node_modules
done
```

**Rule**: Each piece of guidance lives in ONE canonical location. Other files reference it, not duplicate it. The doc-navigator (`doc-navigator.md`) is the lookup table.

### 5. Skills and Rules Size Check

```bash
# Skills over 5KB are probably too large (progressive disclosure should keep them lean)
find .claude/skills -name "*.md" -size +5k 2>/dev/null
find .claude/rules -name "*.md" -size +5k 2>/dev/null
```

**Action**: Large skills should be split or have content moved to reference files.

### 6. Stale References

```bash
# Check if referenced files still exist
grep -roE '\[.*\]\((/[^)]+|\.claude/[^)]+)\)' CLAUDE.md .claude/skills/ .claude/rules/ 2>/dev/null | \
    sed 's/.*(\(.*\))/\1/' | sort -u | while read -r ref; do
        [ ! -f ".${ref}" ] && [ ! -f "${ref}" ] && echo "DEAD REF: $ref"
    done
```

**Action**: Fix or remove dead references.

## Pruning Principles

1. **Context is a budget, not a backlog** — every line loaded costs tokens and attention
2. **If grep can find it, the doc doesn't need to say it** — don't document what's obvious from code
3. **Recency bias is real** — recent learnings feel important but may not be durable
4. **The ETH Zurich finding**: LLM-generated context files decrease performance by 3%. Human-written files help marginally (+4%) but increase costs. Less is more.
5. **Pruning is not deletion** — archive before removing, so the history survives in git

## After Pruning

1. Update doc-navigator if any files were removed or consolidated
2. Run a quick session to verify Claude Code still follows key instructions
3. Commit with message: `docs: prune documentation (N lines removed, M files consolidated)`
