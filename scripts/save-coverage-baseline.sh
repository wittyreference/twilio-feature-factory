#!/bin/bash
# ABOUTME: Save current test coverage as a baseline for regression detection.
# ABOUTME: Stores coverage-summary.json snapshot and test file count in .coverage-baseline.json.

set -euo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
BASELINE_FILE="$PROJECT_ROOT/.coverage-baseline.json"

echo "Running tests with coverage..."
cd "$PROJECT_ROOT"
npm test -- --coverage --coverageReporters=json-summary --silent 2>/dev/null

SUMMARY="$PROJECT_ROOT/coverage/coverage-summary.json"
if [ ! -f "$SUMMARY" ]; then
    echo "ERROR: Coverage summary not generated at $SUMMARY" >&2
    exit 1
fi

if ! command -v jq &>/dev/null; then
    echo "ERROR: jq required. Install: brew install jq" >&2
    exit 1
fi

# Count test files
TEST_COUNT=$(find "$PROJECT_ROOT/__tests__" -name "*.test.js" -o -name "*.test.ts" -o -name "*.spec.js" -o -name "*.spec.ts" 2>/dev/null | wc -l | tr -d ' ')

# Extract coverage metrics
STATEMENTS=$(jq -r '.total.statements.pct // 0' "$SUMMARY")
BRANCHES=$(jq -r '.total.branches.pct // 0' "$SUMMARY")
FUNCTIONS=$(jq -r '.total.functions.pct // 0' "$SUMMARY")
LINES=$(jq -r '.total.lines.pct // 0' "$SUMMARY")

# Save baseline
jq -n \
    --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg commit "$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" \
    --argjson test_count "$TEST_COUNT" \
    --argjson statements "$STATEMENTS" \
    --argjson branches "$BRANCHES" \
    --argjson functions "$FUNCTIONS" \
    --argjson lines "$LINES" \
    '{
        saved_at: $date,
        commit: $commit,
        test_file_count: $test_count,
        coverage: {
            statements: $statements,
            branches: $branches,
            functions: $functions,
            lines: $lines
        }
    }' > "$BASELINE_FILE"

echo ""
echo "Coverage baseline saved to .coverage-baseline.json:"
echo "  Test files: $TEST_COUNT"
echo "  Statements: ${STATEMENTS}%"
echo "  Branches:   ${BRANCHES}%"
echo "  Functions:  ${FUNCTIONS}%"
echo "  Lines:      ${LINES}%"
echo "  Commit:     $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
