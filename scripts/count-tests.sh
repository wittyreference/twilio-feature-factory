#!/usr/bin/env bash
# ABOUTME: Counts test suites and test cases across all packages.
# ABOUTME: Source of truth for test count claims. Outputs JSON for CI integration.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
TOTAL_SUITES=0
TOTAL_TESTS=0

declare -A PACKAGES=(
  ["serverless"]="$REPO_ROOT"
  ["mcp-server"]="$REPO_ROOT/agents/mcp-servers/twilio"
  ["feature-factory"]="$REPO_ROOT/agents/feature-factory"
  ["voice-ai-builder"]="$REPO_ROOT/agents/voice-ai-builder"
)

echo "=== Test Count Report ==="
echo ""
printf "%-20s %-10s %-10s\n" "Package" "Suites" "Tests"
printf "%-20s %-10s %-10s\n" "-------" "------" "-----"

JSON_PARTS=()

for pkg in "${!PACKAGES[@]}"; do
  dir="${PACKAGES[$pkg]}"
  if [[ ! -f "$dir/package.json" ]]; then
    continue
  fi

  # Count test files (suites)
  suites=0
  for test_dir in "$dir/__tests__" "$dir/src/__tests__"; do
    if [[ -d "$test_dir" ]]; then
      count=$(find "$test_dir" \( -name '*.test.*' -o -name '*.spec.*' \) 2>/dev/null | wc -l | tr -d ' ')
      suites=$((suites + count))
    fi
  done

  # Count individual test cases (it/test calls)
  tests=0
  for test_dir in "$dir/__tests__" "$dir/src/__tests__"; do
    if [[ -d "$test_dir" ]]; then
      count=$(grep -rE '^\s*(it|test)\(' "$test_dir" 2>/dev/null | wc -l | tr -d ' ')
      tests=$((tests + count))
    fi
  done

  printf "%-20s %-10d %-10d\n" "$pkg" "$suites" "$tests"

  TOTAL_SUITES=$((TOTAL_SUITES + suites))
  TOTAL_TESTS=$((TOTAL_TESTS + tests))

  JSON_PARTS+=("\"$pkg\":{\"suites\":$suites,\"tests\":$tests}")
done

echo ""
echo "Total: $TOTAL_SUITES suites, $TOTAL_TESTS test cases"

# Machine-readable output
if [[ "${1:-}" == "--json" ]]; then
  json_body=$(IFS=,; echo "${JSON_PARTS[*]}")
  echo ""
  echo "{\"total_suites\":$TOTAL_SUITES,\"total_tests\":$TOTAL_TESTS,\"packages\":{$json_body}}"
fi

# Write stats file for CI
if [[ "${1:-}" == "--save" ]]; then
  json_body=$(IFS=,; echo "${JSON_PARTS[*]}")
  echo "{\"total_suites\":$TOTAL_SUITES,\"total_tests\":$TOTAL_TESTS,\"packages\":{$json_body},\"generated\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$REPO_ROOT/test-stats.json"
  echo "Saved to test-stats.json"
fi
