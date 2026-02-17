#!/bin/bash
# ABOUTME: Verifies the repository is ready to ship with no meta-development references.
# ABOUTME: Run before publishing to ensure clean separation between meta and shipped code.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=============================================="
echo "  Shipping Readiness Verification"
echo "=============================================="
echo ""

ERRORS=0

# Check 1: settings.json should not have hard-coded .meta/ references
# (Environment detection in hooks is OK, but settings.json should not require .meta)
echo "Checking .claude/settings.json..."
if grep -qE '\.meta/' .claude/settings.json 2>/dev/null; then
    echo "  ✗ ERROR: .claude/settings.json contains .meta/ reference"
    echo "    This would fail for users who don't have .meta/"
    grep -nE '\.meta/' .claude/settings.json | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
else
    echo "  ✓ No hard-coded .meta/ references"
fi

# Check 2: Shipped code (functions/, agents/) should not reference .meta/
# Uses git grep to only search tracked files (ignores gitignored .meta/ directories)
# Exclude: test files and comments documenting meta-mode detection
echo ""
echo "Checking shipped code directories..."
META_REFS=$(git grep -nE '\.meta/' -- 'functions/' 'agents/' 2>/dev/null \
    | grep -v '\.test\.\(ts\|js\)' \
    | grep -vE '^\s*//' \
    | grep -vE '(Uses|if) \.meta/' \
    || true)
if [[ -n "$META_REFS" ]]; then
    echo "  ✗ ERROR: Shipped code contains .meta/ references"
    echo "$META_REFS" | head -10 | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
else
    echo "  ✓ No .meta/ references in functions/ or agents/"
fi

# Check 3: Root CLAUDE.md should not have .meta/ paths (except in meta-separation docs)
echo ""
echo "Checking CLAUDE.md..."
# Allow references that are documenting the separation (like "gitignored .meta/")
if grep -E '\.meta/' CLAUDE.md 2>/dev/null | grep -vqE 'gitignore|never ships|meta-development|Meta-development'; then
    echo "  ⚠ WARNING: CLAUDE.md may contain .meta/ references"
    echo "    Review these to ensure they're documentation, not dependencies:"
    grep -nE '\.meta/' CLAUDE.md | grep -vE 'gitignore|never ships|meta-development|Meta-development' | sed 's/^/    /'
else
    echo "  ✓ CLAUDE.md clean (or references are documentation only)"
fi

# Check 4: package.json should not reference .meta/
echo ""
echo "Checking package.json..."
if grep -qE '\.meta/' package.json 2>/dev/null; then
    echo "  ✗ ERROR: package.json contains .meta/ reference"
    grep -nE '\.meta/' package.json | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
else
    echo "  ✓ No .meta/ references in package.json"
fi

# Check 5: Verify .meta/ is in .gitignore
echo ""
echo "Checking .gitignore..."
if grep -qE '^\.meta/?$' .gitignore 2>/dev/null; then
    echo "  ✓ .meta/ is properly gitignored"
else
    echo "  ✗ ERROR: .meta/ is not in .gitignore"
    ERRORS=$((ERRORS + 1))
fi

# Summary
echo ""
echo "=============================================="
if [[ $ERRORS -eq 0 ]]; then
    echo "  ✓ READY TO SHIP"
    echo "=============================================="
    exit 0
else
    echo "  ✗ NOT READY: $ERRORS error(s) found"
    echo "=============================================="
    exit 1
fi
