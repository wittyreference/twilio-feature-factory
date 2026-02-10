#!/bin/bash
# ABOUTME: Quality gate hook for TeammateIdle events in agent teams.
# ABOUTME: Verifies TDD, lint, and coverage before a teammate goes idle.

# TeammateIdle fires when a teammate is about to stop working.
# Exit code 2 = send feedback message to teammate and keep it working.
# Exit code 0 = allow teammate to go idle normally.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Source meta-mode detection for environment-aware paths
if [ -f "$SCRIPT_DIR/_meta-mode.sh" ]; then
    source "$SCRIPT_DIR/_meta-mode.sh"
fi

# Read task metadata from environment (provided by Claude Code)
TASK_SUBJECT="${CLAUDE_TASK_SUBJECT:-}"
TASK_DESCRIPTION="${CLAUDE_TASK_DESCRIPTION:-}"
TEAMMATE_NAME="${CLAUDE_TEAMMATE_NAME:-}"

# Determine task type from subject/description keywords
detect_task_type() {
    local text="$TASK_SUBJECT $TASK_DESCRIPTION"
    text=$(echo "$text" | tr '[:upper:]' '[:lower:]')

    if echo "$text" | grep -qE "(test-gen|write.*test|failing.*test|red phase|tdd red)"; then
        echo "test-gen"
    elif echo "$text" | grep -qE "(implement|dev|green phase|tdd green|make.*pass)"; then
        echo "dev"
    elif echo "$text" | grep -qE "(qa|quality|coverage|test.*suite)"; then
        echo "qa"
    elif echo "$text" | grep -qE "(review|security|audit)"; then
        echo "review"
    elif echo "$text" | grep -qE "(doc|documentation|readme|claude\.md)"; then
        echo "docs"
    else
        echo "unknown"
    fi
}

TASK_TYPE=$(detect_task_type)

# ============================================
# TASK-TYPE-SPECIFIC QUALITY GATES
# ============================================

case "$TASK_TYPE" in
    test-gen)
        # TDD Red Phase: tests must exist AND fail
        TEST_OUTPUT=$(cd "$PROJECT_ROOT" && npm test 2>&1) || true
        TEST_EXIT=$?

        # Check if any test files were created/modified recently
        RECENT_TESTS=$(find "$PROJECT_ROOT/__tests__" -name "*.test.js" -newer "$PROJECT_ROOT/package.json" 2>/dev/null | head -5)

        if [ -z "$RECENT_TESTS" ]; then
            echo "QUALITY GATE: No test files found." >&2
            echo "" >&2
            echo "test-gen tasks must create test files in __tests__/." >&2
            echo "Create at least one failing test before completing." >&2
            exit 2
        fi

        # Tests should be FAILING (red phase)
        if [ "$TEST_EXIT" -eq 0 ]; then
            echo "QUALITY GATE: Tests are passing but should be FAILING." >&2
            echo "" >&2
            echo "TDD Red Phase requires tests that define expected behavior" >&2
            echo "but are not yet implemented. Tests should fail at this stage." >&2
            exit 2
        fi
        ;;

    dev)
        # TDD Green Phase: tests must PASS and lint must be clean
        TEST_OUTPUT=$(cd "$PROJECT_ROOT" && npm test 2>&1)
        TEST_EXIT=$?

        if [ "$TEST_EXIT" -ne 0 ]; then
            echo "QUALITY GATE: Tests are failing." >&2
            echo "" >&2
            echo "TDD Green Phase requires all tests to pass." >&2
            echo "Fix failing tests before completing." >&2
            echo "" >&2
            echo "Test output (last 20 lines):" >&2
            echo "$TEST_OUTPUT" | tail -20 >&2
            exit 2
        fi

        # Check lint
        LINT_OUTPUT=$(cd "$PROJECT_ROOT" && npm run lint 2>&1)
        LINT_EXIT=$?

        if [ "$LINT_EXIT" -ne 0 ]; then
            echo "QUALITY GATE: Linting errors detected." >&2
            echo "" >&2
            echo "Fix linting issues before completing:" >&2
            echo "$LINT_OUTPUT" | tail -10 >&2
            exit 2
        fi
        ;;

    qa)
        # QA: coverage must be >= 80%
        COVERAGE_OUTPUT=$(cd "$PROJECT_ROOT" && npm run test:coverage 2>&1)
        COVERAGE_EXIT=$?

        if [ "$COVERAGE_EXIT" -ne 0 ]; then
            echo "QUALITY GATE: Tests failing during coverage run." >&2
            echo "" >&2
            echo "$COVERAGE_OUTPUT" | tail -20 >&2
            exit 2
        fi

        # Extract coverage percentage from Jest output
        STMT_COVERAGE=$(echo "$COVERAGE_OUTPUT" | grep -E "^All files" | awk '{print $4}' | sed 's/%//')
        BRANCH_COVERAGE=$(echo "$COVERAGE_OUTPUT" | grep -E "^All files" | awk '{print $6}' | sed 's/%//')

        if [ -n "$STMT_COVERAGE" ]; then
            STMT_INT=${STMT_COVERAGE%.*}
            if [ "$STMT_INT" -lt 80 ]; then
                echo "QUALITY GATE: Statement coverage ${STMT_COVERAGE}% is below 80% threshold." >&2
                echo "" >&2
                echo "Add tests to improve coverage before completing." >&2
                exit 2
            fi
        fi

        if [ -n "$BRANCH_COVERAGE" ]; then
            BRANCH_INT=${BRANCH_COVERAGE%.*}
            if [ "$BRANCH_INT" -lt 80 ]; then
                echo "QUALITY GATE: Branch coverage ${BRANCH_COVERAGE}% is below 80% threshold." >&2
                echo "" >&2
                echo "Add tests to improve branch coverage before completing." >&2
                exit 2
            fi
        fi
        ;;

    review|docs|unknown)
        # No automated gate for review, docs, or unknown task types
        ;;
esac

# ============================================
# TRIGGER FLYWHEEL DOC CHECK
# ============================================

# Teammate completion is a good checkpoint for doc suggestions
FLYWHEEL_HOOK="$SCRIPT_DIR/flywheel-doc-check.sh"
if [ -x "$FLYWHEEL_HOOK" ]; then
    "$FLYWHEEL_HOOK" 2>/dev/null || true
fi

exit 0
