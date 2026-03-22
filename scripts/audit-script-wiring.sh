#!/bin/bash
# ABOUTME: Finds orphaned scripts — .sh files not referenced from hooks, commands, docs, or other scripts.
# ABOUTME: On-demand tool for periodic cleanup; not wired into pre-commit or CI.

# Usage:
#   ./scripts/audit-script-wiring.sh          # Full inventory with status
#   ./scripts/audit-script-wiring.sh --report  # Same as default
#   ./scripts/audit-script-wiring.sh --quiet   # Exit code only (0=clean, 1=orphans)

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

# Collect all .sh files to audit
SCRIPTS=()
while IFS= read -r f; do
    SCRIPTS+=("$f")
done < <(find "$PROJECT_ROOT/scripts" -maxdepth 1 -name "*.sh" -exec basename {} \; 2>/dev/null | sort)

HOOKS=()
while IFS= read -r f; do
    HOOKS+=("$f")
done < <(find "$PROJECT_ROOT/.claude/hooks" -maxdepth 1 -name "*.sh" -exec basename {} \; 2>/dev/null | sort)

# Reference sources to check against
SETTINGS="$PROJECT_ROOT/.claude/settings.json"
COMMANDS_DIR="$PROJECT_ROOT/.claude/commands"
SKILLS_DIR="$PROJECT_ROOT/.claude/skills"
SCRIPTS_CLAUDE="$PROJECT_ROOT/scripts/CLAUDE.md"
SCRIPTS_REF="$PROJECT_ROOT/scripts/REFERENCE.md"
PKG_JSON="$PROJECT_ROOT/package.json"

# Check if a filename appears in any reference source
# Returns 0 if referenced, 1 if orphaned
is_referenced() {
    local filename="$1"
    local basename_no_ext="${filename%.sh}"

    # 1. settings.json (hook wiring)
    if [ -f "$SETTINGS" ] && grep -q "$filename" "$SETTINGS" 2>/dev/null; then
        return 0
    fi

    # 2. .claude/commands/*.md (slash command references)
    if [ -d "$COMMANDS_DIR" ] && grep -rql "$filename" "$COMMANDS_DIR" 2>/dev/null; then
        return 0
    fi

    # 3. .claude/skills/*.md (skill references)
    if [ -d "$SKILLS_DIR" ] && grep -rql "$filename" "$SKILLS_DIR" 2>/dev/null; then
        return 0
    fi

    # 4. scripts/CLAUDE.md and scripts/REFERENCE.md (documentation)
    if [ -f "$SCRIPTS_CLAUDE" ] && grep -q "$filename" "$SCRIPTS_CLAUDE" 2>/dev/null; then
        return 0
    fi
    if [ -f "$SCRIPTS_REF" ] && grep -q "$filename" "$SCRIPTS_REF" 2>/dev/null; then
        return 0
    fi

    # 5. package.json scripts
    if [ -f "$PKG_JSON" ] && grep -q "$filename" "$PKG_JSON" 2>/dev/null; then
        return 0
    fi

    # 6. Other scripts (called as dependency) — search all .sh files for references
    local match_count
    match_count=$(grep -rl "$filename" "$PROJECT_ROOT/scripts/"*.sh "$PROJECT_ROOT/.claude/hooks/"*.sh 2>/dev/null | grep -cv "$filename$" || true)
    if [ "$match_count" -gt 0 ]; then
        return 0
    fi

    # 7. Root CLAUDE.md
    if grep -q "$filename" "$PROJECT_ROOT/CLAUDE.md" 2>/dev/null; then
        return 0
    fi

    # 8. GitHub Actions workflows
    if [ -d "$PROJECT_ROOT/.github/workflows" ] && grep -rql "$filename" "$PROJECT_ROOT/.github/workflows" 2>/dev/null; then
        return 0
    fi

    return 1
}

ORPHANED_SCRIPTS=()
ORPHANED_HOOKS=()
WIRED_SCRIPTS=()
WIRED_HOOKS=()

# Audit scripts/
for script in "${SCRIPTS[@]}"; do
    if is_referenced "$script"; then
        WIRED_SCRIPTS+=("$script")
    else
        ORPHANED_SCRIPTS+=("$script")
    fi
done

# Audit .claude/hooks/ (skip _ prefixed helpers — they're sourced, not standalone)
for hook in "${HOOKS[@]}"; do
    if [[ "$hook" == _* ]]; then
        # Helper scripts are sourced by other hooks, check if any hook sources them
        if grep -rl "$hook" "$PROJECT_ROOT/.claude/hooks/"*.sh 2>/dev/null | grep -qv "$hook"; then
            WIRED_HOOKS+=("$hook (helper)")
        else
            ORPHANED_HOOKS+=("$hook (helper)")
        fi
    elif is_referenced "$hook"; then
        WIRED_HOOKS+=("$hook")
    else
        ORPHANED_HOOKS+=("$hook")
    fi
done

TOTAL_ORPHANED=$(( ${#ORPHANED_SCRIPTS[@]} + ${#ORPHANED_HOOKS[@]} ))

if [ "$QUIET" = true ]; then
    exit $(( TOTAL_ORPHANED > 0 ? 1 : 0 ))
fi

# Full report — use index loops for set -u compat with empty arrays
echo "Script Wiring Audit"
echo "==================="
echo ""
echo "scripts/ (${#SCRIPTS[@]} files):"
for (( i=0; i<${#WIRED_SCRIPTS[@]}; i++ )); do
    echo "  [WIRED] ${WIRED_SCRIPTS[$i]}"
done
for (( i=0; i<${#ORPHANED_SCRIPTS[@]}; i++ )); do
    echo "  [ORPHAN] ${ORPHANED_SCRIPTS[$i]}"
done

echo ""
echo ".claude/hooks/ (${#HOOKS[@]} files):"
for (( i=0; i<${#WIRED_HOOKS[@]}; i++ )); do
    echo "  [WIRED] ${WIRED_HOOKS[$i]}"
done
for (( i=0; i<${#ORPHANED_HOOKS[@]}; i++ )); do
    echo "  [ORPHAN] ${ORPHANED_HOOKS[$i]}"
done

echo ""
if [ "$TOTAL_ORPHANED" -gt 0 ]; then
    echo "Found $TOTAL_ORPHANED orphaned script(s)."
    echo "These files are not referenced from settings.json, commands, skills, docs, package.json, workflows, or other scripts."
    exit 1
else
    echo "All scripts are wired. No orphans found."
    exit 0
fi
