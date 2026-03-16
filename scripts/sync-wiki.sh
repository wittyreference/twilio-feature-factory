#!/bin/bash
# ABOUTME: Clone/pull wiki, detect drift, optionally fix and push.
# ABOUTME: Wrapper around check-wiki-drift.sh with auto-fix capability.

# Usage:
#   ./scripts/sync-wiki.sh          # Clone/pull wiki, report drift
#   ./scripts/sync-wiki.sh --fix    # Fix drifted numbers and show diff (no push)
#   ./scripts/sync-wiki.sh --push   # Fix, commit, and push

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

FIX=false
PUSH=false
for arg in "$@"; do
    case "$arg" in
        --fix) FIX=true ;;
        --push) FIX=true; PUSH=true ;;
    esac
done

WIKI_DIR="/tmp/twilio-feature-factory.wiki"
WIKI_REPO="https://github.com/wittyreference/twilio-feature-factory.wiki.git"

# ============================================
# CLONE / PULL
# ============================================

echo "Syncing wiki..."
if [ -d "$WIKI_DIR/.git" ]; then
    git -C "$WIKI_DIR" pull --quiet 2>/dev/null
    echo "  Pulled latest from wiki repo"
else
    git clone --quiet "$WIKI_REPO" "$WIKI_DIR" 2>/dev/null
    echo "  Cloned wiki repo to $WIKI_DIR"
fi

# ============================================
# DETECT DRIFT
# ============================================

echo ""
DRIFT_OUTPUT=$("$SCRIPT_DIR/check-wiki-drift.sh" 2>&1 || true)
DRIFT_EXIT=$("$SCRIPT_DIR/check-wiki-drift.sh" --json 2>&1 || true)

echo "$DRIFT_OUTPUT"

# Check if any drift was found
if echo "$DRIFT_EXIT" | grep -q '"drift": false'; then
    echo ""
    echo "Wiki is up to date."
    exit 0
fi

if [ "$FIX" = false ]; then
    echo ""
    echo "Run with --fix to update wiki pages, or --push to fix and push."
    exit 1
fi

# ============================================
# FIX DRIFTED VALUES
# ============================================

echo ""
echo "Fixing drifted values..."

# Collect actual values
ACTUAL_COMMITS=$(git -C "$PROJECT_ROOT" rev-list --count HEAD)
ACTUAL_FUNCS=$(find "$PROJECT_ROOT/functions" -name "*.js" -not -name "*.test.js" -not -path "*/node_modules/*" | wc -l | tr -d ' ')
ACTUAL_DOMAINS=$(find "$PROJECT_ROOT/functions" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
ACTUAL_TESTS=$(find "$PROJECT_ROOT" -name "*.test.*" -not -path "*/node_modules/*" | wc -l | tr -d ' ')
ACTUAL_CLAUDE=$(find "$PROJECT_ROOT" -name "CLAUDE.md" -not -path "*/node_modules/*" -not -path "*/.meta/*" | wc -l | tr -d ' ')
ACTUAL_SKILLS=$(find "$PROJECT_ROOT/.claude/skills" -name "*.md" -maxdepth 1 | wc -l | tr -d ' ')
ACTUAL_RULES=$(find "$PROJECT_ROOT/.claude/rules" -name "*.md" -maxdepth 1 | wc -l | tr -d ' ')
ACTUAL_ADRS=$(grep -c "^## Decision" "$PROJECT_ROOT/DESIGN_DECISIONS.md" 2>/dev/null || echo "0")
ACTUAL_HOOKS=$(find "$PROJECT_ROOT/.claude/hooks" -name "*.sh" -maxdepth 1 ! -name "_*" | wc -l | tr -d ' ')

# Fix commit count in Home.md table (format: "| Commits | NNN |")
sed -i '' "s/| Commits | [0-9]*/| Commits | ${ACTUAL_COMMITS}/" "$WIKI_DIR/Home.md" 2>/dev/null || true

# Fix "NNN production serverless functions" and "NNN production functions"
for wiki_file in Home.md Architecture.md FAQ.md; do
    if [ -f "$WIKI_DIR/$wiki_file" ]; then
        sed -i '' "s/[0-9]* production serverless functions/${ACTUAL_FUNCS} production serverless functions/g" "$WIKI_DIR/$wiki_file" 2>/dev/null || true
        sed -i '' "s/[0-9]* production functions/${ACTUAL_FUNCS} production functions/g" "$WIKI_DIR/$wiki_file" 2>/dev/null || true
    fi
done

# Fix "NNN Twilio domains" / "NNN domains" — only where preceded by a digit count
for wiki_file in Home.md Architecture.md; do
    if [ -f "$WIKI_DIR/$wiki_file" ]; then
        sed -i '' "s/[0-9][0-9]* Twilio domains/${ACTUAL_DOMAINS} Twilio domains/g" "$WIKI_DIR/$wiki_file" 2>/dev/null || true
        # Only match "NN domains" preceded by period or space (avoids "13 domains" inside "13 Twilio domains")
        sed -i '' "s/\. [0-9][0-9]* domains/. ${ACTUAL_DOMAINS} domains/g" "$WIKI_DIR/$wiki_file" 2>/dev/null || true
    fi
done

# Fix test file count — table rows only, not mid-sentence "test files"
for wiki_file in Home.md Testing.md FAQ.md; do
    if [ -f "$WIKI_DIR/$wiki_file" ]; then
        sed -i '' "s/| Test files | [0-9]*/| Test files | ${ACTUAL_TESTS}/" "$WIKI_DIR/$wiki_file" 2>/dev/null || true
    fi
done
# Fix "NNN test files." at start of sentence (preceded by space or newline)
sed -i '' "s/^[0-9]* test files/${ACTUAL_TESTS} test files/" "$WIKI_DIR/Testing.md" 2>/dev/null || true
sed -i '' "s/^[0-9]* test files/${ACTUAL_TESTS} test files/" "$WIKI_DIR/FAQ.md" 2>/dev/null || true

# Fix CLAUDE.md count — only "NN hierarchical" pattern
sed -i '' "s/[0-9][0-9]* hierarchical/${ACTUAL_CLAUDE} hierarchical/g" "$WIKI_DIR/Context-Engineering.md" 2>/dev/null || true

# Fix skills count — only "NN skills" preceded by space (avoids mid-word matches)
for wiki_file in Context-Engineering.md FAQ.md; do
    if [ -f "$WIKI_DIR/$wiki_file" ]; then
        sed -i '' "s/ [0-9][0-9]* skills/ ${ACTUAL_SKILLS} skills/g" "$WIKI_DIR/$wiki_file" 2>/dev/null || true
        sed -i '' "s/ [0-9][0-9]* specialist/ ${ACTUAL_SKILLS} specialist/g" "$WIKI_DIR/$wiki_file" 2>/dev/null || true
    fi
done

# Fix rules count — only the "## N Rules" header line, not rule counts in table cells
sed -i '' "s/^## [0-9][0-9]* Rules/## ${ACTUAL_RULES} Rules/" "$WIKI_DIR/Context-Engineering.md" 2>/dev/null || true
# Fix "N rules" only in the section intro line (after "Declarative" or at line start)
sed -i '' "s/^[0-9][0-9]* rules/${ACTUAL_RULES} rules/" "$WIKI_DIR/Context-Engineering.md" 2>/dev/null || true

# Fix ADR count — table row and "NN Architecture Decision" pattern
sed -i '' "s/| Design decisions.*| [0-9]*/| Design decisions (ADR format) | ${ACTUAL_ADRS}/" "$WIKI_DIR/Home.md" 2>/dev/null || true
sed -i '' "s/[0-9][0-9]* Architecture Decision/${ACTUAL_ADRS} Architecture Decision/g" "$WIKI_DIR/Design-Decisions.md" 2>/dev/null || true
sed -i '' "s/maintains [0-9][0-9]* Architecture/maintains ${ACTUAL_ADRS} Architecture/" "$WIKI_DIR/Design-Decisions.md" 2>/dev/null || true

# Fix hook count — only "NN Hooks" with capital H (header/diagram pattern)
sed -i '' "s/[0-9][0-9]* Hooks/${ACTUAL_HOOKS} Hooks/g" "$WIKI_DIR/Architecture.md" 2>/dev/null || true

# Fix function/domain header line in Home.md: "78 Production Functions Across 13 Domains"
sed -i '' "s/[0-9]* Production Functions Across [0-9]* Domains/${ACTUAL_FUNCS} Production Functions Across ${ACTUAL_DOMAINS} Domains/g" "$WIKI_DIR/Home.md" 2>/dev/null || true

# Fix Architecture.md: "78 Functions Across 13 Domains"
sed -i '' "s/[0-9]* Functions Across [0-9]* Domains/${ACTUAL_FUNCS} Functions Across ${ACTUAL_DOMAINS} Domains/g" "$WIKI_DIR/Architecture.md" 2>/dev/null || true

# Fix domain handler counts in Architecture.md table
for domain in voice conversation-relay callbacks pay video helpers messaging-services proxy sync messaging verify taskrouter phone-numbers; do
    ACTUAL=$(find "$PROJECT_ROOT/functions/$domain" -name "*.js" -not -name "*.test.js" 2>/dev/null | wc -l | tr -d ' ')
    # Replace "| domain/ | NN |" pattern
    sed -i '' "s/| ${domain}\/ | [0-9]*/| ${domain}\/ | ${ACTUAL}/" "$WIKI_DIR/Architecture.md" 2>/dev/null || true
done

# Show diff
echo ""
cd "$WIKI_DIR"
if git diff --stat | grep -q .; then
    echo "Changes:"
    git diff --stat
    echo ""
    git diff --no-color
else
    echo "No changes needed (drift may be in patterns not covered by auto-fix)."
    exit 0
fi

if [ "$PUSH" = false ]; then
    echo ""
    echo "Review the changes above. Run with --push to commit and push."
    exit 0
fi

# ============================================
# COMMIT AND PUSH
# ============================================

echo ""
echo "Committing and pushing..."
git add -A
git commit -m "docs: Sync wiki stats with codebase (auto-fix)" 2>/dev/null
git push 2>/dev/null
echo "Wiki updated and pushed."
