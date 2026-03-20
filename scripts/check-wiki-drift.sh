#!/bin/bash
# ABOUTME: Detects drift between GitHub wiki page stats and actual codebase state.
# ABOUTME: Checks commit counts, function counts, test counts, skill counts, etc.

# Usage:
#   ./scripts/check-wiki-drift.sh          # Full report to stdout
#   ./scripts/check-wiki-drift.sh --quiet   # One-line summary for hooks
#   ./scripts/check-wiki-drift.sh --json    # Machine-readable JSON output

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

# ============================================
# WIKI LOCATION
# ============================================

WIKI_DIR="/tmp/twilio-feature-factory.wiki"
WIKI_REPO="https://github.com/wittyreference/twilio-feature-factory.wiki.git"

# Clone or pull the wiki
if [ -d "$WIKI_DIR/.git" ]; then
    git -C "$WIKI_DIR" pull --quiet 2>/dev/null || true
else
    git clone --quiet "$WIKI_REPO" "$WIKI_DIR" 2>/dev/null || {
        if [ "$QUIET" = true ]; then
            echo "wiki: clone failed"
        else
            echo "Could not clone wiki repo from $WIKI_REPO" >&2
        fi
        exit 1
    }
fi

DRIFT_ITEMS=()
DRIFT_DETAILS=""

# ============================================
# HELPERS
# ============================================

# Extract first number matching a pattern from a wiki page
# Args: $1=wiki file (relative to WIKI_DIR), $2=grep pattern (ERE)
wiki_count() {
    local file="$WIKI_DIR/$1"
    local pattern="$2"
    if [ ! -f "$file" ]; then
        echo "0"
        return
    fi
    grep -oEi "$pattern" "$file" 2>/dev/null | head -1 | grep -oE '[0-9]+' | head -1 || echo "0"
}

# Extract number from a markdown table row: "| Label | NNN |" or "| Label | NNN ... |"
# Args: $1=wiki file, $2=label text to match in first column
wiki_table_value() {
    local file="$WIKI_DIR/$1"
    local label="$2"
    if [ ! -f "$file" ]; then
        echo "0"
        return
    fi
    grep -i "$label" "$file" 2>/dev/null | grep -oE '\| *[0-9]+' | head -1 | grep -oE '[0-9]+' || echo "0"
}

# Add a drift item
# Args: $1=name, $2=wiki value, $3=actual value
add_drift() {
    local name="$1"
    local wiki_val="$2"
    local actual_val="$3"
    local diff=$((actual_val - wiki_val))
    if [ "$diff" -gt 0 ]; then
        DRIFT_ITEMS+=("${name}(+${diff})")
    else
        DRIFT_ITEMS+=("${name}(${diff})")
    fi
    DRIFT_DETAILS="${DRIFT_DETAILS}${name}: wiki says ${wiki_val}, actual ${actual_val}"$'\n'
}

# ============================================
# CHECK 1: Commit count (Home.md table)
# ============================================
ACTUAL_COMMITS=$(git -C "$PROJECT_ROOT" rev-list --count HEAD 2>/dev/null || echo "0")
WIKI_COMMITS=$(wiki_table_value "Home.md" "Commits")
if [ "$WIKI_COMMITS" != "0" ] && [ "$ACTUAL_COMMITS" != "$WIKI_COMMITS" ]; then
    DIFF=$((ACTUAL_COMMITS - WIKI_COMMITS))
    # Only flag if drift is significant (>5 commits)
    if [ "${DIFF#-}" -gt 5 ]; then
        add_drift "commits" "$WIKI_COMMITS" "$ACTUAL_COMMITS"
    fi
fi

# ============================================
# CHECK 2: Function count
# ============================================
ACTUAL_FUNCS=$(find "$PROJECT_ROOT/functions" -name "*.js" -not -name "*.test.js" -not -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')
WIKI_FUNCS=$(wiki_count "Home.md" '[0-9]+ production')
if [ "$WIKI_FUNCS" = "0" ]; then
    # Try Architecture.md
    WIKI_FUNCS=$(wiki_count "Architecture.md" '[0-9]+ (Functions|handlers)')
fi
if [ "$WIKI_FUNCS" != "0" ] && [ "$ACTUAL_FUNCS" != "$WIKI_FUNCS" ]; then
    add_drift "functions" "$WIKI_FUNCS" "$ACTUAL_FUNCS"
fi

# ============================================
# CHECK 3: Domain count
# ============================================
ACTUAL_DOMAINS=$(find "$PROJECT_ROOT/functions" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
WIKI_DOMAINS=$(wiki_count "Home.md" '[0-9]+ (Twilio )?domains')
if [ "$WIKI_DOMAINS" = "0" ]; then
    WIKI_DOMAINS=$(wiki_count "Architecture.md" '[0-9]+ domains')
fi
if [ "$WIKI_DOMAINS" != "0" ] && [ "$ACTUAL_DOMAINS" != "$WIKI_DOMAINS" ]; then
    add_drift "domains" "$WIKI_DOMAINS" "$ACTUAL_DOMAINS"
fi

# ============================================
# CHECK 4: Test file count
# ============================================
ACTUAL_TESTS=$(find "$PROJECT_ROOT" -name "*.test.*" -not -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')
WIKI_TESTS=$(wiki_table_value "Home.md" "Test files")
if [ "$WIKI_TESTS" = "0" ]; then
    WIKI_TESTS=$(wiki_count "Testing.md" '[0-9]+ .*test files')
fi
if [ "$WIKI_TESTS" != "0" ] && [ "$ACTUAL_TESTS" != "$WIKI_TESTS" ]; then
    DIFF=$((ACTUAL_TESTS - WIKI_TESTS))
    if [ "${DIFF#-}" -gt 5 ]; then
        add_drift "test-files" "$WIKI_TESTS" "$ACTUAL_TESTS"
    fi
fi

# ============================================
# CHECK 5: CLAUDE.md file count
# ============================================
ACTUAL_CLAUDE=$(find "$PROJECT_ROOT" -name "CLAUDE.md" -not -path "*/node_modules/*" -not -path "*/.meta/*" 2>/dev/null | wc -l | tr -d ' ')
WIKI_CLAUDE=$(wiki_count "Context-Engineering.md" '[0-9]+ (hierarchical|CLAUDE\.md)')
if [ "$WIKI_CLAUDE" != "0" ] && [ "$ACTUAL_CLAUDE" != "$WIKI_CLAUDE" ]; then
    add_drift "claude-md" "$WIKI_CLAUDE" "$ACTUAL_CLAUDE"
fi

# ============================================
# CHECK 6: Skills count
# ============================================
ACTUAL_SKILLS=$(find "$PROJECT_ROOT/.claude/skills" -name "*.md" -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
WIKI_SKILLS=$(wiki_count "Context-Engineering.md" '[0-9]+ (skills|specialist)')
if [ "$WIKI_SKILLS" = "0" ]; then
    WIKI_SKILLS=$(wiki_count "FAQ.md" '[0-9]+ specialist')
fi
if [ "$WIKI_SKILLS" != "0" ] && [ "$ACTUAL_SKILLS" != "$WIKI_SKILLS" ]; then
    add_drift "skills" "$WIKI_SKILLS" "$ACTUAL_SKILLS"
fi

# ============================================
# CHECK 7: Rules count
# ============================================
ACTUAL_RULES=$(find "$PROJECT_ROOT/.claude/rules" -name "*.md" -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
WIKI_RULES=$(wiki_count "Context-Engineering.md" '[0-9]+ [Rr]ules')
if [ "$WIKI_RULES" != "0" ] && [ "$ACTUAL_RULES" != "$WIKI_RULES" ]; then
    add_drift "rules" "$WIKI_RULES" "$ACTUAL_RULES"
fi

# ============================================
# CHECK 8: ADR count
# ============================================
ACTUAL_ADRS=$(grep -c "^## Decision" "$PROJECT_ROOT/DESIGN_DECISIONS.md" 2>/dev/null || echo "0")
WIKI_ADRS=$(wiki_table_value "Home.md" "Design decisions")
if [ "$WIKI_ADRS" = "0" ]; then
    WIKI_ADRS=$(wiki_count "Design-Decisions.md" '[0-9]+ (ADR|Architecture Decision)')
fi
if [ "$WIKI_ADRS" != "0" ] && [ "$ACTUAL_ADRS" != "$WIKI_ADRS" ]; then
    add_drift "adrs" "$WIKI_ADRS" "$ACTUAL_ADRS"
fi

# ============================================
# CHECK 9: Hook count
# ============================================
ACTUAL_HOOKS=$(find "$PROJECT_ROOT/.claude/hooks" -name "*.sh" -maxdepth 1 ! -name "_*" 2>/dev/null | wc -l | tr -d ' ')
WIKI_HOOKS=$(wiki_count "Architecture.md" '[0-9]+ [Hh]ooks')
if [ "$WIKI_HOOKS" != "0" ] && [ "$ACTUAL_HOOKS" != "$WIKI_HOOKS" ]; then
    add_drift "hooks" "$WIKI_HOOKS" "$ACTUAL_HOOKS"
fi

# ============================================
# CHECK 10: Domain handler breakdown (Architecture.md table)
# ============================================
for domain in voice conversation-relay callbacks pay video helpers messaging-services proxy sync messaging verify taskrouter phone-numbers; do
    ACTUAL=$(find "$PROJECT_ROOT/functions/$domain" -name "*.js" -not -name "*.test.js" 2>/dev/null | wc -l | tr -d ' ')
    WIKI_VAL=$(grep -i "| $domain/" "$WIKI_DIR/Architecture.md" 2>/dev/null | grep -oE '\| *[0-9]+' | head -1 | grep -oE '[0-9]+' || echo "0")
    if [ "$WIKI_VAL" != "0" ] && [ "$ACTUAL" != "$WIKI_VAL" ]; then
        add_drift "domain:$domain" "$WIKI_VAL" "$ACTUAL"
    fi
done

# ============================================
# OUTPUT
# ============================================

if [ "$QUIET" = true ]; then
    if [ ${#DRIFT_ITEMS[@]} -gt 0 ]; then
        echo "${#DRIFT_ITEMS[@]} wiki drift(s): $(IFS=', '; echo "${DRIFT_ITEMS[*]}")"
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
        echo "Wiki drift detected:"
        echo ""
        echo "$DRIFT_DETAILS"
        echo "Run ./scripts/sync-wiki.sh --fix to update wiki pages."
    else
        echo "No wiki drift detected."
    fi
fi

if [ ${#DRIFT_ITEMS[@]} -gt 0 ]; then
    exit 1
else
    exit 0
fi
