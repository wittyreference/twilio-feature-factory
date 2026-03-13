#!/bin/bash
# ABOUTME: Syncs executive summary metrics with actual codebase state.
# ABOUTME: Called by /wrap-up in meta-mode. Auto-updates numeric claims, flags new domains.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$PROJECT_ROOT/.claude/hooks/_meta-mode.sh"

# Only runs in meta-mode (exec summary is a meta-only artifact)
if [ "$CLAUDE_META_MODE" != "true" ]; then
    echo "Skipped: not in meta-mode (.meta/ not found)" >&2
    exit 0
fi

SUMMARY="$PROJECT_ROOT/.meta/old-analysis/2026-03-01-executive-summary.md"
[ -f "$SUMMARY" ] || exit 0

# ============================================
# Helpers
# ============================================

num_to_word() {
    local words=(zero one two three four five six seven eight nine ten \
        eleven twelve thirteen fourteen fifteen sixteen seventeen \
        eighteen nineteen twenty)
    if [ "$1" -le 20 ] 2>/dev/null && [ "$1" -ge 0 ] 2>/dev/null; then
        echo "${words[$1]}"
    else
        echo "$1"
    fi
}

CHANGES=()
WARNINGS=()

# Extract the number preceding a label, e.g. "351" from "351 MCP tools"
current_num() {
    grep -oE "[0-9]+ ${1}" "$SUMMARY" 2>/dev/null | head -1 | grep -oE '[0-9]+' | head -1 || echo ""
}

# Replace the number before a label if it has drifted
update_num() {
    local label="$1" new="$2"
    local cur
    cur=$(current_num "$label")
    [ -n "$cur" ] || return 0
    [ "$cur" != "$new" ] || return 0
    local tmpfile="${SUMMARY}.tmp"
    # Replace first occurrence only: \b ensures whole-number match
    perl -pe "s/\\b${cur}(\\s+\Q${label}\E)/${new}\$1/ && (\$done = 1) unless \$done" \
        "$SUMMARY" > "$tmpfile" && mv "$tmpfile" "$SUMMARY"
    CHANGES+=("${label}: ${cur} → ${new}")
}

# ============================================
# Count current state
# ============================================

# --- Functions ---
FUNC_COUNT=$(find "$PROJECT_ROOT/functions" -name "*.js" \
    ! -path "*/node_modules/*" ! -path "*/__tests__/*" ! -path "*/assets/*" \
    2>/dev/null | wc -l | tr -d ' ')

DOMAIN_COUNT=$(find "$PROJECT_ROOT/functions" -mindepth 1 -maxdepth 1 -type d \
    ! -name node_modules ! -name __tests__ ! -name assets \
    2>/dev/null | wc -l | tr -d ' ')

PUBLIC_COUNT=$(find "$PROJECT_ROOT/functions" -name "*.js" \
    ! -name "*.protected.js" ! -name "*.private.js" \
    ! -path "*/node_modules/*" ! -path "*/__tests__/*" ! -path "*/assets/*" \
    2>/dev/null | wc -l | tr -d ' ')

PROTECTED_COUNT=$(find "$PROJECT_ROOT/functions" -name "*.protected.js" \
    ! -path "*/node_modules/*" ! -path "*/__tests__/*" \
    2>/dev/null | wc -l | tr -d ' ')

PRIVATE_COUNT=$(find "$PROJECT_ROOT/functions" -name "*.private.js" \
    ! -path "*/node_modules/*" ! -path "*/__tests__/*" \
    2>/dev/null | wc -l | tr -d ' ')

# --- MCP tools/modules from REFERENCE.md ---
MCP_REF="$PROJECT_ROOT/agents/mcp-servers/twilio/REFERENCE.md"
MCP_TOOL_COUNT=0
MCP_MODULE_COUNT=0
if [ -f "$MCP_REF" ]; then
    MCP_LINE=$(grep -m1 'tools across.*modules' "$MCP_REF" 2>/dev/null || true)
    if [ -n "$MCP_LINE" ]; then
        MCP_TOOL_COUNT=$(echo "$MCP_LINE" | grep -oE '[0-9]+' | head -1)
        MCP_MODULE_COUNT=$(echo "$MCP_LINE" | grep -oE '[0-9]+' | tail -1)
    fi
fi

# --- Skills ---
SKILL_COUNT=$(find "$PROJECT_ROOT/.claude/skills" -maxdepth 1 -name "*.md" \
    ! -name "README.md" ! -name "CLAUDE.md" 2>/dev/null | wc -l | tr -d ' ')

# --- Hooks (from settings.json) ---
SETTINGS="$PROJECT_ROOT/.claude/settings.json"
HOOK_COUNT=0
EVENT_COUNT=0
if [ -f "$SETTINGS" ] && command -v jq &>/dev/null; then
    HOOK_COUNT=$(jq '[.hooks // {} | to_entries[] | .value[]? | .hooks[]? | select(.type == "command")] | length' "$SETTINGS" 2>/dev/null || echo 0)
    EVENT_COUNT=$(jq '.hooks // {} | keys | length' "$SETTINGS" 2>/dev/null || echo 0)
fi

# --- Design decisions ---
DD_FILE="$PROJECT_ROOT/DESIGN_DECISIONS.md"
DECISION_COUNT=0
[ -f "$DD_FILE" ] && DECISION_COUNT=$(grep -c '^## Decision' "$DD_FILE" 2>/dev/null || echo 0)

# --- Validation tools ---
VAL_FILE="$PROJECT_ROOT/agents/mcp-servers/twilio/src/tools/validation.ts"
VAL_TOOL_COUNT=0
[ -f "$VAL_FILE" ] && VAL_TOOL_COUNT=$(grep -c "'validate_" "$VAL_FILE" 2>/dev/null || echo 0)

# --- npm package version ---
PKG_JSON="$PROJECT_ROOT/agents/mcp-servers/twilio/package.json"
PKG_VERSION=""
if [ -f "$PKG_JSON" ] && command -v jq &>/dev/null; then
    PKG_VERSION=$(jq -r '.version // empty' "$PKG_JSON" 2>/dev/null || true)
fi

# ============================================
# Apply numeric updates
# ============================================

update_num "production functions" "$FUNC_COUNT"
update_num "MCP tools" "$MCP_TOOL_COUNT"
update_num "public endpoints" "$PUBLIC_COUNT"
update_num "protected functions" "$PROTECTED_COUNT"
update_num "private functions" "$PRIVATE_COUNT"
update_num "Automated Hooks" "$HOOK_COUNT"
update_num "Lifecycle Events" "$EVENT_COUNT"
update_num "On-Demand Skills" "$SKILL_COUNT"
update_num "design decisions" "$DECISION_COUNT"
update_num "validation tools" "$VAL_TOOL_COUNT"

# Modules: "across N modules" — specific pattern to avoid false matches
CUR_MODULES=$(grep -oE 'across [0-9]+ modules' "$SUMMARY" 2>/dev/null | head -1 | grep -oE '[0-9]+' || echo "")
if [ -n "$CUR_MODULES" ] && [ "$CUR_MODULES" != "$MCP_MODULE_COUNT" ] && [ "$MCP_MODULE_COUNT" != "0" ]; then
    tmpfile="${SUMMARY}.tmp"
    perl -pe "s/across ${CUR_MODULES} modules/across ${MCP_MODULE_COUNT} modules/ && (\$done = 1) unless \$done" \
        "$SUMMARY" > "$tmpfile" && mv "$tmpfile" "$SUMMARY"
    CHANGES+=("modules: ${CUR_MODULES} → ${MCP_MODULE_COUNT}")
fi

# Domain count — word form ("thirteen domains" → "fourteen domains")
NUM_WORDS="one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty"
CUR_DOMAIN_WORD=$(grep -oE "(${NUM_WORDS}|[0-9]+) domains" "$SUMMARY" 2>/dev/null | head -1 | awk '{print $1}' || echo "")
NEW_DOMAIN_WORD=$(num_to_word "$DOMAIN_COUNT")
if [ -n "$CUR_DOMAIN_WORD" ] && [ "$CUR_DOMAIN_WORD" != "$NEW_DOMAIN_WORD" ]; then
    tmpfile="${SUMMARY}.tmp"
    sed "s/${CUR_DOMAIN_WORD} domains/${NEW_DOMAIN_WORD} domains/" "$SUMMARY" > "$tmpfile" && mv "$tmpfile" "$SUMMARY"
    CHANGES+=("domains: ${CUR_DOMAIN_WORD} → ${NEW_DOMAIN_WORD}")
fi

# npm package version — "(vX.Y.Z)" pattern
if [ -n "$PKG_VERSION" ]; then
    CUR_VERSION=$(grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' "$SUMMARY" 2>/dev/null | head -1 || echo "")
    NEW_VERSION="v${PKG_VERSION}"
    if [ -n "$CUR_VERSION" ] && [ "$CUR_VERSION" != "$NEW_VERSION" ]; then
        tmpfile="${SUMMARY}.tmp"
        sed "s/${CUR_VERSION}/${NEW_VERSION}/" "$SUMMARY" > "$tmpfile" && mv "$tmpfile" "$SUMMARY"
        CHANGES+=("version: ${CUR_VERSION} → ${NEW_VERSION}")
    fi
fi

# ============================================
# Detect unmentioned domains
# ============================================

while IFS= read -r dir; do
    domain=$(basename "$dir")
    # Try multiple patterns: hyphenated, spaced, and concatenated (camelCase)
    search_hyphen=$(echo "$domain" | sed 's/-/[- ]/g')
    search_joined=$(echo "$domain" | sed 's/-//g')
    if ! grep -qi "$search_hyphen" "$SUMMARY" 2>/dev/null && \
       ! grep -qi "$search_joined" "$SUMMARY" 2>/dev/null; then
        WARNINGS+=("New domain '${domain}' not mentioned in executive summary")
    fi
done < <(find "$PROJECT_ROOT/functions" -mindepth 1 -maxdepth 1 -type d \
    ! -name node_modules ! -name __tests__ ! -name assets 2>/dev/null | sort)

# ============================================
# Report
# ============================================

if [ ${#CHANGES[@]} -gt 0 ] || [ ${#WARNINGS[@]} -gt 0 ]; then
    echo "─── Executive Summary Sync ───" >&2

    if [ ${#CHANGES[@]} -gt 0 ]; then
        echo "Updated:" >&2
        for c in "${CHANGES[@]}"; do
            echo "  • $c" >&2
        done
    fi

    if [ ${#WARNINGS[@]} -gt 0 ]; then
        echo "Needs attention:" >&2
        for w in "${WARNINGS[@]}"; do
            echo "  ! $w" >&2
        done
    fi

    echo "───────────────────────────────" >&2
fi

exit 0
