#!/bin/bash
# ABOUTME: Documentation flywheel hook - suggests doc updates from multiple sources.
# ABOUTME: Environment-aware: writes to .meta/ (meta) or .claude/ (shipped).

# This hook combines FOUR sources for doc suggestions:
# 1. Uncommitted files (git status) - catches pre-commit needs
# 2. Recent commits (since session start) - catches post-commit needs
# 3. Session-tracked files (from post-write hook) - catches everything touched
# 4. Validation failures (from PatternTracker) - catches unresolved issues

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source environment detection helper
source "$SCRIPT_DIR/_meta-mode.sh"

# Use environment-aware paths from _meta-mode.sh
PENDING_ACTIONS_FILE="$CLAUDE_PENDING_ACTIONS"
SESSION_FILE="$(dirname "$CLAUDE_PENDING_ACTIONS")/.session-files"
SESSION_START_FILE="$(dirname "$CLAUDE_PENDING_ACTIONS")/.session-start"
LAST_RUN_FILE="$(dirname "$CLAUDE_PENDING_ACTIONS")/.last-doc-check"

# Accept --force flag to skip debounce
FORCE=false
if [ "$1" = "--force" ]; then
    FORCE=true
fi

# Debounce: Only run if 2+ minutes have passed since last check
if [ "$FORCE" = false ] && [ -f "$LAST_RUN_FILE" ]; then
    LAST_RUN=$(cat "$LAST_RUN_FILE" 2>/dev/null | head -1)
    NOW=$(date +%s)
    DIFF=$((NOW - LAST_RUN))
    if [ "$DIFF" -lt 120 ]; then
        exit 0
    fi
fi

# Update last run timestamp
date +%s > "$LAST_RUN_FILE"

# Get timestamp for display
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')

# Check if we're in a git repo
cd "$PROJECT_ROOT" || exit 0
if [ ! -d ".git" ]; then
    exit 0
fi

# ============================================
# COLLECT FILES FROM ALL THREE SOURCES
# ============================================

ALL_FILES=""

# Source 1: Uncommitted files (staged, modified, untracked)
UNCOMMITTED=$(git status --porcelain 2>/dev/null | grep -E "^(M|A| M| A|\?\?)" | awk '{print $NF}')
if [ -n "$UNCOMMITTED" ]; then
    ALL_FILES="$ALL_FILES"$'\n'"$UNCOMMITTED"
fi

# Source 2: Files from recent commits (since session start)
if [ -f "$SESSION_START_FILE" ]; then
    SESSION_START=$(cat "$SESSION_START_FILE")
    # Get files changed in commits since session start
    COMMITTED_FILES=$(git log --since="@$SESSION_START" --name-only --pretty=format: 2>/dev/null | grep -v "^$" | sort -u)
    if [ -n "$COMMITTED_FILES" ]; then
        ALL_FILES="$ALL_FILES"$'\n'"$COMMITTED_FILES"
    fi
fi

# Source 3: Session-tracked files (from post-write hook)
if [ -f "$SESSION_FILE" ]; then
    # Extract just the file paths (format is timestamp|filepath)
    SESSION_TRACKED=$(cut -d'|' -f2 "$SESSION_FILE" 2>/dev/null)
    if [ -n "$SESSION_TRACKED" ]; then
        ALL_FILES="$ALL_FILES"$'\n'"$SESSION_TRACKED"
    fi
fi

# Source 4: Validation failure patterns (from PatternTracker)
# Check for pattern database in both .meta and .claude locations
PATTERN_DB_META="$PROJECT_ROOT/.meta/pattern-db.json"
PATTERN_DB_CLAUDE="$PROJECT_ROOT/.claude/pattern-db.json"
PATTERN_DB=""
if [ -f "$PATTERN_DB_META" ]; then
    PATTERN_DB="$PATTERN_DB_META"
elif [ -f "$PATTERN_DB_CLAUDE" ]; then
    PATTERN_DB="$PATTERN_DB_CLAUDE"
fi

# Track unresolved pattern count for later use
UNRESOLVED_PATTERNS=0
PATTERN_CATEGORIES=""
if [ -n "$PATTERN_DB" ] && command -v jq &> /dev/null; then
    # Count unresolved patterns
    UNRESOLVED_PATTERNS=$(jq '[.patterns | to_entries[] | select(.value.resolved == false)] | length' "$PATTERN_DB" 2>/dev/null || echo "0")

    # Get categories of unresolved patterns
    if [ "$UNRESOLVED_PATTERNS" -gt 0 ]; then
        PATTERN_CATEGORIES=$(jq -r '[.patterns | to_entries[] | select(.value.resolved == false) | .value.category] | unique | join(", ")' "$PATTERN_DB" 2>/dev/null || echo "")
    fi
fi

# Source 5: CLAUDE.md inventory drift
DRIFT_SCRIPT="$PROJECT_ROOT/scripts/check-claude-doc-drift.sh"
if [ -x "$DRIFT_SCRIPT" ]; then
    DRIFT_OUTPUT=$("$DRIFT_SCRIPT" --quiet 2>/dev/null || true)
    if [ -n "$DRIFT_OUTPUT" ]; then
        ALL_FILES="$ALL_FILES"$'\n'"$DRIFT_OUTPUT"
    fi
fi

# Deduplicate, clean up, and exclude flywheel's own output files to prevent
# recursive re-firing (editing pending-actions.md triggers post-write, which
# tracks it in .session-files, which the next flywheel run picks up)
ALL_FILES=$(echo "$ALL_FILES" | grep -v "^$" | grep -v "pending-actions\.md" | grep -v "\.session-files" | grep -v "\.session-start" | grep -v "\.last-doc-check" | sort -u)

if [ -z "$ALL_FILES" ]; then
    # No files to analyze
    exit 0
fi

# ============================================
# GENERATE DOC SUGGESTIONS BASED ON FILES
# ============================================

SUGGESTIONS=""

# Check for MCP server changes
if echo "$ALL_FILES" | grep -q "agents/mcp-servers"; then
    SUGGESTIONS="${SUGGESTIONS}• agents/mcp-servers/twilio/CLAUDE.md - if tools or validation changed\n"
    SUGGESTIONS="${SUGGESTIONS}• .claude/references/tool-boundaries.md - if MCP/CLI/Functions lines changed\n"
fi

# Check for function changes (with specific domain detection)
if echo "$ALL_FILES" | grep -q "functions/"; then
    FUNC_DIRS=$(echo "$ALL_FILES" | grep "functions/" | cut -d'/' -f2 | sort -u)
    for dir in $FUNC_DIRS; do
        if [ "$dir" != "helpers" ]; then
            SUGGESTIONS="${SUGGESTIONS}• functions/${dir}/CLAUDE.md - if patterns or APIs changed\n"
        fi
    done
fi

# Check for validation changes
if echo "$ALL_FILES" | grep -q "validation/"; then
    SUGGESTIONS="${SUGGESTIONS}• agents/mcp-servers/twilio/src/validation/CLAUDE.md - validation patterns\n"
fi

# Check for hook changes
if echo "$ALL_FILES" | grep -q ".claude/hooks"; then
    SUGGESTIONS="${SUGGESTIONS}• Root CLAUDE.md - hooks section if behavior changed\n"
fi

# Check for reference doc changes
if echo "$ALL_FILES" | grep -q ".claude/references"; then
    SUGGESTIONS="${SUGGESTIONS}• Verify doc-map.md points to updated references\n"
fi

# Check for script changes
if echo "$ALL_FILES" | grep -q "scripts/"; then
    SUGGESTIONS="${SUGGESTIONS}• scripts/CLAUDE.md - setup script documentation\n"
fi

# Check for Feature Factory changes
if echo "$ALL_FILES" | grep -q "agents/feature-factory"; then
    SUGGESTIONS="${SUGGESTIONS}• agents/feature-factory/CLAUDE.md - orchestrator, workflows, agents\n"
fi

# Check for Voice AI Builder changes
if echo "$ALL_FILES" | grep -q "agents/voice-ai-builder"; then
    SUGGESTIONS="${SUGGESTIONS}• agents/voice-ai-builder/CLAUDE.md - generators, templates, use cases\n"
fi

# Check for config/type changes
if echo "$ALL_FILES" | grep -qE "(types|config)\.(ts|js)$"; then
    SUGGESTIONS="${SUGGESTIONS}• Relevant CLAUDE.md - if interfaces or config options changed\n"
fi

# Check for test changes
if echo "$ALL_FILES" | grep -q "__tests__/"; then
    SUGGESTIONS="${SUGGESTIONS}• Root CLAUDE.md - if new test patterns established\n"
fi

# Check for significant code changes that should be tracked in todo.md
# functions/ and agents/ are the main code directories
if echo "$ALL_FILES" | grep -qE "^(functions|agents)/"; then
    # Check which areas changed
    CHANGED_AREAS=""
    if echo "$ALL_FILES" | grep -q "^functions/"; then
        CHANGED_AREAS="${CHANGED_AREAS}functions, "
    fi
    if echo "$ALL_FILES" | grep -q "^agents/"; then
        CHANGED_AREAS="${CHANGED_AREAS}agents, "
    fi
    CHANGED_AREAS=$(echo "$CHANGED_AREAS" | sed 's/, $//')
    SUGGESTIONS="${SUGGESTIONS}• .meta/todo.md - update task tracking (changed: $CHANGED_AREAS)\n"
fi

# Check for design decision changes
# New files, architectural changes, or config changes may need design-decisions.md update
NEW_FILES_COUNT=$(echo "$ALL_FILES" | wc -l | tr -d ' ')
if [ "$NEW_FILES_COUNT" -gt 3 ]; then
    SUGGESTIONS="${SUGGESTIONS}• .meta/design-decisions.md - review if architectural decisions were made\n"
fi

# Root CLAUDE.md changes may affect SDK agent prompt invariants
if echo "$ALL_FILES" | grep -q "^CLAUDE.md$"; then
    SUGGESTIONS="${SUGGESTIONS}• agents/feature-factory/src/agents/ - review agent prompts for invariant drift\n"
fi

# ConversationRelay or voice skill changes may affect voice-ai-builder templates
if echo "$ALL_FILES" | grep -qE "(conversation-relay/CLAUDE|skills/voice)"; then
    SUGGESTIONS="${SUGGESTIONS}• agents/voice-ai-builder/ - review templates for pattern drift\n"
fi

# Check for CLI reference updates needed
if echo "$ALL_FILES" | grep -qE "(twilio|cli)" && ! echo "$ALL_FILES" | grep -q "twilio-cli.md"; then
    SUGGESTIONS="${SUGGESTIONS}• .claude/references/twilio-cli.md - if new CLI patterns discovered\n"
fi

# Check for env changes
if echo "$ALL_FILES" | grep -qE "\.env"; then
    SUGGESTIONS="${SUGGESTIONS}• .env.example - ensure new env vars are documented\n"
fi

# Check for validation failure patterns (Source 4)
if [ "$UNRESOLVED_PATTERNS" -gt 0 ]; then
    SUGGESTIONS="${SUGGESTIONS}• agents/mcp-servers/twilio/src/validation/CLAUDE.md - $UNRESOLVED_PATTERNS unresolved validation patterns"
    if [ -n "$PATTERN_CATEGORIES" ]; then
        SUGGESTIONS="${SUGGESTIONS} (categories: $PATTERN_CATEGORIES)"
    fi
    SUGGESTIONS="${SUGGESTIONS}\n"

    # Suggest learnings update if patterns exist
    SUGGESTIONS="${SUGGESTIONS}• .claude/learnings.md - capture insights from validation failures\n"
fi

# ============================================
# WRITE SUGGESTIONS TO PENDING-ACTIONS
# ============================================

if [ -n "$SUGGESTIONS" ]; then
    # Initialize pending-actions.md if it doesn't exist
    if [ ! -f "$PENDING_ACTIONS_FILE" ]; then
        cat > "$PENDING_ACTIONS_FILE" << 'EOF'
# Pending Documentation Actions

Actions detected by the documentation flywheel. Review before committing.

---

EOF
    fi

    # Count sources for context (tr -d removes any newlines from counts)
    UNCOMMITTED_COUNT=$(echo "$UNCOMMITTED" | grep -c "." 2>/dev/null | tr -d '\n' || echo "0")
    COMMITTED_COUNT=$(echo "$COMMITTED_FILES" | grep -c "." 2>/dev/null | tr -d '\n' || echo "0")
    SESSION_COUNT=$(echo "$SESSION_TRACKED" | grep -c "." 2>/dev/null | tr -d '\n' || echo "0")

    # Append new actions (dedup with 24h staleness — old entries don't suppress forever)
    NOW_EPOCH=$(date +%s)
    STALE_THRESHOLD=86400  # 24 hours in seconds

    echo -e "$SUGGESTIONS" | while IFS= read -r line; do
        if [ -n "$line" ]; then
            SUGGESTION_TEXT=$(echo "$line" | sed 's/^• //')
            EXISTING_LINE=$(grep -F "$SUGGESTION_TEXT" "$PENDING_ACTIONS_FILE" 2>/dev/null | tail -1)

            if [ -z "$EXISTING_LINE" ]; then
                # No existing entry — add it
                echo "- [$TIMESTAMP] $line" >> "$PENDING_ACTIONS_FILE"
            else
                # Extract timestamp from existing entry: "- [YYYY-MM-DD HH:MM] • ..."
                EXISTING_TS=$(echo "$EXISTING_LINE" | sed -n 's/^.*\[\([0-9-]* [0-9:]*\)\].*$/\1/p')
                if [ -n "$EXISTING_TS" ]; then
                    # Parse timestamp (macOS then Linux fallback, default 0 = always re-suggest)
                    EXISTING_EPOCH=$(date -j -f "%Y-%m-%d %H:%M" "$EXISTING_TS" "+%s" 2>/dev/null \
                        || date -d "$EXISTING_TS" "+%s" 2>/dev/null \
                        || echo "0")
                    AGE=$((NOW_EPOCH - EXISTING_EPOCH))
                    if [ "$AGE" -gt "$STALE_THRESHOLD" ]; then
                        # Existing entry is stale (>24h) — re-suggest
                        echo "- [$TIMESTAMP] $line" >> "$PENDING_ACTIONS_FILE"
                    fi
                fi
            fi
        fi
    done

    # Output summary to stderr (visible in hook output)
    TOTAL_FILES=$(echo "$ALL_FILES" | wc -l | tr -d ' ')
    SUMMARY="Doc flywheel: Analyzed $TOTAL_FILES files (uncommitted:$UNCOMMITTED_COUNT, committed:$COMMITTED_COUNT, session:$SESSION_COUNT"
    if [ "$UNRESOLVED_PATTERNS" -gt 0 ]; then
        SUMMARY="$SUMMARY, validation-failures:$UNRESOLVED_PATTERNS"
    fi
    SUMMARY="$SUMMARY)"
    echo "$SUMMARY" >&2
fi

exit 0
