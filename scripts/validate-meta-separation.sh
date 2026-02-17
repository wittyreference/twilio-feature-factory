#!/bin/bash
# ABOUTME: Validates meta-development separation from shipped code.
# ABOUTME: Run after changes to verify hooks work correctly in both modes.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=============================================="
echo "  Meta/Shipped Separation Validation"
echo "=============================================="

ERRORS=0
WARNINGS=0

# ============================================
# 1. ENVIRONMENT DETECTION
# ============================================
echo -e "\n1. Environment Detection:"
source .claude/hooks/_meta-mode.sh
echo "   CLAUDE_META_MODE=$CLAUDE_META_MODE"
echo "   CLAUDE_PLANS_DIR=$CLAUDE_PLANS_DIR"
echo "   CLAUDE_PENDING_ACTIONS=$CLAUDE_PENDING_ACTIONS"

if [[ "$CLAUDE_META_MODE" == "true" ]]; then
    echo "   ✓ Meta mode detected (.meta/ exists)"
else
    echo "   ✓ Shipped mode (no .meta/)"
fi

# ============================================
# 2. SHIPPING READINESS
# ============================================
echo -e "\n2. Shipping Readiness Check:"
if ./scripts/verify-shipping-ready.sh >/dev/null 2>&1; then
    echo "   ✓ Shipping verification passed"
else
    echo "   ✗ Shipping verification FAILED"
    ERRORS=$((ERRORS + 1))
fi

# ============================================
# 3. HOOK PERMISSIONS
# ============================================
echo -e "\n3. Hook Permissions:"
for hook in .claude/hooks/*.sh; do
    if [[ -x "$hook" ]]; then
        echo "   ✓ $(basename "$hook")"
    else
        echo "   ✗ $(basename "$hook") NOT EXECUTABLE"
        ERRORS=$((ERRORS + 1))
    fi
done

# ============================================
# 4. HOOKS SOURCE _META-MODE.SH
# ============================================
echo -e "\n4. Environment-Aware Hooks:"
EXPECTED_HOOKS=("flywheel-doc-check.sh" "archive-plan.sh" "pre-bash-validate.sh" "notify-ready.sh" "post-write.sh")
for hook in "${EXPECTED_HOOKS[@]}"; do
    HOOK_PATH=".claude/hooks/$hook"
    if [[ -f "$HOOK_PATH" ]]; then
        if grep -q "_meta-mode.sh" "$HOOK_PATH"; then
            echo "   ✓ $hook sources _meta-mode.sh"
        elif grep -qE '\.meta' "$HOOK_PATH"; then
            # Hook has inline detection (also valid, just different approach)
            echo "   ✓ $hook has inline .meta detection"
        else
            echo "   ⚠ $hook is NOT environment-aware"
            WARNINGS=$((WARNINGS + 1))
        fi
    fi
done

# ============================================
# 5. NO .META REFERENCES IN SHIPPED CODE
# Uses git grep to only search tracked files (ignores gitignored .meta/ directories)
# Excludes: test files and meta-mode detection code (legitimate routing logic)
# ============================================
echo -e "\n5. Shipped Code Check:"
META_SHIPPED=$(git grep -nE '\.meta/' -- 'functions/' 'agents/' 2>/dev/null \
    | grep -v '\.test\.\(ts\|js\)' \
    | grep -vE '(Uses|if|when) \.meta/' \
    || true)
if [[ -n "$META_SHIPPED" ]]; then
    echo "   ✗ Found .meta/ references in shipped code"
    echo "$META_SHIPPED" | head -5 | sed 's/^/      /'
    ERRORS=$((ERRORS + 1))
else
    echo "   ✓ No .meta/ references in functions/ or agents/"
fi

# ============================================
# 6. GITIGNORE VERIFICATION
# ============================================
echo -e "\n6. Gitignore Verification:"
if git check-ignore .meta/ &>/dev/null; then
    echo "   ✓ .meta/ is gitignored"
else
    echo "   ✗ .meta/ is NOT gitignored"
    ERRORS=$((ERRORS + 1))
fi

if git check-ignore .claude/.session-files &>/dev/null; then
    echo "   ✓ .claude/.session-files is gitignored"
else
    echo "   ✗ .claude/.session-files is NOT gitignored"
    ERRORS=$((ERRORS + 1))
fi

# ============================================
# 7. SETTINGS.JSON CLEAN
# ============================================
echo -e "\n7. Settings.json Check:"
if grep -qE '\.meta/' .claude/settings.json 2>/dev/null; then
    echo "   ✗ settings.json contains hard-coded .meta/ path"
    ERRORS=$((ERRORS + 1))
else
    echo "   ✓ settings.json has no hard-coded .meta/ paths"
fi

# ============================================
# 8. FRESH CLONE SIMULATION (if requested)
# ============================================
if [[ "${1:-}" == "--simulate-shipped" ]]; then
    echo -e "\n8. Fresh Clone Simulation:"
    if [[ -d ".meta" ]]; then
        mv .meta .meta.bak
        source .claude/hooks/_meta-mode.sh
        echo "   CLAUDE_META_MODE=$CLAUDE_META_MODE (should be false)"
        echo "   CLAUDE_PLANS_DIR=$CLAUDE_PLANS_DIR (should be .claude/archive/plans)"
        if [[ "$CLAUDE_META_MODE" == "false" ]]; then
            echo "   ✓ Shipped mode works without .meta/"
        else
            echo "   ✗ Still detecting meta mode without .meta/"
            ERRORS=$((ERRORS + 1))
        fi
        mv .meta.bak .meta
    else
        echo "   ⚠ Skipped (no .meta/ to simulate removal)"
    fi
else
    echo -e "\n8. Fresh Clone Simulation:"
    echo "   ⏭ Skipped (run with --simulate-shipped to test)"
fi

# ============================================
# SUMMARY
# ============================================
echo -e "\n=============================================="
if [[ $ERRORS -eq 0 && $WARNINGS -eq 0 ]]; then
    echo "  ✓ ALL CHECKS PASSED"
elif [[ $ERRORS -eq 0 ]]; then
    echo "  ✓ PASSED with $WARNINGS warning(s)"
else
    echo "  ✗ FAILED: $ERRORS error(s), $WARNINGS warning(s)"
fi
echo "=============================================="

exit $ERRORS
