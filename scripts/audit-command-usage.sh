#!/bin/bash
# ABOUTME: Audit slash command documentation and usage — finds undocumented commands and reference doc drift.
# ABOUTME: On-demand companion to audit-script-wiring.sh; not wired into pre-commit or CI.

# Usage:
#   ./scripts/audit-command-usage.sh          # Full inventory with status
#   ./scripts/audit-command-usage.sh --report  # Same as default
#   ./scripts/audit-command-usage.sh --quiet   # Exit code only (0=no drift, 1=drift)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

QUIET=false
for arg in "$@"; do
    case "$arg" in
        --report) ;;
        --quiet) QUIET=true ;;
    esac
done

# Reference sources
SLASH_COMMANDS_REF="$PROJECT_ROOT/.claude/rules/slash-commands.md"
COMMANDS_DIR="$PROJECT_ROOT/.claude/commands"
ROOT_CLAUDE="$PROJECT_ROOT/CLAUDE.md"

# Collect all command names (strip .md extension)
COMMANDS=()
while IFS= read -r f; do
    COMMANDS+=("${f%.md}")
done < <(find "$COMMANDS_DIR" -maxdepth 1 -name "*.md" -exec basename {} \; 2>/dev/null | sort)

# Capture git log once (last 500 commits, subject line only)
GIT_LOG=$(git -C "$PROJECT_ROOT" log --oneline -500 --format='%s' 2>/dev/null || true)

# Build list of doc files to search (domain CLAUDEs, references, skills)
DOC_FILES=()
while IFS= read -r f; do
    DOC_FILES+=("$f")
done < <(find \
    "$PROJECT_ROOT/functions" -name "CLAUDE.md" 2>/dev/null; \
    find "$PROJECT_ROOT/agents" -name "CLAUDE.md" 2>/dev/null; \
    find "$PROJECT_ROOT/.claude/references" -name "*.md" 2>/dev/null; \
    find "$PROJECT_ROOT/.claude/skills" -name "*.md" 2>/dev/null \
)

# classify_command <name>
# Outputs: in_ref handoff_count git_count doc_count
classify_command() {
    local cmd="$1"
    local in_ref="no"
    local handoff_count=0
    local git_count=0
    local doc_count=0

    # Check 1: Listed in slash-commands.md?
    if [ -f "$SLASH_COMMANDS_REF" ] && grep -q "/$cmd" "$SLASH_COMMANDS_REF" 2>/dev/null; then
        in_ref="yes"
    fi

    # Check 2: Referenced in root CLAUDE.md?
    if [ -f "$ROOT_CLAUDE" ] && grep -q "/$cmd" "$ROOT_CLAUDE" 2>/dev/null; then
        doc_count=$((doc_count + 1))
    fi

    # Check 3: Referenced in domain docs, references, skills?
    for docfile in "${DOC_FILES[@]}"; do
        if grep -q "/$cmd" "$docfile" 2>/dev/null; then
            doc_count=$((doc_count + 1))
        fi
    done

    # Check 4: Cross-command handoffs (other commands referencing this one)
    handoff_count=$(grep -rl "/$cmd" "$COMMANDS_DIR/"*.md 2>/dev/null \
        | grep -cv "/${cmd}.md$" || true)

    # Check 5: Git history evidence (case-insensitive, word-boundary-ish)
    # Match: "/cmd", "cmd:", "cmd " at start of subject — heuristic, not exact
    git_count=$(echo "$GIT_LOG" | grep -ciE "(^|/)$cmd(:|[[:space:]]|$)" || true)

    echo "$in_ref $handoff_count $git_count $doc_count"
}

# Classify all commands
declare -a CMD_NAMES=()
declare -a CMD_STATUS=()
declare -a CMD_REF=()
declare -a CMD_HANDOFFS=()
declare -a CMD_GIT=()
declare -a CMD_DOCS=()

DRIFT_COUNT=0
DRIFT_LIST=()
ACTIVE_COUNT=0
DOCUMENTED_COUNT=0
UNDOCUMENTED_COUNT=0
ORPHAN_COUNT=0

for cmd in "${COMMANDS[@]}"; do
    result=$(classify_command "$cmd")
    read -r in_ref handoffs git_hits docs <<< "$result"

    has_evidence=false
    if [ "$handoffs" -gt 0 ] || [ "$git_hits" -gt 0 ] || [ "$docs" -gt 0 ]; then
        has_evidence=true
    fi

    if [ "$in_ref" = "yes" ] && [ "$has_evidence" = true ]; then
        status="ACTIVE"
        ACTIVE_COUNT=$((ACTIVE_COUNT + 1))
    elif [ "$in_ref" = "yes" ]; then
        status="DOCUMENTED"
        DOCUMENTED_COUNT=$((DOCUMENTED_COUNT + 1))
    elif [ "$has_evidence" = true ]; then
        status="UNDOCUMENTED"
        UNDOCUMENTED_COUNT=$((UNDOCUMENTED_COUNT + 1))
        DRIFT_COUNT=$((DRIFT_COUNT + 1))
        DRIFT_LIST+=("$cmd")
    else
        status="ORPHAN"
        ORPHAN_COUNT=$((ORPHAN_COUNT + 1))
        DRIFT_COUNT=$((DRIFT_COUNT + 1))
        DRIFT_LIST+=("$cmd")
    fi

    CMD_NAMES+=("$cmd")
    CMD_STATUS+=("$status")
    CMD_REF+=("$in_ref")
    CMD_HANDOFFS+=("$handoffs")
    CMD_GIT+=("$git_hits")
    CMD_DOCS+=("$docs")
done

TOTAL=${#COMMANDS[@]}

# --quiet mode: exit code only
if [ "$QUIET" = true ]; then
    exit $((DRIFT_COUNT > 0 ? 1 : 0))
fi

# Full report
echo "Slash Command Usage Audit"
echo "========================="
echo ""
echo "Commands: $TOTAL total ($ACTIVE_COUNT active, $DOCUMENTED_COUNT documented, $UNDOCUMENTED_COUNT undocumented, $ORPHAN_COUNT orphan)"
echo ""

# Print sorted: ACTIVE first, then DOCUMENTED, UNDOCUMENTED, ORPHAN
STATUS_ORDER=("ACTIVE" "DOCUMENTED" "UNDOCUMENTED" "ORPHAN")
for target_status in "${STATUS_ORDER[@]}"; do
    for (( i=0; i<TOTAL; i++ )); do
        if [ "${CMD_STATUS[$i]}" = "$target_status" ]; then
            printf "  [%-12s] %-24s ref:%-3s  handoffs:%-2s  git:%-2s  docs:%-2s\n" \
                "${CMD_STATUS[$i]}" "/${CMD_NAMES[$i]}" \
                "${CMD_REF[$i]}" "${CMD_HANDOFFS[$i]}" \
                "${CMD_GIT[$i]}" "${CMD_DOCS[$i]}"
        fi
    done
done

# Drift report
if [ "$DRIFT_COUNT" -gt 0 ]; then
    echo ""
    echo "Reference doc drift: $DRIFT_COUNT command(s) not in slash-commands.md"
    printf "  "
    printf "/%s " "${DRIFT_LIST[@]}"
    echo ""
fi

# Caveat
echo ""
echo "Note: Git evidence is heuristic — commit prefix matches (e.g., 'test:')"
echo "don't necessarily mean the slash command was invoked."

exit $((DRIFT_COUNT > 0 ? 1 : 0))
