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
    ITEMS+=("[MANUAL] UNCOMMITTED: $UNCOMMITTED file(s) with uncommitted changes")
fi

# --- 2. Unpushed commits ---
UNPUSHED=$(git -C "$PROJECT_ROOT" log --oneline '@{upstream}..HEAD' 2>/dev/null | wc -l | tr -d ' ')
if [[ "$UNPUSHED" -gt 0 ]]; then
    ITEMS+=("[MANUAL] UNPUSHED: $UNPUSHED commit(s) not pushed to remote")
fi

# --- 3. Learnings freshness ---
# Check if the learnings file was modified during this session (within last 4 hours)
if [[ -f "$CLAUDE_LEARNINGS" ]]; then
    LEARN_MTIME=$(stat -f %m "$CLAUDE_LEARNINGS" 2>/dev/null || stat -c %Y "$CLAUDE_LEARNINGS" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    LEARN_AGE=$(( NOW - LEARN_MTIME ))
    if [[ $LEARN_AGE -gt 14400 ]]; then
        ITEMS+=("[MANUAL] LEARNINGS: Learnings file not updated this session — capture any discoveries to $CLAUDE_LEARNINGS")
    fi
else
    ITEMS+=("[MANUAL] LEARNINGS: No learnings file found — consider creating $CLAUDE_LEARNINGS")
fi

# --- 4. Pending doc actions ---
if [[ -f "$CLAUDE_PENDING_ACTIONS" ]]; then
    # Count unchecked items (lines starting with "- [ ]")
    UNCHECKED=$(grep -c '^\- \[ \]' "$CLAUDE_PENDING_ACTIONS" 2>/dev/null) || UNCHECKED=0
    if [[ "$UNCHECKED" -gt 0 ]]; then
        ITEMS+=("[AUTO] DOCS: $UNCHECKED unchecked pending doc action(s) — auto-cleared when matching files are committed")
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
        ITEMS+=("[MANUAL] TESTS: $CHANGED_SINCE_TEST source files changed since last test commit — consider running npm test")
    fi
fi

# --- 6. E2E test reminder (if functional code was modified) ---
FUNCTIONS_CHANGED=$(git -C "$PROJECT_ROOT" diff --name-only HEAD 2>/dev/null | grep -c '^functions/') || FUNCTIONS_CHANGED=0
if [[ "$FUNCTIONS_CHANGED" -gt 0 ]]; then
    ITEMS+=("[MANUAL] E2E: $FUNCTIONS_CHANGED function file(s) modified — consider running npm run test:e2e")
fi

# --- 7. Plugin drift check (if syncable files were touched) ---
DRIFT_SCRIPT="$PROJECT_ROOT/.meta/scripts/plugin-drift-check.sh"
if [[ -x "$DRIFT_SCRIPT" ]] && command -v jq &>/dev/null; then
    DRIFT_COUNT=$("$DRIFT_SCRIPT" --count 2>/dev/null) || DRIFT_COUNT=0
    if [[ "$DRIFT_COUNT" -gt 0 ]]; then
        ITEMS+=("[MANUAL] PLUGIN: $DRIFT_COUNT factory file(s) drifted from plugin — run /plugin-sync to review")
    fi
fi

# --- 8. Pending learning exercises ---
if [ "$CLAUDE_META_MODE" = "true" ] && [ -n "${CLAUDE_LEARNING_DIR:-}" ] && [ -d "${CLAUDE_LEARNING_DIR:-}" ]; then
    EXERCISE_FILE="$CLAUDE_LEARNING_DIR/exercises.md"
    if [ -f "$EXERCISE_FILE" ]; then
        EXERCISE_COUNT=$(grep -c '^## ' "$EXERCISE_FILE" 2>/dev/null) || EXERCISE_COUNT=0
        if [[ "$EXERCISE_COUNT" -gt 0 ]]; then
            ITEMS+=("[MANUAL] LEARNING: $EXERCISE_COUNT exercise(s) pending — use /learn to build comprehension of autonomous work")
        fi
    fi
fi

# --- 9. MEMORY.md size check ---
MEMORY_FILE="$HOME/.claude/projects/$(echo "$PROJECT_ROOT" | sed 's|/|-|g')/memory/MEMORY.md"
if [[ -f "$MEMORY_FILE" ]]; then
    MEMORY_LINES=$(wc -l < "$MEMORY_FILE" | tr -d ' ')
    if [[ "$MEMORY_LINES" -gt 100 ]]; then
        ITEMS+=("[AUTO] MEMORY: ${MEMORY_LINES}/200 lines — stale entries auto-pruned at next session start after /wrap-up tags them")
    fi
fi

# --- 10. Architect summary drift check (meta mode only) ---
ARCHITECT_METRICS="$PROJECT_ROOT/scripts/architect-metrics.sh"
if [[ "$CLAUDE_META_MODE" == "true" ]] && [[ -x "$ARCHITECT_METRICS" ]]; then
    ARCHITECT_SNAPSHOT="$CLAUDE_META_DIR/architect-metrics.json"
    if [[ -f "$ARCHITECT_SNAPSHOT" ]]; then
        DRIFT_OUTPUT=$("$ARCHITECT_METRICS" --diff "$ARCHITECT_SNAPSHOT" 2>/dev/null) && DRIFT_RC=0 || DRIFT_RC=$?
        if [[ $DRIFT_RC -ne 0 ]]; then
            DRIFT_ITEMS=$(echo "$DRIFT_OUTPUT" | grep '^ *-' | sed 's/^ *- //' | paste -sd', ' -)
            if [[ -n "$DRIFT_ITEMS" ]]; then
                ITEMS+=("[AUTO] ARCHITECT: Summary drift ($DRIFT_ITEMS) — /wrap-up step 7b handles this")
            fi
        fi
    fi
fi

# --- 11. README drift check ---
README_DRIFT_SCRIPT="$PROJECT_ROOT/scripts/check-readme-drift.sh"
if [[ -x "$README_DRIFT_SCRIPT" ]]; then
    DRIFT_OUTPUT=$("$README_DRIFT_SCRIPT" --quiet 2>/dev/null) || true
    if [[ -n "$DRIFT_OUTPUT" ]]; then
        ITEMS+=("[AUTO] README: $DRIFT_OUTPUT — run check-readme-drift.sh --fix")
    fi
fi

# --- 13. Value leakage candidates (meta mode only) ---
if [ "$CLAUDE_META_MODE" = "true" ]; then
    PENDING_FILE="$PROJECT_ROOT/.meta/value-assessments/pending.jsonl"
    if [ -f "$PENDING_FILE" ]; then
        VALUE_COUNT=$(grep -c '"reviewed":false' "$PENDING_FILE" 2>/dev/null) || VALUE_COUNT=0
        if [[ "$VALUE_COUNT" -gt 0 ]]; then
            ITEMS+=("[MANUAL] VALUE: $VALUE_COUNT file(s) not in any sync map — /wrap-up will review (or run /value-audit)")
        fi
    fi
fi

# --- 12. Wiki drift check ---
WIKI_DRIFT_SCRIPT="$PROJECT_ROOT/scripts/check-wiki-drift.sh"
if [[ -x "$WIKI_DRIFT_SCRIPT" ]]; then
    WIKI_DRIFT_OUTPUT=$("$WIKI_DRIFT_SCRIPT" --quiet 2>/dev/null) || true
    if [[ -n "$WIKI_DRIFT_OUTPUT" ]]; then
        ITEMS+=("[AUTO] Wiki: $WIKI_DRIFT_OUTPUT — run sync-wiki.sh --fix")
    fi
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
