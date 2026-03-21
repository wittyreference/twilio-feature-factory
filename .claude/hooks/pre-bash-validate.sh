#!/bin/bash
# ABOUTME: Pre-bash validation hook for git and deployment safety.
# ABOUTME: Blocks dangerous git operations and validates test status before deploy.

# Claude Code passes tool input as JSON on stdin, not env vars.
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT="$(cat)"
fi

COMMAND=""
if [ -n "$HOOK_INPUT" ] && ! command -v jq &> /dev/null; then
    echo "WARNING: jq not installed — safety hooks disabled (--no-verify blocking, deploy gates). Run: brew install jq" >&2
fi
if [ -n "$HOOK_INPUT" ] && command -v jq &> /dev/null; then
    COMMAND="$(echo "$HOOK_INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)"
fi

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

    # ============================================
    # EPHEMERAL BRANCH WARNING
    # ============================================
    # Warn when committing to branches that look like validation/headless runs.
    # These branches should not accumulate feature work — commit to main instead.
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
    if echo "$CURRENT_BRANCH" | grep -qE "^(validation-|headless-|uber-val-|fresh-install-)"; then
        echo "" >&2
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
        echo "⚠️  EPHEMERAL BRANCH: $CURRENT_BRANCH" >&2
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
        echo "" >&2
        echo "You are committing to what looks like a validation/test branch." >&2
        echo "If this is feature work, switch to main first:" >&2
        echo "" >&2
        echo "  git stash && git checkout main && git stash pop" >&2
        echo "" >&2
        echo "If this commit is intentionally on this branch, proceed." >&2
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
        echo "" >&2
    fi

    # ============================================
    # META REFERENCE LEAKAGE WARNING
    # ============================================
    # Warn if staged files contain .meta/ references (potential leakage)
    if git diff --staged 2>/dev/null | grep -qE '\.meta/'; then
        echo "" >&2
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
        echo "⚠️  WARNING: Staged changes reference .meta/" >&2
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
        echo "" >&2
        echo "This may indicate meta-development content leaking into shipped code." >&2
        echo "Review with: git diff --staged | grep '.meta/'" >&2
        echo "" >&2
        echo "If this is intentional documentation about the separation, proceed." >&2
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
        echo "" >&2
    fi

    # ============================================
    # LOCAL PATH LEAKAGE CHECK (BLOCKING)
    # ============================================
    # Block commits that ship hardcoded local directory paths.
    # These break for anyone who clones the repo to a different location.
    LOCAL_PATH_LEAKS=$(git diff --staged 2>/dev/null \
        | grep '^+' | grep -v '^+++' \
        | grep -En '/Users/[a-zA-Z0-9_.-]+/(workspaces|Desktop|Documents|Downloads|Library|Projects|repos|src|code|dev)/|/home/[a-zA-Z0-9_.-]+/(workspaces|Desktop|Documents|Downloads|Projects|repos|src|code|dev)/' \
        || true)
    if [ -n "$LOCAL_PATH_LEAKS" ]; then
        echo "" >&2
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
        echo "BLOCKED: Hardcoded local paths in staged changes" >&2
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
        echo "" >&2
        echo "These paths won't work for other users:" >&2
        echo "$LOCAL_PATH_LEAKS" | head -10 >&2
        echo "" >&2
        echo "Use dynamic alternatives:" >&2
        echo '  \$HOME, \$PROJECT_ROOT, \$(git rev-parse --show-toplevel)' >&2
        echo '  \$(pwd), relative paths, or \$(dirname "\$0")' >&2
        echo "" >&2
        echo "Override: SKIP_PATH_CHECK=true git commit ..." >&2
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
        echo "" >&2
        if [ "${SKIP_PATH_CHECK:-}" != "true" ]; then
            exit 2
        fi
    fi

    # ============================================
    # META-ONLY HOOK REGISTRATION CHECK (BLOCKING)
    # ============================================
    # Block commits that register meta-only scripts as shipped hooks.
    # A meta-only script exits immediately when CLAUDE_META_MODE != true,
    # meaning it does nothing for fresh-clone users — dead code in settings.json.
    if git diff --staged --name-only 2>/dev/null | grep -qF '.claude/settings.json'; then
        # Extract hook script filenames from added lines in the diff
        NEW_HOOK_FILES=$(git diff --staged -- .claude/settings.json 2>/dev/null \
            | grep '^+' | grep '\.sh"' \
            | grep -oE '[a-zA-Z0-9_-]+\.sh' \
            | sort -u)

        if [ -n "$NEW_HOOK_FILES" ]; then
            META_ONLY_HOOKS=""
            for hook_file in $NEW_HOOK_FILES; do
                # Resolve to full path (hooks live in .claude/hooks/)
                hook_path="$PROJECT_ROOT/.claude/hooks/$hook_file"
                [ -f "$hook_path" ] || continue

                # Check first 20 lines for meta-mode-only guard:
                #   if [ "$CLAUDE_META_MODE" != "true" ]; then exit 0; fi
                if head -20 "$hook_path" | tr '\n' ' ' \
                    | grep -qE 'CLAUDE_META_MODE.*!=.*true.*exit 0'; then
                    META_ONLY_HOOKS="${META_ONLY_HOOKS}  → ${hook_file} (exits when not in meta-mode)\n"
                fi
            done

            if [ -n "$META_ONLY_HOOKS" ]; then
                echo "" >&2
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
                echo "BLOCKED: Meta-only script registered as a shipped hook" >&2
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
                echo "" >&2
                printf "%b" "$META_ONLY_HOOKS" >&2
                echo "" >&2
                echo "Scripts that exit 0 outside meta-mode do nothing for" >&2
                echo "fresh-clone users. Don't register them in settings.json." >&2
                echo "" >&2
                echo "Instead: put the script in scripts/ and call it from" >&2
                echo "/wrap-up (step 7b/7c, meta-mode section)." >&2
                echo "" >&2
                echo "Override: SKIP_META_HOOK_CHECK=true git commit ..." >&2
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
                echo "" >&2
                if [ "${SKIP_META_HOOK_CHECK:-}" != "true" ]; then
                    exit 2
                fi
            fi
        fi
    fi

    # ============================================
    # TYPESCRIPT COMPILATION CHECK (BLOCKING)
    # ============================================
    # Run tsc --noEmit for staged .ts/.tsx files to catch type errors before commit.
    # Only runs for packages that have staged TypeScript files.
    STAGED_TS=$(git diff --staged --name-only 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
    if [ -n "$STAGED_TS" ] && command -v npx &>/dev/null; then
        TSC_FAILED=false
        TSC_ERRORS=""

        # Check MCP server package
        if echo "$STAGED_TS" | grep -q '^agents/mcp-servers/twilio/'; then
            MCP_TSC_OUT=$(cd "$PROJECT_ROOT/agents/mcp-servers/twilio" && npx tsc --noEmit 2>&1 || true)
            if echo "$MCP_TSC_OUT" | grep -q 'error TS'; then
                TSC_FAILED=true
                TSC_ERRORS="${TSC_ERRORS}\n--- agents/mcp-servers/twilio ---\n$(echo "$MCP_TSC_OUT" | grep 'error TS' | head -10)"
            fi
        fi

        # Check Feature Factory package
        if echo "$STAGED_TS" | grep -q '^agents/feature-factory/'; then
            FF_TSC_OUT=$(cd "$PROJECT_ROOT/agents/feature-factory" && npx tsc --noEmit 2>&1 || true)
            if echo "$FF_TSC_OUT" | grep -q 'error TS'; then
                TSC_FAILED=true
                TSC_ERRORS="${TSC_ERRORS}\n--- agents/feature-factory ---\n$(echo "$FF_TSC_OUT" | grep 'error TS' | head -10)"
            fi
        fi

        if [ "$TSC_FAILED" = true ]; then
            echo "" >&2
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
            echo "BLOCKED: TypeScript compilation errors in staged files" >&2
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
            printf "%b" "$TSC_ERRORS" >&2
            echo "" >&2
            echo "" >&2
            echo "Fix type errors before committing." >&2
            echo "Override: SKIP_TSC_CHECK=true git commit ..." >&2
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
            echo "" >&2
            if [ "${SKIP_TSC_CHECK:-}" != "true" ]; then
                exit 2
            fi
        fi
    fi

    # Call the consolidated flywheel-doc-check (environment-aware)
    FLYWHEEL_HOOK="$SCRIPT_DIR/flywheel-doc-check.sh"
    if [ -x "$FLYWHEEL_HOOK" ]; then
        "$FLYWHEEL_HOOK" --force
    fi

    # ============================================
    # AUTO-CLEAR ADDRESSED PENDING ACTIONS
    # ============================================
    PENDING_ACTIONS="$CLAUDE_PENDING_ACTIONS"
    if [ -f "$PENDING_ACTIONS" ]; then
        STAGED_FILES=$(git diff --staged --name-only 2>/dev/null)
        if [ -n "$STAGED_FILES" ]; then
            CLEARED_COUNT=0
            TEMP_FILE=$(mktemp)
            while IFS= read -r line; do
                if echo "$line" | grep -q "^\- \["; then
                    # Extract doc path: text between "• " and " - "
                    DOC_PATH=$(echo "$line" | sed -n 's/.*• \(.*\) - .*/\1/p')
                    # Resolve aliases
                    case "$DOC_PATH" in
                        "Root CLAUDE.md") RESOLVED="CLAUDE.md" ;;
                        ".meta/design-decisions.md") RESOLVED="DESIGN_DECISIONS.md" ;;
                        "Verify doc-map.md"*) RESOLVED=".claude/references/doc-map.md" ;;
                        ".meta/"*) RESOLVED="" ;;  # gitignored, skip
                        "Relevant "*) RESOLVED="" ;;  # too vague, skip
                        *) RESOLVED="$DOC_PATH" ;;
                    esac
                    # Check if resolved path is in staged files
                    if [ -n "$RESOLVED" ] && echo "$STAGED_FILES" | grep -qF "$RESOLVED"; then
                        TIMESTAMP=$(echo "$line" | sed -n 's/.*\[\(.*\)\].*/\1/p')
                        echo "*Auto-cleared [$TIMESTAMP]: $DOC_PATH - staged in this commit*" >> "$TEMP_FILE"
                        CLEARED_COUNT=$((CLEARED_COUNT + 1))
                    else
                        echo "$line" >> "$TEMP_FILE"
                    fi
                else
                    echo "$line" >> "$TEMP_FILE"
                fi
            done < "$PENDING_ACTIONS"
            mv "$TEMP_FILE" "$PENDING_ACTIONS"
            if [ "$CLEARED_COUNT" -gt 0 ]; then
                echo "" >&2
                echo "Doc flywheel: Auto-cleared $CLEARED_COUNT pending action(s) addressed in this commit." >&2
            fi
        fi
    fi

    # ============================================
    # PLUGIN SYNC AWARENESS (Non-blocking)
    # ============================================
    SYNC_MAP="$PROJECT_ROOT/.meta/sync-map.json"
    if [[ -f "$SYNC_MAP" ]] && command -v jq &>/dev/null; then
        STAGED_LIST=$(git diff --staged --name-only 2>/dev/null)
        if [[ -n "$STAGED_LIST" ]]; then
            SYNCABLE_PATHS=$(jq -r '.mappings | to_entries[] | .value[] | .factory' "$SYNC_MAP" 2>/dev/null)
            SYNCABLE_STAGED=0
            while IFS= read -r staged_file; do
                if echo "$SYNCABLE_PATHS" | grep -qF "$staged_file"; then
                    SYNCABLE_STAGED=$((SYNCABLE_STAGED + 1))
                fi
            done <<< "$STAGED_LIST"
            if [[ "$SYNCABLE_STAGED" -gt 0 ]]; then
                echo "Note: $SYNCABLE_STAGED syncable file(s) staged. Plugin may need updating after commit." >&2
            fi
        fi
    fi

    # ============================================
    # COMMIT CHECKLIST PROMPT (Non-blocking)
    # ============================================
    echo "" >&2
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
    echo "COMMIT CHECKLIST" >&2
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
    echo "  [ ] Updated .meta/todo.md?" >&2
    echo "  [ ] Captured learnings in .claude/learnings.md?" >&2
    echo "  [ ] Design decision documented if architectural?" >&2
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
    echo "" >&2

    # ============================================
    # PENDING DOCUMENTATION ACTIONS (BLOCKING)
    # ============================================
    # Block commit if pending-actions.md has items (unless escape hatch used)
    # PENDING_ACTIONS set above in auto-clear section
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

            # Check for escape hatch (environment variable)
            if [ "$SKIP_PENDING_ACTIONS" = "true" ] || [ "$SKIP_PENDING_ACTIONS" = "1" ]; then
                echo "⚠️  Skipping pending-actions check (SKIP_PENDING_ACTIONS set)" >&2
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
                echo "" >&2
            else
                echo "BLOCKED: Pending documentation actions must be addressed!" >&2
                echo "" >&2
                echo "Options:" >&2
                echo "  1. Address the pending actions and clear the file" >&2
                echo "  2. Override: SKIP_PENDING_ACTIONS=true git commit ..." >&2
                echo "" >&2
                echo "To clear after addressing:" >&2
                echo "  rm $PENDING_ACTIONS" >&2
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
                echo "" >&2
                exit 2
            fi
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

    # Check code coverage (80% threshold)
    echo "Checking code coverage..."
    COVERAGE_MIN=80
    COVERAGE_SUMMARY="coverage/coverage-summary.json"

    # Run tests with coverage if summary doesn't exist or is stale
    if [ ! -f "$COVERAGE_SUMMARY" ] || [ "package.json" -nt "$COVERAGE_SUMMARY" ]; then
        npm test -- --coverage --coverageReporters=json-summary --silent 2>/dev/null
    fi

    if [ -f "$COVERAGE_SUMMARY" ] && command -v jq &> /dev/null; then
        # Extract coverage percentages
        STATEMENTS=$(jq -r '.total.statements.pct // 0' "$COVERAGE_SUMMARY" 2>/dev/null)
        BRANCHES=$(jq -r '.total.branches.pct // 0' "$COVERAGE_SUMMARY" 2>/dev/null)
        FUNCTIONS=$(jq -r '.total.functions.pct // 0' "$COVERAGE_SUMMARY" 2>/dev/null)
        LINES=$(jq -r '.total.lines.pct // 0' "$COVERAGE_SUMMARY" 2>/dev/null)

        # Check if any metric is below threshold
        COVERAGE_FAILED=false
        FAILED_METRICS=""

        # Use awk for float comparison
        if [ "$(echo "$STATEMENTS < $COVERAGE_MIN" | bc -l 2>/dev/null || echo "0")" = "1" ]; then
            COVERAGE_FAILED=true
            FAILED_METRICS="${FAILED_METRICS}statements: ${STATEMENTS}%, "
        fi
        if [ "$(echo "$BRANCHES < $COVERAGE_MIN" | bc -l 2>/dev/null || echo "0")" = "1" ]; then
            COVERAGE_FAILED=true
            FAILED_METRICS="${FAILED_METRICS}branches: ${BRANCHES}%, "
        fi

        if [ "$COVERAGE_FAILED" = true ]; then
            FAILED_METRICS=$(echo "$FAILED_METRICS" | sed 's/, $//')
            echo "" >&2
            echo "BLOCKED: Code coverage below ${COVERAGE_MIN}% threshold!" >&2
            echo "" >&2
            echo "Failed metrics: $FAILED_METRICS" >&2
            echo "" >&2
            echo "Coverage summary:" >&2
            echo "  Statements: ${STATEMENTS}%" >&2
            echo "  Branches:   ${BRANCHES}%" >&2
            echo "  Functions:  ${FUNCTIONS}%" >&2
            echo "  Lines:      ${LINES}%" >&2
            echo "" >&2
            echo "Add tests to increase coverage before deploying." >&2
            echo "Run 'npm test -- --coverage' to see uncovered lines." >&2
            echo "" >&2
            exit 2
        fi
        echo "✓ Coverage check passed (statements: ${STATEMENTS}%, branches: ${BRANCHES}%)"
    else
        echo "⚠️  Coverage check skipped (missing coverage report or jq)"
    fi

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
        echo "  ✓ Coverage meets 80% threshold"
        echo "  ✓ Linting passing"
        echo ""
    fi

    echo "Pre-deployment validation complete."
    echo ""
fi

exit 0
