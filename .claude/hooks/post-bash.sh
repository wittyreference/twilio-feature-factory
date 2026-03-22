#!/bin/bash
# ABOUTME: Post-bash hook for tracking command completions.
# ABOUTME: Logs deployment completions and sends notifications for key operations.

# ============================================
# PARSE TOOL INPUT FROM STDIN
# ============================================
# Claude Code passes tool input as JSON on stdin, not env vars.
# Capture it before anything else consumes stdin.
_POST_BASH_HOOK_INPUT=""
if [ ! -t 0 ]; then
    _POST_BASH_HOOK_INPUT="$(cat)"
fi

# ============================================
# COMPACT-PENDING MARKER CHECK
# ============================================
# After auto-compaction, PreCompact leaves a marker file. Pick it up here
# to run the compaction summary extraction (since SessionStart only fires
# for manual /compact, not auto-compaction).
_check_compact_pending() {
    local HOOK_DIR="$(dirname "${BASH_SOURCE[0]}")"
    source "$HOOK_DIR/_meta-mode.sh"
    local MARKER
    if [ "$CLAUDE_META_MODE" = "true" ]; then
        MARKER="$PROJECT_ROOT/.meta/.compact-pending"
    else
        MARKER="$PROJECT_ROOT/.claude/.compact-pending"
    fi
    if [ -f "$MARKER" ]; then
        "$HOOK_DIR/post-compact-summary.sh" < "$MARKER"
        rm -f "$MARKER"
    fi
}
_check_compact_pending

COMMAND=""
_POST_BASH_SESSION_ID=""
if [ -n "$_POST_BASH_HOOK_INPUT" ] && ! command -v jq &> /dev/null; then
    echo "WARNING: jq not installed — post-bash hooks disabled (deployment tracking). Run: brew install jq" >&2
fi
if [ -n "$_POST_BASH_HOOK_INPUT" ] && command -v jq &> /dev/null; then
    COMMAND="$(echo "$_POST_BASH_HOOK_INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)"
    _POST_BASH_SESSION_ID="$(echo "$_POST_BASH_HOOK_INPUT" | jq -r '.session_id // empty' 2>/dev/null)"
fi

# Exit if no command
if [ -z "$COMMAND" ]; then
    exit 0
fi

# ============================================
# DEPLOYMENT COMPLETION
# ============================================

if echo "$COMMAND" | grep -qE "(twilio\s+serverless:deploy|npm\s+run\s+deploy)"; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Deployment command completed."
    echo "Check the output above for deployed URLs."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Send desktop notification on macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        osascript -e 'display notification "Deployment complete - check terminal for URLs" with title "Claude Code" sound name "Hero"' 2>/dev/null || true
    elif command -v notify-send &> /dev/null; then
        notify-send "Claude Code" "Deployment complete" 2>/dev/null || true
    fi
fi

# ============================================
# TEST/BUILD COMPLETION - Doc reminder
# ============================================

# After tests or builds complete is a great time to remind about docs
# because significant work was just completed and verified
if echo "$COMMAND" | grep -qE "(npm\s+(test|run\s+(test|build))|jest|vitest)"; then
    # Get project root from script location
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    # Call the consolidated flywheel-doc-check (environment-aware)
    FLYWHEEL_HOOK="$SCRIPT_DIR/flywheel-doc-check.sh"
    if [ -x "$FLYWHEEL_HOOK" ]; then
        "$FLYWHEEL_HOOK" --force
    fi
fi

# ============================================
# VALUE LEAKAGE DETECTION (post-commit)
# ============================================
# After a successful git commit, check if committed files are in sync maps.
# Files not mapped (and not excluded) are potential value leakage candidates.
# Meta-mode only — this detection only runs when .meta/ exists.

if [ "$CLAUDE_META_MODE" = "true" ] && echo "$COMMAND" | grep -qE '^git\s+commit\b'; then
    _detect_value_leakage() {
        # PROJECT_ROOT and CLAUDE_META_MODE are set by _meta-mode.sh (sourced above)

        # Noise filters: skip ephemeral branches
        local BRANCH
        BRANCH=$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)
        case "$BRANCH" in
            validation-*|headless-*|uber-val-*|fresh-install-*) return 0 ;;
        esac

        # Get committed files from the most recent commit
        local COMMITTED_FILES
        COMMITTED_FILES=$(git -C "$PROJECT_ROOT" diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null)
        [ -z "$COMMITTED_FILES" ] && return 0

        # Noise filter: skip if all files are under .meta/ or are tests
        local HAS_SYNCABLE=false
        while IFS= read -r file; do
            case "$file" in
                .meta/*) continue ;;
                __tests__/*|*.test.*|*.spec.*) continue ;;
                .claude/skills/*|.claude/commands/*|.claude/hooks/*|.claude/rules/*|.claude/references/*) HAS_SYNCABLE=true ;;
                functions/*/CLAUDE.md|functions/*/REFERENCE.md) HAS_SYNCABLE=true ;;
                scripts/*.sh) HAS_SYNCABLE=true ;;
            esac
        done <<< "$COMMITTED_FILES"
        [ "$HAS_SYNCABLE" = "false" ] && return 0

        # Build list of all mapped + excluded paths from both sync maps
        local PLUGIN_MAP="$PROJECT_ROOT/.meta/sync-map.json"
        local FF_MAP="$PROJECT_ROOT/../feature-factory/ff-sync-map.json"
        local KNOWN_PATHS=""

        if [ -f "$PLUGIN_MAP" ]; then
            # Extract all factory paths from mappings and all excluded paths
            local PLUGIN_MAPPED PLUGIN_EXCLUDED
            PLUGIN_MAPPED=$(jq -r '[.mappings[][]? | .factory // empty] | .[]' "$PLUGIN_MAP" 2>/dev/null)
            PLUGIN_EXCLUDED=$(jq -r '[.excluded[][]? // empty] | .[]' "$PLUGIN_MAP" 2>/dev/null)
            KNOWN_PATHS="$PLUGIN_MAPPED"$'\n'"$PLUGIN_EXCLUDED"
        fi

        if [ -f "$FF_MAP" ]; then
            local FF_MAPPED FF_EXCLUDED
            FF_MAPPED=$(jq -r '[.mappings[][]? | .source // empty] | .[]' "$FF_MAP" 2>/dev/null)
            FF_EXCLUDED=$(jq -r '[.excluded[][]? // empty] | .[]' "$FF_MAP" 2>/dev/null)
            KNOWN_PATHS="$KNOWN_PATHS"$'\n'"$FF_MAPPED"$'\n'"$FF_EXCLUDED"
        fi

        # Check each syncable committed file against known paths
        local CANDIDATES=()
        local COMMIT_SHA
        COMMIT_SHA=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null)

        while IFS= read -r file; do
            # Only check syncable directories
            case "$file" in
                .claude/skills/*|.claude/commands/*|.claude/hooks/*|.claude/rules/*|.claude/references/*) ;;
                functions/*/CLAUDE.md|functions/*/REFERENCE.md) ;;
                scripts/*.sh) ;;
                *) continue ;;
            esac
            # Skip if file is in known paths (mapped or excluded)
            if echo "$KNOWN_PATHS" | grep -qxF "$file"; then
                continue
            fi
            CANDIDATES+=("$file")
        done <<< "$COMMITTED_FILES"

        [ ${#CANDIDATES[@]} -eq 0 ] && return 0

        # Determine which sync maps are missing each candidate
        local PENDING_DIR="$PROJECT_ROOT/.meta/value-assessments"
        mkdir -p "$PENDING_DIR" 2>/dev/null
        local TIMESTAMP
        TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

        local FILES_JSON
        FILES_JSON=$(printf '%s\n' "${CANDIDATES[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')

        # Write pending entry
        jq -nc \
            --arg commit "$COMMIT_SHA" \
            --arg ts "$TIMESTAMP" \
            --argjson files "$FILES_JSON" \
            '{commit:$commit, timestamp:$ts, files:$files, reviewed:false}' \
            >> "$PENDING_DIR/pending.jsonl"

        # Emit structured event
        local HOOK_DIR
        HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        source "$HOOK_DIR/_emit-event.sh"
        EMIT_SESSION_ID="$_POST_BASH_SESSION_ID"
        emit_event "value_leakage_candidate" "$(jq -nc \
            --arg commit "$COMMIT_SHA" \
            --argjson files "$FILES_JSON" \
            --arg count "${#CANDIDATES[@]}" \
            '{commit:$commit, files:$files, count:($count|tonumber)}')"

        echo "[VALUE] ${#CANDIDATES[@]} file(s) not in any sync map — run /value-audit to review" >&2
    }
    _detect_value_leakage
fi

# ============================================
# STRUCTURED EVENT EMISSION (observability)
# ============================================

if [ -z "$SCRIPT_DIR" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
source "$SCRIPT_DIR/_emit-event.sh"
EMIT_SESSION_ID="$_POST_BASH_SESSION_ID"

# Emit bash_command event for every command
emit_event "bash_command" "$(jq -nc --arg cmd "$COMMAND" '{command: $cmd}')"

# Emit specialized test_run event when tests are run
if echo "$COMMAND" | grep -qE "(npm\s+(test|run\s+test)|jest|vitest)"; then
    emit_event "test_run" "$(jq -nc --arg cmd "$COMMAND" '{command: $cmd}')"
fi

# Emit deploy event when deployment commands are run
if echo "$COMMAND" | grep -qE "(twilio\s+serverless:deploy|npm\s+run\s+deploy)"; then
    emit_event "deploy" "$(jq -nc --arg cmd "$COMMAND" '{command: $cmd}')"
fi

exit 0
