#!/bin/bash
# ABOUTME: Detects structural drift between README.md counts/trees and actual codebase state.
# ABOUTME: Checks directory counts, command counts, hook counts, and script counts.

# Usage:
#   ./scripts/check-readme-drift.sh          # Full report to stdout
#   ./scripts/check-readme-drift.sh --quiet   # One-line summary for hooks
#   ./scripts/check-readme-drift.sh --json    # Machine-readable JSON output

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

QUIET=false
JSON=false
for arg in "$@"; do
    case "$arg" in
        --quiet) QUIET=true ;;
        --json) JSON=true ;;
    esac
done

README="$PROJECT_ROOT/README.md"
if [ ! -f "$README" ]; then
    echo "No README.md found at project root" >&2
    exit 1
fi

DRIFT_ITEMS=()
DRIFT_DETAILS=""

# Helper: extract a number from README matching a pattern
# Args: $1=grep pattern (ERE), returns first number found on matching line
readme_count() {
    local pattern="$1"
    grep -oEi "$pattern" "$README" 2>/dev/null | head -1 | grep -oE '[0-9]+' | head -1 || echo "0"
}

# Helper: count entries in a README markdown table (lines matching "| ... | ... |")
# Args: $1=section header text to find the table after
readme_table_rows() {
    local header="$1"
    local in_section=false
    local in_table=false
    local count=0
    while IFS= read -r line; do
        if [[ "$line" == *"$header"* ]]; then
            in_section=true
            continue
        fi
        if [ "$in_section" = true ]; then
            if [[ "$line" =~ ^\|.*\|.*\| ]]; then
                if [ "$in_table" = false ]; then
                    # Skip header row
                    in_table=true
                    continue
                fi
                if [[ "$line" =~ ^\|[-\ ]+\| ]]; then
                    # Skip separator row
                    continue
                fi
                count=$((count + 1))
            elif [ "$in_table" = true ] && [[ ! "$line" =~ ^\| ]]; then
                # Table ended
                break
            fi
        fi
    done < "$README"
    echo "$count"
}

# ============================================
# CHECK 1: functions/ subdirectory count
# ============================================
if [ -d "$PROJECT_ROOT/functions" ]; then
    ACTUAL_FUNCS=$(find "$PROJECT_ROOT/functions" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
    # Count indented directory entries under functions/ (stop at next top-level entry)
    README_FUNCS=$(awk '/├── functions\//{f=1;next} /^[├└]── /{f=0} f && /[├└]── /' "$README" | wc -l | tr -d ' ')

    if [ "$ACTUAL_FUNCS" -gt "$README_FUNCS" ] 2>/dev/null; then
        DRIFT_ITEMS+=("functions(+$((ACTUAL_FUNCS - README_FUNCS)))")
        DRIFT_DETAILS="${DRIFT_DETAILS}functions/ subdirectories: README shows ${README_FUNCS}, actual ${ACTUAL_FUNCS}"$'\n'
    fi
fi

# ============================================
# CHECK 2: Slash command count
# ============================================
if [ -d "$PROJECT_ROOT/.claude/commands" ]; then
    ACTUAL_CMDS=$(find "$PROJECT_ROOT/.claude/commands" -name "*.md" -maxdepth 1 | wc -l | tr -d ' ')
    README_CMDS=$(readme_count '[0-9]+ slash commands')

    if [ "$ACTUAL_CMDS" -gt "$README_CMDS" ] 2>/dev/null; then
        DRIFT_ITEMS+=("commands(+$((ACTUAL_CMDS - README_CMDS)))")
        DRIFT_DETAILS="${DRIFT_DETAILS}Slash commands: README says ${README_CMDS}, actual ${ACTUAL_CMDS}"$'\n'
    fi
elif [ -d "$PROJECT_ROOT/commands" ]; then
    # Plugin layout (commands/ at root)
    ACTUAL_CMDS=$(find "$PROJECT_ROOT/commands" -name "*.md" -maxdepth 1 | wc -l | tr -d ' ')
    README_CMDS=$(readme_count '[0-9]+ slash commands')

    if [ "$README_CMDS" != "0" ] && [ "$ACTUAL_CMDS" -gt "$README_CMDS" ] 2>/dev/null; then
        DRIFT_ITEMS+=("commands(+$((ACTUAL_CMDS - README_CMDS)))")
        DRIFT_DETAILS="${DRIFT_DETAILS}Slash commands: README says ${README_CMDS}, actual ${ACTUAL_CMDS}"$'\n'
    fi
fi

# ============================================
# CHECK 3: Hook count
# ============================================
HOOKS_DIR=""
if [ -d "$PROJECT_ROOT/.claude/hooks" ]; then
    HOOKS_DIR="$PROJECT_ROOT/.claude/hooks"
elif [ -d "$PROJECT_ROOT/hooks" ]; then
    HOOKS_DIR="$PROJECT_ROOT/hooks"
fi

if [ -n "$HOOKS_DIR" ]; then
    # Count .sh files excluding helpers (prefixed with _)
    ACTUAL_HOOKS=$(find "$HOOKS_DIR" -name "*.sh" -maxdepth 1 ! -name "_*" | wc -l | tr -d ' ')
    README_HOOKS=$(readme_count '[0-9]+ .*hooks')

    if [ "$README_HOOKS" != "0" ] && [ "$ACTUAL_HOOKS" != "$README_HOOKS" ] 2>/dev/null; then
        local_diff=$((ACTUAL_HOOKS - README_HOOKS))
        if [ "$local_diff" -ne 0 ] 2>/dev/null; then
            if [ "$local_diff" -gt 0 ]; then
                DRIFT_ITEMS+=("hooks(+${local_diff})")
            else
                DRIFT_ITEMS+=("hooks(${local_diff})")
            fi
            DRIFT_DETAILS="${DRIFT_DETAILS}Hooks: README says ${README_HOOKS}, actual ${ACTUAL_HOOKS}"$'\n'
        fi
    fi
fi

# ============================================
# CHECK 4: npm scripts count (if package.json exists)
# ============================================
if [ -f "$PROJECT_ROOT/package.json" ] && command -v python3 &>/dev/null; then
    # Count user-facing scripts (exclude npm lifecycle hooks: pre*, post*)
    ACTUAL_SCRIPTS=$(python3 -c "
import json
scripts = json.load(open('$PROJECT_ROOT/package.json')).get('scripts',{})
user_facing = [k for k in scripts if not k.startswith('pre') and not k.startswith('post')]
print(len(user_facing))
" 2>/dev/null || echo "0")
    README_SCRIPTS=$(readme_table_rows "Available Scripts")

    if [ "$README_SCRIPTS" != "0" ] && [ "$ACTUAL_SCRIPTS" -gt "$README_SCRIPTS" ] 2>/dev/null; then
        DRIFT_ITEMS+=("scripts(+$((ACTUAL_SCRIPTS - README_SCRIPTS)))")
        DRIFT_DETAILS="${DRIFT_DETAILS}npm scripts: README table has ${README_SCRIPTS} rows, package.json has ${ACTUAL_SCRIPTS}"$'\n'
    fi
fi

# ============================================
# CHECK 5: Skills count (if skills directory exists)
# ============================================
SKILLS_DIR=""
if [ -d "$PROJECT_ROOT/.claude/skills" ]; then
    SKILLS_DIR="$PROJECT_ROOT/.claude/skills"
elif [ -d "$PROJECT_ROOT/skills" ]; then
    SKILLS_DIR="$PROJECT_ROOT/skills"
fi

if [ -n "$SKILLS_DIR" ]; then
    ACTUAL_SKILLS=$(find "$SKILLS_DIR" -name "*.md" -maxdepth 1 | wc -l | tr -d ' ')
    README_SKILLS=$(readme_count '[0-9]+ .*[Ss]kills')

    if [ "$README_SKILLS" != "0" ] && [ "$ACTUAL_SKILLS" -gt "$README_SKILLS" ] 2>/dev/null; then
        DRIFT_ITEMS+=("skills(+$((ACTUAL_SKILLS - README_SKILLS)))")
        DRIFT_DETAILS="${DRIFT_DETAILS}Skills: README says ${README_SKILLS}, actual ${ACTUAL_SKILLS}"$'\n'
    fi
fi

# ============================================
# OUTPUT
# ============================================

if [ "$QUIET" = true ]; then
    if [ ${#DRIFT_ITEMS[@]} -gt 0 ]; then
        echo "${#DRIFT_ITEMS[@]} drift(s): $(IFS=', '; echo "${DRIFT_ITEMS[*]}")"
    fi
elif [ "$JSON" = true ]; then
    if [ ${#DRIFT_ITEMS[@]} -gt 0 ]; then
        echo '{"drift": true, "count": '${#DRIFT_ITEMS[@]}', "items": ['
        printf '%s\n' "${DRIFT_ITEMS[@]}" | sed 's/.*/"&"/' | paste -sd, -
        echo ']}'
    else
        echo '{"drift": false, "count": 0, "items": []}'
    fi
else
    if [ ${#DRIFT_ITEMS[@]} -gt 0 ]; then
        echo "README.md structural drift detected:"
        echo ""
        echo "$DRIFT_DETAILS"
        echo "Update README.md to reflect the current codebase state."
    else
        echo "No README.md structural drift detected."
    fi
fi

if [ ${#DRIFT_ITEMS[@]} -gt 0 ]; then
    exit 1
else
    exit 0
fi
