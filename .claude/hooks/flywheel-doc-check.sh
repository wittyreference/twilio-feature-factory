#!/bin/bash
# ABOUTME: Documentation flywheel hook - suggests doc updates from multiple sources.
# ABOUTME: Environment-aware: writes to .meta/ (meta) or .claude/ (shipped).

# This hook combines THREE sources for doc suggestions:
# 1. Uncommitted files (git status) - catches pre-commit needs
# 2. Recent commits (since session start) - catches post-commit needs
# 3. Session-tracked files (from post-write hook) - catches everything touched

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source environment detection helper
source "$SCRIPT_DIR/_meta-mode.sh"

# Use environment-aware paths from _meta-mode.sh
PENDING_ACTIONS_FILE="$CLAUDE_PENDING_ACTIONS"
SESSION_FILE="$(dirname "$CLAUDE_PENDING_ACTIONS")/.session-files"
SESSION_START_FILE="$(dirname "$CLAUDE_PENDING_ACTIONS")/.session-start"
LAST_RUN_FILE="$(dirname "$CLAUDE_PENDING_ACTIONS")/.last-doc-check"

# Accept --force flag to skip debounce
FORCE=false
if [ "$1" = "--force" ]; then
    FORCE=true
fi

# Debounce: Only run if 2+ minutes have passed since last check
if [ "$FORCE" = false ] && [ -f "$LAST_RUN_FILE" ]; then
    LAST_RUN=$(cat "$LAST_RUN_FILE" 2>/dev/null | head -1)
    NOW=$(date +%s)
    DIFF=$((NOW - LAST_RUN))
    if [ "$DIFF" -lt 120 ]; then
        exit 0
    fi
fi

# Update last run timestamp
date +%s > "$LAST_RUN_FILE"

# Get timestamp for display
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')

# Check if we're in a git repo
cd "$PROJECT_ROOT" || exit 0
if [ ! -d ".git" ]; then
    exit 0
fi

# ============================================
# COLLECT FILES FROM ALL THREE SOURCES
# ============================================

ALL_FILES=""

# Source 1: Uncommitted files (staged, modified, untracked)
UNCOMMITTED=$(git status --porcelain 2>/dev/null | grep -E "^(M|A| M| A|\?\?)" | awk '{print $NF}')
if [ -n "$UNCOMMITTED" ]; then
    ALL_FILES="$ALL_FILES"$'\n'"$UNCOMMITTED"
fi

# Source 2: Files from recent commits (since session start)
if [ -f "$SESSION_START_FILE" ]; then
    SESSION_START=$(cat "$SESSION_START_FILE")
    # Get files changed in commits since session start
    COMMITTED_FILES=$(git log --since="@$SESSION_START" --name-only --pretty=format: 2>/dev/null | grep -v "^$" | sort -u)
    if [ -n "$COMMITTED_FILES" ]; then
        ALL_FILES="$ALL_FILES"$'\n'"$COMMITTED_FILES"
    fi
fi

# Source 3: Session-tracked files (from post-write hook)
if [ -f "$SESSION_FILE" ]; then
    # Extract just the file paths (format is timestamp|filepath)
    SESSION_TRACKED=$(cut -d'|' -f2 "$SESSION_FILE" 2>/dev/null)
    if [ -n "$SESSION_TRACKED" ]; then
        ALL_FILES="$ALL_FILES"$'\n'"$SESSION_TRACKED"
    fi
fi

# Deduplicate and clean up
ALL_FILES=$(echo "$ALL_FILES" | grep -v "^$" | sort -u)

if [ -z "$ALL_FILES" ]; then
    # No files to analyze
    exit 0
fi

# ============================================
# GENERATE DOC SUGGESTIONS BASED ON FILES
# ============================================

SUGGESTIONS=""

# Check for MCP server changes
if echo "$ALL_FILES" | grep -q "agents/mcp-servers"; then
    SUGGESTIONS="${SUGGESTIONS}• agents/mcp-servers/twilio/CLAUDE.md - if tools or validation changed\n"
    SUGGESTIONS="${SUGGESTIONS}• .claude/references/tool-boundaries.md - if MCP/CLI/Functions lines changed\n"
fi

# Check for function changes (with specific domain detection)
if echo "$ALL_FILES" | grep -q "functions/"; then
    FUNC_DIRS=$(echo "$ALL_FILES" | grep "functions/" | cut -d'/' -f2 | sort -u)
    for dir in $FUNC_DIRS; do
        if [ "$dir" != "helpers" ]; then
            SUGGESTIONS="${SUGGESTIONS}• functions/${dir}/CLAUDE.md - if patterns or APIs changed\n"
        fi
    done
fi

# Check for validation changes
if echo "$ALL_FILES" | grep -q "validation/"; then
    SUGGESTIONS="${SUGGESTIONS}• agents/mcp-servers/twilio/src/validation/CLAUDE.md - validation patterns\n"
fi

# Check for hook changes
if echo "$ALL_FILES" | grep -q ".claude/hooks"; then
    SUGGESTIONS="${SUGGESTIONS}• Root CLAUDE.md - hooks section if behavior changed\n"
fi

# Check for reference doc changes
if echo "$ALL_FILES" | grep -q ".claude/references"; then
    SUGGESTIONS="${SUGGESTIONS}• Verify doc-map.md points to updated references\n"
fi

# Check for script changes
if echo "$ALL_FILES" | grep -q "scripts/"; then
    SUGGESTIONS="${SUGGESTIONS}• scripts/CLAUDE.md - setup script documentation\n"
fi

# Check for Feature Factory changes
if echo "$ALL_FILES" | grep -q "agents/feature-factory"; then
    SUGGESTIONS="${SUGGESTIONS}• agents/feature-factory/CLAUDE.md - orchestrator, workflows, agents\n"
fi

# Check for Voice AI Builder changes
if echo "$ALL_FILES" | grep -q "agents/voice-ai-builder"; then
    SUGGESTIONS="${SUGGESTIONS}• agents/voice-ai-builder/CLAUDE.md - generators, templates, use cases\n"
fi

# Check for config/type changes
if echo "$ALL_FILES" | grep -qE "(types|config)\.(ts|js)$"; then
    SUGGESTIONS="${SUGGESTIONS}• Relevant CLAUDE.md - if interfaces or config options changed\n"
fi

# Check for test changes
if echo "$ALL_FILES" | grep -q "__tests__/"; then
    SUGGESTIONS="${SUGGESTIONS}• Root CLAUDE.md - if new test patterns established\n"
fi

# Check for CLI reference updates needed
if echo "$ALL_FILES" | grep -qE "(twilio|cli)" && ! echo "$ALL_FILES" | grep -q "twilio-cli.md"; then
    SUGGESTIONS="${SUGGESTIONS}• .claude/references/twilio-cli.md - if new CLI patterns discovered\n"
fi

# Check for env changes
if echo "$ALL_FILES" | grep -qE "\.env"; then
    SUGGESTIONS="${SUGGESTIONS}• .env.example - ensure new env vars are documented\n"
fi

# ============================================
# WRITE SUGGESTIONS TO PENDING-ACTIONS
# ============================================

if [ -n "$SUGGESTIONS" ]; then
    # Initialize pending-actions.md if it doesn't exist
    if [ ! -f "$PENDING_ACTIONS_FILE" ]; then
        cat > "$PENDING_ACTIONS_FILE" << 'EOF'
# Pending Documentation Actions

Actions detected by the documentation flywheel. Review before committing.

---

EOF
    fi

    # Count sources for context
    UNCOMMITTED_COUNT=$(echo "$UNCOMMITTED" | grep -c "." 2>/dev/null || echo "0")
    COMMITTED_COUNT=$(echo "$COMMITTED_FILES" | grep -c "." 2>/dev/null || echo "0")
    SESSION_COUNT=$(echo "$SESSION_TRACKED" | grep -c "." 2>/dev/null || echo "0")

    # Append new actions (avoid exact duplicates)
    echo -e "$SUGGESTIONS" | while IFS= read -r line; do
        if [ -n "$line" ]; then
            # Check if this exact suggestion (without timestamp) already exists
            SUGGESTION_TEXT=$(echo "$line" | sed 's/^• //')
            if ! grep -qF "$SUGGESTION_TEXT" "$PENDING_ACTIONS_FILE" 2>/dev/null; then
                echo "- [$TIMESTAMP] $line" >> "$PENDING_ACTIONS_FILE"
            fi
        fi
    done

    # Output summary to stderr (visible in hook output)
    TOTAL_FILES=$(echo "$ALL_FILES" | wc -l | tr -d ' ')
    echo "Doc flywheel: Analyzed $TOTAL_FILES files (uncommitted:$UNCOMMITTED_COUNT, committed:$COMMITTED_COUNT, session:$SESSION_COUNT)" >&2
fi

exit 0
