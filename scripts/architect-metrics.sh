#!/usr/bin/env bash
# ABOUTME: Collects quantitative metrics from the codebase for architect summary drift detection.
# ABOUTME: Outputs JSON snapshot. Used by session-checklist.sh to flag when the architect summary is stale.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"

# ============================================
# Metric collectors
# ============================================

count_functions() {
  find "$REPO_ROOT/functions" -name "*.js" ! -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' '
}

count_function_domains() {
  # Count distinct top-level subdirectories under functions/ that contain .js files
  find "$REPO_ROOT/functions" -name "*.js" ! -path "*/node_modules/*" -print0 2>/dev/null \
    | xargs -0 -I{} dirname {} \
    | sed "s|$REPO_ROOT/functions/||" \
    | cut -d'/' -f1 \
    | sort -u \
    | wc -l | tr -d ' '
}

count_design_decisions() {
  local raw
  raw=$(grep -c '^## Decision' "$REPO_ROOT/DESIGN_DECISIONS.md" 2>/dev/null || echo 0)
  # Subtract 1 for the template stub "Decision N: [Title]"
  if grep -q '## Decision N:' "$REPO_ROOT/DESIGN_DECISIONS.md" 2>/dev/null; then
    echo $((raw - 1))
  else
    echo "$raw"
  fi
}

count_hooks() {
  # Production hooks only (exclude helpers starting with _, exclude __tests__)
  find "$REPO_ROOT/.claude/hooks" -maxdepth 1 -name "*.sh" ! -name "_*" 2>/dev/null | wc -l | tr -d ' '
}

count_invariants() {
  # Count invariant rules across all *-invariants.md files
  # Each rule is a list item starting with "- **"
  grep -c '^- \*\*' "$REPO_ROOT"/.claude/rules/*-invariants.md 2>/dev/null | \
    awk -F: '{s+=$NF} END {print s+0}'
}

count_skills() {
  find "$REPO_ROOT/.claude/skills" -name "*.md" 2>/dev/null | wc -l | tr -d ' '
}

count_mcp_tools() {
  if [[ -x "$REPO_ROOT/scripts/count-mcp-tools.sh" ]]; then
    local json
    json=$("$REPO_ROOT/scripts/count-mcp-tools.sh" --json 2>/dev/null | tail -1)
    echo "$json"
    return
  fi
  # Fallback: count createTool calls directly
  local total
  total=$(grep -r 'createTool(' "$REPO_ROOT/agents/mcp-servers/twilio/src/tools/" 2>/dev/null | wc -l | tr -d ' ')
  echo "{\"total\":$total,\"modules\":0,\"P0\":0,\"P1\":0,\"P2\":0,\"P3\":0,\"validation\":0}"
}

count_mcp_modules() {
  find "$REPO_ROOT/agents/mcp-servers/twilio/src/tools" -name "*.ts" 2>/dev/null | wc -l | tr -d ' '
}

count_validation_tools() {
  grep -c 'createTool(' "$REPO_ROOT/agents/mcp-servers/twilio/src/tools/validation.ts" 2>/dev/null || echo 0
}

count_use_cases() {
  # Count use case rows in voice-use-case-map quick reference table
  grep -cE '^\| [0-9]+ \|' "$REPO_ROOT/.claude/skills/voice-use-case-map.md" 2>/dev/null || echo 0
}

# Line counts for major components
lines_in() {
  local dir="$1"
  local ext="${2:-ts}"
  if [[ -d "$dir" ]]; then
    find "$dir" -name "*.$ext" ! -path "*/node_modules/*" ! -path "*/dist/*" 2>/dev/null \
      | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}'
  else
    echo 0
  fi
}

lines_in_multi() {
  local dir="$1"
  shift
  local total=0
  for ext in "$@"; do
    local count
    count=$(lines_in "$dir" "$ext")
    total=$((total + count))
  done
  echo "$total"
}

# ============================================
# Collect all metrics
# ============================================

FUNCTIONS=$(count_functions)
FUNCTION_DOMAINS=$(count_function_domains)
DECISIONS=$(count_design_decisions)
HOOKS=$(count_hooks)
INVARIANTS=$(count_invariants)
SKILLS=$(count_skills)
MCP_JSON=$(count_mcp_tools)
MCP_MODULES=$(count_mcp_modules)
VALIDATION_TOOLS=$(count_validation_tools)
USE_CASES=$(count_use_cases)

# Line counts
LINES_MCP_TOOLS=$(lines_in "$REPO_ROOT/agents/mcp-servers/twilio/src/tools")
LINES_VALIDATION=$(lines_in "$REPO_ROOT/agents/mcp-servers/twilio/src/validation")
LINES_FACTORY=$(lines_in "$REPO_ROOT/agents/feature-factory/src")
LINES_HOOKS=$(lines_in_multi "$REPO_ROOT/.claude/hooks" "sh")
LINES_FUNCTIONS=$(lines_in_multi "$REPO_ROOT/functions" "js")
LINES_SKILLS=$(lines_in_multi "$REPO_ROOT/.claude/skills" "md")
LINES_REFERENCES=$(lines_in_multi "$REPO_ROOT/.claude/references" "md")
LINES_TESTS=$(lines_in_multi "$REPO_ROOT/__tests__" "ts" "js" "sh")
LINES_DESIGN_DECISIONS=$(wc -l < "$REPO_ROOT/DESIGN_DECISIONS.md" 2>/dev/null | tr -d ' ')

MCP_TOTAL=$(echo "$MCP_JSON" | grep -o '"total":[0-9]*' | grep -o '[0-9]*')

# ============================================
# Output
# ============================================

JSON=$(cat <<EOF
{
  "generated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "counts": {
    "functions": $FUNCTIONS,
    "function_domains": $FUNCTION_DOMAINS,
    "mcp_tools": ${MCP_TOTAL:-0},
    "mcp_modules": $MCP_MODULES,
    "validation_tools": $VALIDATION_TOOLS,
    "design_decisions": $DECISIONS,
    "hooks": $HOOKS,
    "invariants": $INVARIANTS,
    "skills": $SKILLS,
    "use_cases": $USE_CASES
  },
  "lines": {
    "mcp_tools": $LINES_MCP_TOOLS,
    "validation": $LINES_VALIDATION,
    "feature_factory": $LINES_FACTORY,
    "hooks": $LINES_HOOKS,
    "functions": $LINES_FUNCTIONS,
    "skills": $LINES_SKILLS,
    "references": $LINES_REFERENCES,
    "tests": $LINES_TESTS,
    "design_decisions": $LINES_DESIGN_DECISIONS
  },
  "mcp_tiers": $MCP_JSON
}
EOF
)

case "${1:-}" in
  --json)
    echo "$JSON"
    ;;
  --snapshot)
    SNAPSHOT_FILE="${2:-$REPO_ROOT/architect-metrics.json}"
    echo "$JSON" > "$SNAPSHOT_FILE"
    echo "Snapshot saved to $SNAPSHOT_FILE"
    ;;
  --diff)
    SNAPSHOT_FILE="${2:-$REPO_ROOT/architect-metrics.json}"
    if [[ ! -f "$SNAPSHOT_FILE" ]]; then
      echo "No snapshot found at $SNAPSHOT_FILE — run with --snapshot first" >&2
      exit 1
    fi

    # Compare counts and report drift
    DRIFTS=()
    while IFS='=' read -r key current; do
      previous=$(grep -o "\"$key\": *[0-9]*" "$SNAPSHOT_FILE" 2>/dev/null | grep -o '[0-9]*' | head -1)
      if [[ -n "$previous" ]] && [[ "$current" != "$previous" ]]; then
        DRIFTS+=("$key: $previous → $current")
      fi
    done <<EOF
functions=$FUNCTIONS
function_domains=$FUNCTION_DOMAINS
mcp_tools=${MCP_TOTAL:-0}
mcp_modules=$MCP_MODULES
validation_tools=$VALIDATION_TOOLS
design_decisions=$DECISIONS
hooks=$HOOKS
invariants=$INVARIANTS
skills=$SKILLS
use_cases=$USE_CASES
EOF

    if [[ ${#DRIFTS[@]} -eq 0 ]]; then
      echo "No drift detected"
      exit 0
    else
      echo "ARCHITECT SUMMARY DRIFT DETECTED:"
      for d in "${DRIFTS[@]}"; do
        echo "  - $d"
      done
      exit 1
    fi
    ;;
  *)
    # Human-readable output
    echo "=== Architect Metrics ==="
    echo ""
    echo "Counts:"
    echo "  Functions:         $FUNCTIONS (across $FUNCTION_DOMAINS domains)"
    echo "  MCP Tools:         ${MCP_TOTAL:-0} (across $MCP_MODULES modules)"
    echo "  Validation Tools:  $VALIDATION_TOOLS"
    echo "  Design Decisions:  $DECISIONS"
    echo "  Hooks:             $HOOKS"
    echo "  Invariants:        $INVARIANTS"
    echo "  Skills:            $SKILLS"
    echo "  Use Cases:         $USE_CASES"
    echo ""
    echo "Lines of Code:"
    echo "  MCP Tools:         $LINES_MCP_TOOLS"
    echo "  Deep Validation:   $LINES_VALIDATION"
    echo "  Feature Factory:   $LINES_FACTORY"
    echo "  Hooks:             $LINES_HOOKS"
    echo "  Functions:         $LINES_FUNCTIONS"
    echo "  Skills:            $LINES_SKILLS"
    echo "  References:        $LINES_REFERENCES"
    echo "  Tests:             $LINES_TESTS"
    echo "  Design Decisions:  $LINES_DESIGN_DECISIONS"
    ;;
esac
