#!/usr/bin/env bash
# ABOUTME: Counts MCP tools by module and priority tier.
# ABOUTME: Source of truth for tool count claims in README.md and CLAUDE.md.

set -euo pipefail

TOOLS_DIR="$(git rev-parse --show-toplevel)/agents/mcp-servers/twilio/src/tools"

if [[ ! -d "$TOOLS_DIR" ]]; then
  echo "ERROR: Tools directory not found at $TOOLS_DIR" >&2
  exit 1
fi

# Priority tier assignments (match index.ts comments)
declare -A TIERS
TIERS[messaging]=P0 TIERS[voice]=P0 TIERS[phone-numbers]=P0 TIERS[verify]=P0
TIERS[payments]=P0 TIERS[sync]=P0 TIERS[taskrouter]=P0 TIERS[debugger]=P0
TIERS[lookups]=P1 TIERS[studio]=P1 TIERS[messaging-services]=P1 TIERS[serverless]=P1
TIERS[intelligence]=P2 TIERS[video]=P2 TIERS[proxy]=P2 TIERS[trusthub]=P2
TIERS[content]=P2 TIERS[voice-config]=P2 TIERS[regulatory]=P2 TIERS[media]=P2
TIERS[sip]=P3 TIERS[trunking]=P3 TIERS[accounts]=P3 TIERS[iam]=P3
TIERS[pricing]=P3 TIERS[notify]=P3 TIERS[addresses]=P3
TIERS[validation]=validation

P0=0 P1=0 P2=0 P3=0 VAL=0 TOTAL=0 MODULES=0

echo "=== MCP Tool Count Report ==="
echo ""
printf "%-25s %-6s %s\n" "Module" "Tier" "Tools"
printf "%-25s %-6s %s\n" "-------" "----" "-----"

for f in "$TOOLS_DIR"/*.ts; do
  module=$(basename "$f" .ts)
  count=$(grep -c 'createTool(' "$f" 2>/dev/null || echo 0)
  tier="${TIERS[$module]:-unknown}"
  printf "%-25s %-6s %d\n" "$module" "$tier" "$count"

  TOTAL=$((TOTAL + count))
  MODULES=$((MODULES + 1))
  case "$tier" in
    P0) P0=$((P0 + count)) ;;
    P1) P1=$((P1 + count)) ;;
    P2) P2=$((P2 + count)) ;;
    P3) P3=$((P3 + count)) ;;
    validation) VAL=$((VAL + count)) ;;
  esac
done

echo ""
echo "=== Summary ==="
echo "P0 (Core):       $P0 tools"
echo "P1 (Extended):   $P1 tools"
echo "P2 (Advanced):   $P2 tools"
echo "P3 (Enterprise): $P3 tools"
echo "Validation:      $VAL tools"
echo "---"
echo "Total:           $TOTAL tools across $MODULES modules"

# Machine-readable output for CI
if [[ "${1:-}" == "--json" ]]; then
  echo ""
  echo "{\"total\":$TOTAL,\"modules\":$MODULES,\"P0\":$P0,\"P1\":$P1,\"P2\":$P2,\"P3\":$P3,\"validation\":$VAL}"
fi
