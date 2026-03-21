---
description: Start an isolated worktree for concurrent work. Use when this session will write code or commit to twilio-feature-factory.
---

# Worktree Start

Create an isolated git worktree for this session so it doesn't interfere with other concurrent Claude Code sessions.

## Steps

### 1. Create the worktree

Call `EnterWorktree` with a descriptive name based on the work being done:
- Feature work: `EnterWorktree("feat-sms-retry")`
- Validation: `EnterWorktree("val-sequential")`
- Bug fix: `EnterWorktree("fix-webhook-timeout")`
- Refactor: `EnterWorktree("refactor-helpers")`

### 2. Run the setup script

After `EnterWorktree` completes:

```bash
bash .claude/hooks/worktree-setup.sh
```

For validation sessions that need separate Twilio resources (to avoid webhook collisions with the main session), use lane B:

```bash
bash .claude/hooks/worktree-setup.sh --lane-b
```

### 3. Verify setup

Confirm the setup is working:
- `.meta/` exists and is a directory (symlink to factory-workshop)
- `.env` exists with credentials
- `node_modules/` exists
- MCP tools are available (they use the parent session's MCP server)

### 4. Work normally

Commits go to the worktree's branch (named after the worktree). The main repo's branch is unaffected.

### 5. When done

- To keep work for review/merge: `ExitWorktree(action: "keep")`
- To discard: `ExitWorktree(action: "remove")`

After keeping, merge the branch to main:
```bash
git merge <worktree-branch-name>
```
