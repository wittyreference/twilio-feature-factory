---
archived: 2026-02-01T12:00:00-08:00
branch: main
project: twilio-agent-factory
source: ~/.claude/plans/example-plan.md
title: Example Plan Template
---

# Example Plan Template

This is an example of how archived plans are formatted. When you exit plan mode, the `archive-plan.sh` hook automatically saves your plan here with metadata.

## Objective

[What the plan aims to accomplish]

---

## Implementation Tasks

### Task 1: [Task Name]

**Files:** `path/to/file.js`

**Description:** What needs to be done.

### Task 2: [Task Name]

**Files:** `path/to/another-file.js`

**Description:** What needs to be done.

---

## Critical Files

| File | Action |
|------|--------|
| `path/to/file.js` | Modify |
| `path/to/new-file.js` | Create |

---

## Verification

1. Run tests: `npm test`
2. Verify feature works as expected
3. Check no regressions

---

## Notes

- Plans are archived with timestamp and title slug
- Metadata header captures branch, project, and source file
- Archives go to `.meta/plans/` (meta-development, gitignored) OR `.claude/archive/plans/` (shipped, committed) based on environment
