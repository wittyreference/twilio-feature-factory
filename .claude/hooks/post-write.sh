#!/bin/bash
# ABOUTME: Post-write hook for auto-linting and session file tracking.
# ABOUTME: Environment-aware: tracks files to .meta/ (meta) or .claude/ (shipped).

# ============================================
# COMPACT-PENDING MARKER CHECK
# ============================================
# After auto-compaction, PreCompact leaves a marker file. Pick it up here
# to run the compaction summary extraction (since SessionStart only fires
# for manual /compact, not auto-compaction).
_check_compact_pending() {
    local HOOK_DIR="$(dirname "${BASH_SOURCE[0]}")"
    source "$HOOK_DIR/_meta-mode.sh"
    local MARKER
    if [ "$CLAUDE_META_MODE" = "true" ]; then
        MARKER="$PROJECT_ROOT/.meta/.compact-pending"
    else
        MARKER="$PROJECT_ROOT/.claude/.compact-pending"
    fi
    if [ -f "$MARKER" ]; then
        "$HOOK_DIR/post-compact-summary.sh" < "$MARKER"
        rm -f "$MARKER"
    fi
}
_check_compact_pending

FILE_PATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-}"

# Exit early if no file path
if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# ============================================
# SESSION FILE TRACKING (for doc flywheel)
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source environment detection for meta-aware paths
source "$SCRIPT_DIR/_meta-mode.sh"

# Use environment-aware paths (routes to .meta/ or .claude/ based on context)
SESSION_DIR="$(dirname "$CLAUDE_PENDING_ACTIONS")"
SESSION_FILE="$SESSION_DIR/.session-files"
SESSION_START="$SESSION_DIR/.session-start"

# Initialize session start time if not set
if [ ! -f "$SESSION_START" ]; then
    date +%s > "$SESSION_START"
fi

# Track this file (append if not already present)
# Make path relative to project root for consistency
REL_PATH="${FILE_PATH#$PROJECT_ROOT/}"
if [ -n "$REL_PATH" ]; then
    # Create session file if it doesn't exist
    touch "$SESSION_FILE" 2>/dev/null
    # Add file if not already tracked (with timestamp)
    if ! grep -qF "$REL_PATH" "$SESSION_FILE" 2>/dev/null; then
        echo "$(date +%s)|$REL_PATH" >> "$SESSION_FILE"
    fi
fi

# Only process JavaScript files
if [[ ! "$FILE_PATH" =~ \.(js|mjs|cjs)$ ]]; then
    exit 0
fi

# Skip node_modules and other excluded paths
if [[ "$FILE_PATH" =~ node_modules|\.min\.js|dist/|build/ ]]; then
    exit 0
fi

# Run ESLint with auto-fix if file exists
if [ -f "$FILE_PATH" ]; then
    # Check if npx is available
    if command -v npx &> /dev/null; then
        # Run ESLint quietly, only show if there are unfixable issues
        LINT_OUTPUT=$(npx eslint "$FILE_PATH" --fix 2>&1)
        LINT_EXIT=$?

        if [ $LINT_EXIT -ne 0 ] && [ -n "$LINT_OUTPUT" ]; then
            echo "ESLint found issues in $(basename "$FILE_PATH"):"
            echo "$LINT_OUTPUT" | head -20
        fi
    fi

    # Warn if ABOUTME is missing in function files (non-blocking)
    if [[ "$FILE_PATH" =~ functions/ ]] && [[ ! "$FILE_PATH" =~ \.test\.js$ ]]; then
        ABOUTME_COUNT=$(head -5 "$FILE_PATH" | grep -c "// ABOUTME:" || true)
        if [ "$ABOUTME_COUNT" -eq 0 ]; then
            echo ""
            echo "Note: $(basename "$FILE_PATH") is missing ABOUTME comment."
            echo "Consider adding at the top of the file:"
            echo "  // ABOUTME: [What this file does]"
            echo "  // ABOUTME: [Additional context]"
        elif [ "$ABOUTME_COUNT" -eq 1 ]; then
            echo ""
            echo "Note: $(basename "$FILE_PATH") has only 1 ABOUTME line (2 recommended)."
        fi
    fi
fi

exit 0
