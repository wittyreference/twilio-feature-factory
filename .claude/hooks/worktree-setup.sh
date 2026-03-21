#!/bin/bash
# ABOUTME: Sets up a git worktree for concurrent Claude Code sessions.
# ABOUTME: Creates .meta symlink, copies .env, and verifies MCP build artifacts.

# Usage: worktree-setup.sh [--lane-b]
#   --lane-b: Copy .env.lane-b instead of .env (for validation sessions)

set -euo pipefail

# Detect main repo root from the git worktree relationship
MAIN_REPO=$(git worktree list --porcelain 2>/dev/null | head -1 | sed 's/^worktree //')
if [ -z "$MAIN_REPO" ]; then
    echo "ERROR: Not in a git worktree. Run this from inside a worktree created by EnterWorktree." >&2
    exit 1
fi

WORKTREE_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ "$WORKTREE_ROOT" = "$MAIN_REPO" ]; then
    echo "ERROR: You're in the main repo, not a worktree. Use EnterWorktree first." >&2
    exit 1
fi

LANE="a"
if [ "${1:-}" = "--lane-b" ]; then
    LANE="b"
fi

echo "Setting up worktree: $WORKTREE_ROOT"
echo "  Main repo: $MAIN_REPO"
echo "  Lane: $LANE"

# 1. Create .meta symlink with absolute path (resolves correctly from any worktree location)
WORKSHOP_DIR="/Users/mcarpenter/workspaces/factory-workshop"
if [ -d "$WORKSHOP_DIR" ]; then
    if [ ! -e "$WORKTREE_ROOT/.meta" ]; then
        ln -s "$WORKSHOP_DIR" "$WORKTREE_ROOT/.meta"
        echo "  .meta → $WORKSHOP_DIR (symlink created)"
    else
        echo "  .meta already exists (skipping)"
    fi
else
    echo "  WARNING: factory-workshop not found at $WORKSHOP_DIR — .meta not linked" >&2
fi

# 2. Copy .env (per-lane for resource isolation)
if [ "$LANE" = "b" ] && [ -f "$MAIN_REPO/.env.lane-b" ]; then
    cp "$MAIN_REPO/.env.lane-b" "$WORKTREE_ROOT/.env"
    echo "  .env copied from .env.lane-b (validation lane)"
elif [ -f "$MAIN_REPO/.env" ]; then
    cp "$MAIN_REPO/.env" "$WORKTREE_ROOT/.env"
    echo "  .env copied from main repo"
else
    echo "  WARNING: No .env found in main repo" >&2
fi

# 3. Symlink MCP server build artifacts (gitignored, so not in worktree checkout)
MCP_DIST="$MAIN_REPO/agents/mcp-servers/twilio/dist"
WORKTREE_MCP_DIR="$WORKTREE_ROOT/agents/mcp-servers/twilio"
if [ -d "$MCP_DIST" ] && [ -d "$WORKTREE_MCP_DIR" ]; then
    if [ ! -e "$WORKTREE_MCP_DIR/dist" ]; then
        ln -s "$MCP_DIST" "$WORKTREE_MCP_DIR/dist"
        echo "  MCP dist/ → main repo (symlink created)"
    else
        echo "  MCP dist/ already exists (skipping)"
    fi
fi

# 4. Symlink node_modules from main repo (if not present and main has it)
# Using symlink here because worktrees share the same package.json/lock.
# If this causes issues with .bin/ resolution, replace with: npm install --prefer-offline
if [ -d "$MAIN_REPO/node_modules" ] && [ ! -e "$WORKTREE_ROOT/node_modules" ]; then
    ln -s "$MAIN_REPO/node_modules" "$WORKTREE_ROOT/node_modules"
    echo "  node_modules → main repo (symlink created)"
fi

# 5. Copy .envrc if direnv is used
if [ -f "$MAIN_REPO/.envrc" ] && [ ! -f "$WORKTREE_ROOT/.envrc" ]; then
    cp "$MAIN_REPO/.envrc" "$WORKTREE_ROOT/.envrc"
    if command -v direnv &>/dev/null; then
        (cd "$WORKTREE_ROOT" && direnv allow . 2>/dev/null || true)
    fi
    echo "  .envrc copied and allowed"
fi

echo ""
echo "Worktree ready. Branch: $(git branch --show-current)"
echo "To return: ExitWorktree(action: 'keep') or ExitWorktree(action: 'remove')"
