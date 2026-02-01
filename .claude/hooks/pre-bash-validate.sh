#!/bin/bash
# ABOUTME: Pre-bash validation hook for git and deployment safety.
# ABOUTME: Blocks dangerous git operations and validates test status before deploy.

COMMAND="${CLAUDE_TOOL_INPUT_COMMAND:-}"

# Exit if no command
if [ -z "$COMMAND" ]; then
    exit 0
fi

# ============================================
# GIT COMMIT VALIDATION (No --no-verify)
# ============================================

if echo "$COMMAND" | grep -qE "git\s+commit.*--no-verify"; then
    echo "BLOCKED: git commit --no-verify is not allowed!" >&2
    echo "" >&2
    echo "The --no-verify flag bypasses pre-commit hooks which enforce code quality." >&2
    echo "If pre-commit hooks are failing, fix the underlying issues instead." >&2
    echo "" >&2
    echo "Common fixes:" >&2
    echo "  - Run 'npm run lint:fix' to fix linting errors" >&2
    echo "  - Run 'npm test' to verify tests pass" >&2
    echo "" >&2
    exit 2
fi

# Also catch the short form -n
if echo "$COMMAND" | grep -qE "git\s+commit.*\s-n(\s|$)"; then
    echo "BLOCKED: git commit -n (--no-verify) is not allowed!" >&2
    echo "" >&2
    echo "Pre-commit hooks must run to ensure code quality." >&2
    echo "" >&2
    exit 2
fi

# ============================================
# PRE-COMMIT DOCUMENTATION REMINDER
# ============================================

# Check if this is a git commit (but not the --no-verify checks above which already exited)
if echo "$COMMAND" | grep -qE "^git\s+commit"; then
    # Determine project root and source environment detection
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    source "$SCRIPT_DIR/_meta-mode.sh"

    # Call the consolidated flywheel-doc-check (environment-aware)
    FLYWHEEL_HOOK="$SCRIPT_DIR/flywheel-doc-check.sh"
    if [ -x "$FLYWHEEL_HOOK" ]; then
        "$FLYWHEEL_HOOK" --force
    fi

    # Display pending documentation actions if any exist (environment-aware path)
    PENDING_ACTIONS="$CLAUDE_PENDING_ACTIONS"
    if [ -f "$PENDING_ACTIONS" ]; then
        # Count non-empty, non-header lines (actual action items)
        ACTION_COUNT=$(grep -c "^\- \[" "$PENDING_ACTIONS" 2>/dev/null || echo "0")
        if [ "$ACTION_COUNT" -gt 0 ]; then
            echo "" >&2
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
            echo "PENDING DOCUMENTATION ACTIONS ($ACTION_COUNT items)" >&2
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
            echo "" >&2
            # Show the action items (lines starting with "- [")
            grep "^\- \[" "$PENDING_ACTIONS" >&2
            echo "" >&2
            echo "Review pending-actions.md and update docs before committing." >&2
            echo "Clear the file after addressing actions." >&2
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
            echo "" >&2
        fi
    fi
fi

# ============================================
# FORCE PUSH PROTECTION
# ============================================

if echo "$COMMAND" | grep -qE "git\s+push.*--force"; then
    if echo "$COMMAND" | grep -qE "\s(main|master)(\s|$)"; then
        echo "BLOCKED: Force push to main/master is not allowed!" >&2
        echo "" >&2
        echo "Force pushing to protected branches can cause data loss." >&2
        echo "If you need to revert changes, use 'git revert' instead." >&2
        echo "" >&2
        exit 2
    fi
fi

# ============================================
# DEPLOYMENT VALIDATION
# ============================================

if echo "$COMMAND" | grep -qE "(twilio\s+serverless:deploy|npm\s+run\s+deploy)"; then
    echo "Deployment detected - running pre-deployment validation..."

    # Change to project directory if not already there
    if [ -f "package.json" ]; then
        PROJECT_DIR="."
    elif [ -f "../package.json" ]; then
        PROJECT_DIR=".."
    else
        # Can't find project, skip validation
        exit 0
    fi

    # Check for uncommitted changes
    if [ -d ".git" ]; then
        UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
        if [ "$UNCOMMITTED" -gt 0 ]; then
            echo "WARNING: You have $UNCOMMITTED uncommitted change(s)."
            echo "Consider committing before deployment."
            echo ""
        fi
    fi

    # Run tests
    echo "Running tests..."
    if ! npm test --silent 2>/dev/null; then
        echo "" >&2
        echo "BLOCKED: Tests are failing!" >&2
        echo "" >&2
        echo "All tests must pass before deployment." >&2
        echo "Run 'npm test' to see failures and fix them." >&2
        echo "" >&2
        exit 2
    fi
    echo "✓ Tests passed"

    # Run linting
    echo "Running linter..."
    if ! npm run lint --silent 2>/dev/null; then
        echo "" >&2
        echo "BLOCKED: Linting errors detected!" >&2
        echo "" >&2
        echo "Fix linting errors before deployment." >&2
        echo "Run 'npm run lint:fix' to auto-fix, or 'npm run lint' to see errors." >&2
        echo "" >&2
        exit 2
    fi
    echo "✓ Linting passed"

    # Check for production deployment
    if echo "$COMMAND" | grep -qE "(--environment\s+prod|deploy:prod)"; then
        echo ""
        echo "⚠️  PRODUCTION DEPLOYMENT"
        echo ""
        echo "Pre-deployment checks:"
        echo "  ✓ All tests passing"
        echo "  ✓ Linting passing"
        echo ""
    fi

    echo "Pre-deployment validation complete."
    echo ""
fi

exit 0
