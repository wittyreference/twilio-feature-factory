#!/bin/bash
# ABOUTME: Integration tests for the flywheel auto-clear logic in pre-bash-validate.sh.
# ABOUTME: Creates temp git repos with staged files and verifies pending-actions entries are correctly cleared.

set -euo pipefail

PASS_COUNT=0
FAIL_COUNT=0
TEST_DIR=""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

cleanup() {
    if [ -n "$TEST_DIR" ] && [ -d "$TEST_DIR" ]; then
        rm -rf "$TEST_DIR"
    fi
}
trap cleanup EXIT

setup_repo() {
    TEST_DIR=$(mktemp -d)
    cd "$TEST_DIR"
    git init --quiet
    git config user.email "test@test.com"
    git config user.name "Test"
    # Initial commit so we can stage files
    echo "init" > init.txt
    git add init.txt
    git commit -m "init" --quiet
}

# Simulates the auto-clear logic from pre-bash-validate.sh
# Takes: PENDING_ACTIONS file path, uses git staged files from cwd
run_auto_clear() {
    local PENDING_ACTIONS="$1"

    if [ -f "$PENDING_ACTIONS" ]; then
        STAGED_FILES=$(git diff --staged --name-only 2>/dev/null)
        if [ -n "$STAGED_FILES" ]; then
            CLEARED_COUNT=0
            TEMP_FILE=$(mktemp)
            while IFS= read -r line; do
                if echo "$line" | grep -q "^\- \["; then
                    DOC_PATH=$(echo "$line" | sed -n 's/.*• \(.*\) - .*/\1/p')
                    case "$DOC_PATH" in
                        "Root CLAUDE.md") RESOLVED="CLAUDE.md" ;;
                        ".meta/design-decisions.md") RESOLVED="DESIGN_DECISIONS.md" ;;
                        "Verify doc-map.md"*) RESOLVED=".claude/references/doc-map.md" ;;
                        ".meta/"*) RESOLVED="" ;;
                        "Relevant "*) RESOLVED="" ;;
                        *) RESOLVED="$DOC_PATH" ;;
                    esac
                    if [ -n "$RESOLVED" ] && echo "$STAGED_FILES" | grep -qF "$RESOLVED"; then
                        TIMESTAMP=$(echo "$line" | sed -n 's/.*\[\(.*\)\].*/\1/p')
                        echo "*Auto-cleared [$TIMESTAMP]: $DOC_PATH - staged in this commit*" >> "$TEMP_FILE"
                        CLEARED_COUNT=$((CLEARED_COUNT + 1))
                    else
                        echo "$line" >> "$TEMP_FILE"
                    fi
                else
                    echo "$line" >> "$TEMP_FILE"
                fi
            done < "$PENDING_ACTIONS"
            mv "$TEMP_FILE" "$PENDING_ACTIONS"
            echo "$CLEARED_COUNT"
            return
        fi
    fi
    echo "0"
}

assert_equals() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"

    if [ "$expected" = "$actual" ]; then
        echo -e "${GREEN}PASS${NC}: $test_name"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${RED}FAIL${NC}: $test_name"
        echo "  Expected: $expected"
        echo "  Actual:   $actual"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

assert_contains() {
    local test_name="$1"
    local expected_substring="$2"
    local actual="$3"

    if echo "$actual" | grep -qF -- "$expected_substring"; then
        echo -e "${GREEN}PASS${NC}: $test_name"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${RED}FAIL${NC}: $test_name"
        echo "  Expected to contain: $expected_substring"
        echo "  Actual: $actual"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

assert_not_contains() {
    local test_name="$1"
    local unexpected_substring="$2"
    local actual="$3"

    if ! echo "$actual" | grep -qF -- "$unexpected_substring"; then
        echo -e "${GREEN}PASS${NC}: $test_name"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${RED}FAIL${NC}: $test_name"
        echo "  Expected NOT to contain: $unexpected_substring"
        echo "  Actual: $actual"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

# ============================================
# TEST 1: Exact path match clears entry
# ============================================
echo ""
echo "Test 1: Exact path match clears entry"
setup_repo
PENDING="$TEST_DIR/pending-actions.md"
cat > "$PENDING" <<'EOF'
# Pending Documentation Actions

- [2026-02-11 23:35] • agents/feature-factory/CLAUDE.md - orchestrator, workflows, agents
EOF
mkdir -p agents/feature-factory
echo "update" > agents/feature-factory/CLAUDE.md
git add agents/feature-factory/CLAUDE.md

CLEARED=$(run_auto_clear "$PENDING")
CONTENT=$(cat "$PENDING")

assert_equals "Cleared count is 1" "1" "$CLEARED"
assert_contains "Contains auto-cleared note" "*Auto-cleared [2026-02-11 23:35]: agents/feature-factory/CLAUDE.md - staged in this commit*" "$CONTENT"
assert_not_contains "No longer has active entry" "- [2026-02-11 23:35] • agents/feature-factory/CLAUDE.md" "$CONTENT"

# ============================================
# TEST 2: Root CLAUDE.md alias resolves
# ============================================
echo ""
echo "Test 2: Root CLAUDE.md alias resolves"
setup_repo
PENDING="$TEST_DIR/pending-actions.md"
cat > "$PENDING" <<'EOF'
- [2026-02-11 23:35] • Root CLAUDE.md - if new test patterns established
EOF
echo "update" > CLAUDE.md
git add CLAUDE.md

CLEARED=$(run_auto_clear "$PENDING")
CONTENT=$(cat "$PENDING")

assert_equals "Cleared count is 1" "1" "$CLEARED"
assert_contains "Contains auto-cleared note" "*Auto-cleared [2026-02-11 23:35]: Root CLAUDE.md - staged in this commit*" "$CONTENT"

# ============================================
# TEST 3: .meta/ path is NOT cleared
# ============================================
echo ""
echo "Test 3: .meta/ path is NOT cleared (gitignored)"
setup_repo
PENDING="$TEST_DIR/pending-actions.md"
cat > "$PENDING" <<'EOF'
- [2026-02-11 23:35] • .meta/todo.md - update task tracking (changed: agents)
EOF
# Stage something unrelated
echo "x" > somefile.txt
git add somefile.txt

CLEARED=$(run_auto_clear "$PENDING")
CONTENT=$(cat "$PENDING")

assert_equals "Cleared count is 0" "0" "$CLEARED"
assert_contains "Entry preserved" "- [2026-02-11 23:35] • .meta/todo.md" "$CONTENT"

# ============================================
# TEST 4: "Relevant CLAUDE.md" is NOT cleared
# ============================================
echo ""
echo "Test 4: Vague 'Relevant' entry is NOT cleared"
setup_repo
PENDING="$TEST_DIR/pending-actions.md"
cat > "$PENDING" <<'EOF'
- [2026-02-11 23:35] • Relevant CLAUDE.md - update patterns
EOF
echo "update" > CLAUDE.md
git add CLAUDE.md

CLEARED=$(run_auto_clear "$PENDING")
CONTENT=$(cat "$PENDING")

assert_equals "Cleared count is 0" "0" "$CLEARED"
assert_contains "Entry preserved" "- [2026-02-11 23:35] • Relevant CLAUDE.md" "$CONTENT"

# ============================================
# TEST 5: Non-entry lines are preserved
# ============================================
echo ""
echo "Test 5: Non-entry lines (headers, cleared notes) are preserved"
setup_repo
PENDING="$TEST_DIR/pending-actions.md"
cat > "$PENDING" <<'EOF'
# Pending Documentation Actions

*Cleared 2026-02-10: some old entry*

- [2026-02-11 23:35] • CLAUDE.md - test entry
EOF
echo "update" > CLAUDE.md
git add CLAUDE.md

CLEARED=$(run_auto_clear "$PENDING")
CONTENT=$(cat "$PENDING")

assert_equals "Cleared count is 1" "1" "$CLEARED"
assert_contains "Header preserved" "# Pending Documentation Actions" "$CONTENT"
assert_contains "Old cleared note preserved" "*Cleared 2026-02-10: some old entry*" "$CONTENT"

# ============================================
# TEST 6: No staged files → nothing cleared
# ============================================
echo ""
echo "Test 6: No staged files means nothing cleared"
setup_repo
PENDING="$TEST_DIR/pending-actions.md"
cat > "$PENDING" <<'EOF'
- [2026-02-11 23:35] • CLAUDE.md - test entry
EOF
# Don't stage anything

CLEARED=$(run_auto_clear "$PENDING")
CONTENT=$(cat "$PENDING")

assert_equals "Cleared count is 0" "0" "$CLEARED"
assert_contains "Entry preserved" "- [2026-02-11 23:35] • CLAUDE.md" "$CONTENT"

# ============================================
# TEST 7: Selective clearing (some match, some don't)
# ============================================
echo ""
echo "Test 7: Selective clearing - some match, some don't"
setup_repo
PENDING="$TEST_DIR/pending-actions.md"
cat > "$PENDING" <<'EOF'
- [2026-02-11 23:35] • CLAUDE.md - test entry
- [2026-02-11 23:35] • functions/voice/CLAUDE.md - voice patterns
- [2026-02-11 23:35] • .meta/todo.md - update tracking
EOF
echo "update" > CLAUDE.md
git add CLAUDE.md
# Don't stage functions/voice/CLAUDE.md or .meta/todo.md

CLEARED=$(run_auto_clear "$PENDING")
CONTENT=$(cat "$PENDING")

assert_equals "Cleared count is 1" "1" "$CLEARED"
assert_contains "Auto-cleared CLAUDE.md" "*Auto-cleared [2026-02-11 23:35]: CLAUDE.md - staged in this commit*" "$CONTENT"
assert_contains "Voice entry preserved" "- [2026-02-11 23:35] • functions/voice/CLAUDE.md" "$CONTENT"
assert_contains "Meta entry preserved" "- [2026-02-11 23:35] • .meta/todo.md" "$CONTENT"

# ============================================
# TEST 8: Cleared entry format is correct
# ============================================
echo ""
echo "Test 8: Cleared entry format matches expected pattern"
setup_repo
PENDING="$TEST_DIR/pending-actions.md"
cat > "$PENDING" <<'EOF'
- [2026-02-11 14:30] • scripts/CLAUDE.md - new script patterns
EOF
mkdir -p scripts
echo "update" > scripts/CLAUDE.md
git add scripts/CLAUDE.md

CLEARED=$(run_auto_clear "$PENDING")
CONTENT=$(cat "$PENDING")

assert_equals "Cleared count is 1" "1" "$CLEARED"
# Verify the exact format: *Auto-cleared [TIMESTAMP]: DOC_PATH - staged in this commit*
assert_contains "Correct format" "*Auto-cleared [2026-02-11 14:30]: scripts/CLAUDE.md - staged in this commit*" "$CONTENT"
# Verify it does NOT match the blocker regex (^\- \[)
BLOCKER_COUNT=$(grep -c "^\- \[" "$PENDING" 2>/dev/null) || true
assert_equals "Blocker regex no longer matches" "0" "$BLOCKER_COUNT"

# ============================================
# TEST 9: .meta/design-decisions.md alias resolves to DESIGN_DECISIONS.md
# ============================================
echo ""
echo "Test 9: .meta/design-decisions.md alias resolves"
setup_repo
PENDING="$TEST_DIR/pending-actions.md"
cat > "$PENDING" <<'EOF'
- [2026-02-11 23:35] • .meta/design-decisions.md - new architectural decision
EOF
echo "update" > DESIGN_DECISIONS.md
git add DESIGN_DECISIONS.md

CLEARED=$(run_auto_clear "$PENDING")
CONTENT=$(cat "$PENDING")

assert_equals "Cleared count is 1" "1" "$CLEARED"
assert_contains "Auto-cleared with alias" "*Auto-cleared [2026-02-11 23:35]: .meta/design-decisions.md - staged in this commit*" "$CONTENT"

# ============================================
# TEST 10: "Verify doc-map.md" alias resolves
# ============================================
echo ""
echo "Test 10: 'Verify doc-map.md' alias resolves"
setup_repo
PENDING="$TEST_DIR/pending-actions.md"
cat > "$PENDING" <<'EOF'
- [2026-02-11 23:35] • Verify doc-map.md coverage - check references
EOF
mkdir -p .claude/references
echo "update" > .claude/references/doc-map.md
git add .claude/references/doc-map.md

CLEARED=$(run_auto_clear "$PENDING")
CONTENT=$(cat "$PENDING")

assert_equals "Cleared count is 1" "1" "$CLEARED"
assert_contains "Auto-cleared with alias" "Auto-cleared" "$CONTENT"

# ============================================
# SUMMARY
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo "Results: $PASS_COUNT/$TOTAL passed"
if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "${RED}$FAIL_COUNT test(s) failed${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 1
else
    echo -e "${GREEN}All tests passed${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
fi
