#!/bin/bash
# ABOUTME: Archives the current plan file when a Claude Code session ends.
# ABOUTME: Copies plans to .claude-dev/plans/ (local) and .claude/archive/plans/ (shipped).

set -euo pipefail

# Directories
CLAUDE_PLANS_DIR="$HOME/.claude/plans"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
META_ARCHIVE="$PROJECT_ROOT/.claude-dev/plans"
SHIPPED_ARCHIVE="$PROJECT_ROOT/.claude/archive/plans"

# Ensure archive directories exist
mkdir -p "$META_ARCHIVE" "$SHIPPED_ARCHIVE"

# Find the most recently modified plan file
if [[ ! -d "$CLAUDE_PLANS_DIR" ]]; then
    exit 0  # No plans directory, nothing to archive
fi

# macOS compatible: use ls -t to sort by modification time
LATEST_PLAN=$(ls -t "$CLAUDE_PLANS_DIR"/*.md 2>/dev/null | head -1)

if [[ -z "$LATEST_PLAN" || ! -f "$LATEST_PLAN" ]]; then
    exit 0  # No plan files found
fi

# Check if plan was modified in the last hour (likely from this session)
# macOS uses stat -f %m, Linux uses stat -c %Y
PLAN_MTIME=$(stat -f %m "$LATEST_PLAN" 2>/dev/null || stat -c %Y "$LATEST_PLAN" 2>/dev/null)
CURRENT_TIME=$(date +%s)
AGE=$((CURRENT_TIME - PLAN_MTIME))

if [[ $AGE -gt 3600 ]]; then
    exit 0  # Plan is older than 1 hour, probably not from this session
fi

# Extract title from first heading
TITLE=$(grep -m1 '^# ' "$LATEST_PLAN" | sed 's/^# //' | head -1)
if [[ -z "$TITLE" ]]; then
    TITLE="untitled-plan"
fi

# Create slug from title
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//' | cut -c1-50)

# Generate timestamp
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
ARCHIVE_FILENAME="${TIMESTAMP}-${SLUG}.md"

# Get git branch (if in a git repo)
BRANCH=$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# Get source filename
SOURCE_FILENAME=$(basename "$LATEST_PLAN")

# Create metadata header
METADATA="---
archived: $(date -Iseconds)
branch: $BRANCH
project: $(basename "$PROJECT_ROOT")
source: ~/.claude/plans/$SOURCE_FILENAME
title: $TITLE
---

"

# Archive to meta directory (local only, gitignored)
{
    echo "$METADATA"
    cat "$LATEST_PLAN"
} > "$META_ARCHIVE/$ARCHIVE_FILENAME"

# Archive to shipped directory (committed to repo)
{
    echo "$METADATA"
    cat "$LATEST_PLAN"
} > "$SHIPPED_ARCHIVE/$ARCHIVE_FILENAME"

# Log the archive action
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Archived plan: $ARCHIVE_FILENAME" >> "$PROJECT_ROOT/.claude/logs/plan-archive.log"

exit 0
