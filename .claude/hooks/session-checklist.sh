#!/bin/bash
# ABOUTME: Stop hook that checks for open session hygiene items.
# ABOUTME: Reminds about learnings, docs, uncommitted work, unpushed commits, and test runs.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_meta-mode.sh"

# ============================================
# Collect checklist items
# ============================================
ITEMS=()

# --- 1. Uncommitted changes ---
UNCOMMITTED=$(git -C "$PROJECT_ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
if [[ "$UNCOMMITTED" -gt 0 ]]; then
    ITEMS+=("UNCOMMITTED: $UNCOMMITTED file(s) with uncommitted changes")
fi

# --- 2. Unpushed commits ---
UNPUSHED=$(git -C "$PROJECT_ROOT" log --oneline '@{upstream}..HEAD' 2>/dev/null | wc -l | tr -d ' ')
if [[ "$UNPUSHED" -gt 0 ]]; then
    ITEMS+=("UNPUSHED: $UNPUSHED commit(s) not pushed to remote")
fi

# --- 3. Learnings freshness ---
# Check if the learnings file was modified during this session (within last 4 hours)
if [[ -f "$CLAUDE_LEARNINGS" ]]; then
    LEARN_MTIME=$(stat -f %m "$CLAUDE_LEARNINGS" 2>/dev/null || stat -c %Y "$CLAUDE_LEARNINGS" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    LEARN_AGE=$(( NOW - LEARN_MTIME ))
    if [[ $LEARN_AGE -gt 14400 ]]; then
        ITEMS+=("LEARNINGS: Learnings file not updated this session — capture any discoveries to $CLAUDE_LEARNINGS")
    fi
else
    ITEMS+=("LEARNINGS: No learnings file found — consider creating $CLAUDE_LEARNINGS")
fi

# --- 4. Pending doc actions ---
if [[ -f "$CLAUDE_PENDING_ACTIONS" ]]; then
    # Count unchecked items (lines starting with "- [ ]")
    UNCHECKED=$(grep -c '^\- \[ \]' "$CLAUDE_PENDING_ACTIONS" 2>/dev/null) || UNCHECKED=0
    if [[ "$UNCHECKED" -gt 0 ]]; then
        ITEMS+=("DOCS: $UNCHECKED unchecked pending doc action(s) in $(basename "$CLAUDE_PENDING_ACTIONS")")
    fi
fi

# --- 5. Test recency ---
# Check if tests were run in this session by looking for recent jest cache or test output
# Use git log to see if any code changed since last test-related commit
LAST_TEST_COMMIT=$(git -C "$PROJECT_ROOT" log --oneline --all --grep="test" -1 --format="%H" 2>/dev/null || echo "")
if [[ -n "$LAST_TEST_COMMIT" ]]; then
    # Check if source files changed since that commit
    CHANGED_SINCE_TEST=$(git -C "$PROJECT_ROOT" diff --name-only "$LAST_TEST_COMMIT" -- '*.ts' '*.js' '*.json' 2>/dev/null | grep -v node_modules | grep -v dist | wc -l | tr -d ' ')
    if [[ "$CHANGED_SINCE_TEST" -gt 5 ]]; then
        ITEMS+=("TESTS: $CHANGED_SINCE_TEST source files changed since last test commit — consider running npm test")
    fi
fi

# --- 6. E2E test reminder (if functional code was modified) ---
FUNCTIONS_CHANGED=$(git -C "$PROJECT_ROOT" diff --name-only HEAD 2>/dev/null | grep -c '^functions/') || FUNCTIONS_CHANGED=0
if [[ "$FUNCTIONS_CHANGED" -gt 0 ]]; then
    ITEMS+=("E2E: $FUNCTIONS_CHANGED function file(s) modified — consider running npm run test:e2e")
fi

# ============================================
# Output checklist (only if there are items)
# ============================================
if [[ ${#ITEMS[@]} -gt 0 ]]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "SESSION CHECKLIST"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    for item in "${ITEMS[@]}"; do
        echo "  - $item"
    done
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
fi

exit 0
