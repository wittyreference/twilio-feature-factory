#!/bin/bash
# ABOUTME: Quality gate hook for TaskCompleted events in agent teams.
# ABOUTME: Verifies TDD compliance, coverage, and credential safety on task completion.

# TaskCompleted fires when a task in the shared task list is marked complete.
# Exit code 2 = block completion with feedback message.
# Exit code 0 = allow task completion.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Source meta-mode detection
if [ -f "$SCRIPT_DIR/_meta-mode.sh" ]; then
    source "$SCRIPT_DIR/_meta-mode.sh"
fi

# Read task metadata from environment
TASK_SUBJECT="${CLAUDE_TASK_SUBJECT:-}"
TASK_DESCRIPTION="${CLAUDE_TASK_DESCRIPTION:-}"

# ============================================
# TDD VERIFICATION
# ============================================

# Check if this task involves code implementation
IS_CODE_TASK=false
TASK_TEXT=$(echo "$TASK_SUBJECT $TASK_DESCRIPTION" | tr '[:upper:]' '[:lower:]')

if echo "$TASK_TEXT" | grep -qE "(implement|dev|code|function|handler|feature|fix|bug)"; then
    IS_CODE_TASK=true
fi

if [ "$IS_CODE_TASK" = true ]; then
    # Verify tests exist
    STAGED_FILES=$(cd "$PROJECT_ROOT" && git diff --cached --name-only 2>/dev/null || true)
    UNSTAGED_FILES=$(cd "$PROJECT_ROOT" && git diff --name-only 2>/dev/null || true)
    ALL_CHANGED="$STAGED_FILES $UNSTAGED_FILES"

    # Check if any implementation files changed without corresponding tests
    HAS_IMPL=false
    HAS_TESTS=false

    for f in $ALL_CHANGED; do
        if echo "$f" | grep -qE "^functions/.*\.js$"; then
            HAS_IMPL=true
        fi
        if echo "$f" | grep -qE "(\.test\.|\.spec\.|__tests__)"; then
            HAS_TESTS=true
        fi
    done

    if [ "$HAS_IMPL" = true ] && [ "$HAS_TESTS" = false ]; then
        echo "QUALITY GATE: Implementation changes detected without test changes." >&2
        echo "" >&2
        echo "TDD requires tests to accompany implementation changes." >&2
        echo "Add or update tests for the modified files." >&2
        exit 2
    fi

    # Verify tests pass
    TEST_OUTPUT=$(cd "$PROJECT_ROOT" && npm test 2>&1)
    TEST_EXIT=$?

    if [ "$TEST_EXIT" -ne 0 ]; then
        echo "QUALITY GATE: Tests are failing." >&2
        echo "" >&2
        echo "All tests must pass before completing a task." >&2
        echo "" >&2
        echo "Failing tests (last 15 lines):" >&2
        echo "$TEST_OUTPUT" | tail -15 >&2
        exit 2
    fi
fi

# ============================================
# COVERAGE THRESHOLD
# ============================================

if [ "$IS_CODE_TASK" = true ]; then
    # Run coverage check
    COVERAGE_OUTPUT=$(cd "$PROJECT_ROOT" && npm run test:coverage 2>&1)

    STMT_COVERAGE=$(echo "$COVERAGE_OUTPUT" | grep -E "^All files" | awk '{print $4}' | sed 's/%//')
    BRANCH_COVERAGE=$(echo "$COVERAGE_OUTPUT" | grep -E "^All files" | awk '{print $6}' | sed 's/%//')

    if [ -n "$STMT_COVERAGE" ]; then
        STMT_INT=${STMT_COVERAGE%.*}
        if [ "$STMT_INT" -lt 80 ]; then
            echo "QUALITY GATE: Statement coverage ${STMT_COVERAGE}% below 80% threshold." >&2
            echo "" >&2
            echo "Improve test coverage before completing this task." >&2
            exit 2
        fi
    fi

    if [ -n "$BRANCH_COVERAGE" ]; then
        BRANCH_INT=${BRANCH_COVERAGE%.*}
        if [ "$BRANCH_INT" -lt 80 ]; then
            echo "QUALITY GATE: Branch coverage ${BRANCH_COVERAGE}% below 80% threshold." >&2
            echo "" >&2
            echo "Improve branch coverage before completing this task." >&2
            exit 2
        fi
    fi
fi

# ============================================
# CREDENTIAL SAFETY
# ============================================

# Check staged files for hardcoded credentials (reuse logic from pre-write-validate)
STAGED_FILES=$(cd "$PROJECT_ROOT" && git diff --cached --name-only 2>/dev/null || true)

for f in $STAGED_FILES; do
    FULL_PATH="$PROJECT_ROOT/$f"
    [ -f "$FULL_PATH" ] || continue

    # Check for hardcoded Twilio Account SIDs
    if grep -E "AC[a-f0-9]{32}" "$FULL_PATH" | grep -vqE "(process\.env|context\.|TWILIO_ACCOUNT_SID|ACCOUNT_SID)"; then
        echo "QUALITY GATE: Hardcoded Twilio Account SID in $f" >&2
        echo "" >&2
        echo "Use environment variables: context.TWILIO_ACCOUNT_SID or process.env.TWILIO_ACCOUNT_SID" >&2
        exit 2
    fi

    # Check for hardcoded API Key SIDs
    if grep -E "SK[a-f0-9]{32}" "$FULL_PATH" | grep -vqE "(process\.env|context\.|TWILIO_API_KEY|API_KEY)"; then
        echo "QUALITY GATE: Hardcoded Twilio API Key SID in $f" >&2
        echo "" >&2
        echo "Use environment variables: context.TWILIO_API_KEY or process.env.TWILIO_API_KEY" >&2
        exit 2
    fi

    # Check for hardcoded auth tokens
    if grep -qE "(authToken|AUTH_TOKEN)['\"]?\s*[:=]\s*['\"][a-f0-9]{32}['\"]" "$FULL_PATH"; then
        echo "QUALITY GATE: Hardcoded Twilio Auth Token in $f" >&2
        echo "" >&2
        echo "Use environment variables: context.TWILIO_AUTH_TOKEN or process.env.TWILIO_AUTH_TOKEN" >&2
        exit 2
    fi
done

exit 0
