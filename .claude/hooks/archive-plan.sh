#!/bin/bash
# ABOUTME: Archives the current plan file when a Claude Code session ends.
# ABOUTME: Environment-aware: writes to .meta/plans/ (meta) or .claude/archive/plans/ (shipped).

set -euo pipefail

# Source shared meta-mode detection for consistent routing
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_meta-mode.sh"

# CLAUDE_PLANS_DIR (from _meta-mode.sh) = archive DESTINATION
# ACTIVE_PLANS_DIR = SOURCE where Claude Code stores active plans
ACTIVE_PLANS_DIR="$HOME/.claude/plans"
ARCHIVE_DIR="$CLAUDE_PLANS_DIR"
LOG_DIR="$CLAUDE_LOGS_DIR"

# Ensure archive directory exists
mkdir -p "$ARCHIVE_DIR"

# Find the most recently modified plan file
if [[ ! -d "$ACTIVE_PLANS_DIR" ]]; then
    exit 0  # No plans directory, nothing to archive
fi

# macOS compatible: use ls -t to sort by modification time
LATEST_PLAN=$(ls -t "$ACTIVE_PLANS_DIR"/*.md 2>/dev/null | head -1)

if [[ -z "$LATEST_PLAN" || ! -f "$LATEST_PLAN" ]]; then
    exit 0  # No plan files found
fi

# Check if plan was modified in the last 8 hours (likely from this session)
# Extended from 1 hour to accommodate longer development sessions.
# macOS uses stat -f %m, Linux uses stat -c %Y
PLAN_MTIME=$(stat -f %m "$LATEST_PLAN" 2>/dev/null || stat -c %Y "$LATEST_PLAN" 2>/dev/null)
CURRENT_TIME=$(date +%s)
AGE=$((CURRENT_TIME - PLAN_MTIME))

if [[ $AGE -gt 28800 ]]; then
    exit 0  # Plan is older than 8 hours, probably not from this session
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

# Archive to appropriate directory based on environment
{
    echo "$METADATA"
    cat "$LATEST_PLAN"
} > "$ARCHIVE_DIR/$ARCHIVE_FILENAME"

# Log the archive action
mkdir -p "$LOG_DIR"
MODE="meta"
if [[ "$CLAUDE_META_MODE" != "true" ]]; then
    MODE="shipped"
fi
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Archived plan: $ARCHIVE_FILENAME (mode: $MODE)" >> "$LOG_DIR/plan-archive.log"

exit 0
