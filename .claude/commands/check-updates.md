---
description: Check for Claude Code and Agent SDK updates. Use when user asks about updates, new features, changelog, or what's new.
---

Check for available updates and new Claude Code / Agent SDK features.

## Version Check

Run `./scripts/check-updates.sh --force` to bypass cache and check now. Report the output to the user.

If an update is available, show the version difference and update instructions. If already up to date, confirm that.

## Changelog Monitor

Run `./scripts/check-changelog.sh --force` to check for new features in Claude Code and Agent SDK releases.

Then read the digest file at `.claude/.update-cache/changelog-digest.md` and present the findings:

1. **Integration Opportunities** — New settings, hooks, commands, or capabilities we could adopt
2. **Behavioral Changes** — Things that changed that might affect our hooks or skills
3. **Relevant Fixes** — Bug fixes for things we depend on

For each integration opportunity, recommend whether to:
- **Adopt now** (add to settings.json or update a hook)
- **Add to todo** (needs design work, add to `.meta/todo.md`)
- **Skip** (not relevant to our use case)
