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

# Check 1: settings.json should not have hard-coded .claude-dev references
# (Environment detection in hooks is OK, but settings.json should not require .claude-dev)
echo "Checking .claude/settings.json..."
if grep -q '\.claude-dev' .claude/settings.json 2>/dev/null; then
    echo "  ✗ ERROR: .claude/settings.json contains .claude-dev reference"
    echo "    This would fail for users who don't have .claude-dev/"
    grep -n '\.claude-dev' .claude/settings.json | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
else
    echo "  ✓ No hard-coded .claude-dev references"
fi

# Check 2: Shipped code (functions/, agents/) should not reference .claude-dev
echo ""
echo "Checking shipped code directories..."
if grep -rq '\.claude-dev' functions/ agents/ 2>/dev/null; then
    echo "  ✗ ERROR: Shipped code contains .claude-dev references"
    grep -rn '\.claude-dev' functions/ agents/ 2>/dev/null | head -10 | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
else
    echo "  ✓ No .claude-dev references in functions/ or agents/"
fi

# Check 3: Root CLAUDE.md should not have .claude-dev paths (except in meta-separation docs)
echo ""
echo "Checking CLAUDE.md..."
# Allow references that are documenting the separation (like "gitignored .claude-dev")
if grep '\.claude-dev' CLAUDE.md 2>/dev/null | grep -vq 'gitignore\|never ships\|meta-development'; then
    echo "  ⚠ WARNING: CLAUDE.md may contain .claude-dev references"
    echo "    Review these to ensure they're documentation, not dependencies:"
    grep -n '\.claude-dev' CLAUDE.md | grep -v 'gitignore\|never ships\|meta-development' | sed 's/^/    /'
else
    echo "  ✓ CLAUDE.md clean (or references are documentation only)"
fi

# Check 4: package.json should not reference .claude-dev
echo ""
echo "Checking package.json..."
if grep -q '\.claude-dev' package.json 2>/dev/null; then
    echo "  ✗ ERROR: package.json contains .claude-dev reference"
    grep -n '\.claude-dev' package.json | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
else
    echo "  ✓ No .claude-dev references in package.json"
fi

# Check 5: Verify .claude-dev is in .gitignore
echo ""
echo "Checking .gitignore..."
if grep -q '^\.claude-dev/' .gitignore 2>/dev/null || grep -q '^\.claude-dev$' .gitignore 2>/dev/null; then
    echo "  ✓ .claude-dev/ is properly gitignored"
else
    echo "  ✗ ERROR: .claude-dev/ is not in .gitignore"
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
