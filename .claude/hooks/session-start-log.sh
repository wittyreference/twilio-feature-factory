#!/bin/bash
# ABOUTME: Logs all SessionStart events to diagnose which sources fire when.
# ABOUTME: Captures source, session ID, and attempts summary extraction for compaction-like events.

INPUT=$(cat)

# Extract fields from hook input
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)
SOURCE=$(echo "$INPUT" | jq -r '.source // "unknown"' 2>/dev/null)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)
MODEL=$(echo "$INPUT" | jq -r '.model // "unknown"' 2>/dev/null)

# Source meta-mode detection for environment-aware paths
HOOK_DIR="$(dirname "$0")"
if [ -f "$HOOK_DIR/_meta-mode.sh" ]; then
    source "$HOOK_DIR/_meta-mode.sh"
fi

# Set up paths
if [ "$CLAUDE_META_MODE" = "true" ]; then
    LOGS_DIR=".meta/logs"
else
    LOGS_DIR=".claude/logs"
fi
mkdir -p "$LOGS_DIR"

TIMESTAMP=$(date -Iseconds)

# Log every SessionStart event (this is the diagnostic value)
echo "SessionStart: source=$SOURCE session=$SESSION_ID model=$MODEL timestamp=$TIMESTAMP" >> "$LOGS_DIR/session-events.log"

# For compaction-like events (source=compact, or any source with a transcript),
# attempt to extract the compaction summary
if [ "$SOURCE" = "compact" ] || [ "$SOURCE" = "clear" ] || [ "$SOURCE" = "plan" ]; then
    if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
        SUMMARY_FILE="$LOGS_DIR/compaction-summary-$(date +%Y%m%d-%H%M%S).md"

        # Extract the LAST compaction summary from transcript
        SUMMARY=$(jq -rs '[.[] | select(.isCompactSummary == true)] | last | .message.content' "$TRANSCRIPT_PATH" 2>/dev/null)

        if [ -n "$SUMMARY" ] && [ "$SUMMARY" != "null" ]; then
            {
                echo "# Compaction Summary"
                echo ""
                echo "**Captured:** $TIMESTAMP"
                echo "**Source:** $SOURCE"
                echo "**Session:** $SESSION_ID"
                echo "**Transcript:** $TRANSCRIPT_PATH"
                echo ""
                echo "---"
                echo ""
                echo "$SUMMARY"
            } > "$SUMMARY_FILE"
            echo "Compaction summary saved (source=$SOURCE): $SUMMARY_FILE" >&2
        fi
    fi
fi

# --- Session Bootstrap Checks ---
# Local-only checks (no API calls, <500ms). Warnings to stderr so Claude sees them.
# These catch "you forgot to set up" issues. Run /preflight for full validation.

# Determine session dir early for stale check
if [ "$CLAUDE_META_MODE" = "true" ]; then
    SESSION_DIR="$PROJECT_ROOT/.meta"
else
    SESSION_DIR="$PROJECT_ROOT/.claude"
fi

# 1. Stale session check (BEFORE reset — checks the OLD timestamp)
if [ -f "$SESSION_DIR/.session-start" ]; then
    PREV_START=$(cat "$SESSION_DIR/.session-start" 2>/dev/null)
    NOW=$(date +%s)
    if [ -n "$PREV_START" ] && [ "$PREV_START" -gt 0 ] 2>/dev/null; then
        AGE_HOURS=$(( (NOW - PREV_START) / 3600 ))
        if [ "$AGE_HOURS" -gt 48 ]; then
            echo "WARNING: Previous session started ${AGE_HOURS}h ago. Flywheel 'recent commits' may return excessive results." >&2
        fi
    fi
fi

# 1b. Workshop symlink health check
if [ ! -d "$PROJECT_ROOT/.meta" ] && [ -d "$PROJECT_ROOT/../factory-workshop" ]; then
    echo "WARNING: factory-workshop exists but .meta symlink is missing. Restore with: ln -s ../factory-workshop .meta" >&2
fi

# 2. .env file check
if [ -f "$PROJECT_ROOT/.env" ]; then
    MISSING_VARS=""
    for VAR_NAME in TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_PHONE_NUMBER; do
        VAR_VALUE=$(grep "^${VAR_NAME}=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'")
        if [ -z "$VAR_VALUE" ]; then
            MISSING_VARS="${MISSING_VARS} ${VAR_NAME}"
        elif [ "$VAR_VALUE" = "your_account_sid_here" ] || [ "$VAR_VALUE" = "your_auth_token_here" ] || [ "$VAR_VALUE" = "your_phone_number_here" ] || echo "$VAR_VALUE" | grep -qE '^(xxx|placeholder|changeme|TODO)'; then
            MISSING_VARS="${MISSING_VARS} ${VAR_NAME}(placeholder)"
        fi
    done
    if [ -n "$MISSING_VARS" ]; then
        echo "WARNING: .env issues:${MISSING_VARS}" >&2
    fi
else
    echo "WARNING: No .env file found. Copy .env.example and configure credentials." >&2
fi

# 3. CLI profile check (reads local config, no network)
if command -v twilio >/dev/null 2>&1; then
    ACTIVE_PROFILE=$(twilio profiles:list 2>/dev/null | grep -E '(true|Active)' | head -1)
    if [ -z "$ACTIVE_PROFILE" ]; then
        echo "WARNING: No active Twilio CLI profile. Run 'twilio profiles:create' or 'twilio profiles:use <name>'." >&2
    fi
fi

# 4. Pending learning exercises check
if [ "$CLAUDE_META_MODE" = "true" ] && [ -n "$CLAUDE_LEARNING_DIR" ] && [ -d "$CLAUDE_LEARNING_DIR" ]; then
    EXERCISE_FILE="$CLAUDE_LEARNING_DIR/exercises.md"
    STATE_FILE="$CLAUDE_LEARNING_DIR/exercise-state.json"
    if [ -f "$EXERCISE_FILE" ]; then
        # Count exercise headers (## lines that aren't the file title)
        EXERCISE_COUNT=$(grep -c '^## ' "$EXERCISE_FILE" 2>/dev/null) || EXERCISE_COUNT=0
        if [ "$EXERCISE_COUNT" -gt 0 ]; then
            echo "LEARNING: $EXERCISE_COUNT exercise(s) pending — use /learn" >&2
        fi
    fi
    # Reset per-session exercise state
    if [ -f "$STATE_FILE" ]; then
        cat > "$STATE_FILE" <<STATEEOF
{
  "exercises_offered": 0,
  "exercises_completed": 0,
  "exercises_declined": false,
  "last_exercise_ts": 0,
  "topics_covered": []
}
STATEEOF
    fi
fi

# 5. Update check (quiet mode — only prints if update available)
if [ -f "$PROJECT_ROOT/scripts/check-updates.sh" ]; then
    bash "$PROJECT_ROOT/scripts/check-updates.sh" --quiet 2>&1 || true
fi

# 5b. Changelog monitor (Claude Code + Agent SDK new features)
if [ -f "$PROJECT_ROOT/scripts/check-changelog.sh" ]; then
    bash "$PROJECT_ROOT/scripts/check-changelog.sh" --quiet 2>&1 || true
fi

# 6. Context Hub availability
if command -v chub >/dev/null 2>&1; then
    echo "Context Hub (chub) available for external API docs." >&2
fi

# 6b. MCP server build check
if [ ! -f "$PROJECT_ROOT/agents/mcp-servers/twilio/dist/serve.js" ]; then
    echo "WARNING: MCP server not built. Tools will not be available. Run: cd agents/mcp-servers/twilio && npm install && npm run build" >&2
fi

# 7. Codebase smoke test (syntax + deps, <200ms)
SMOKE_FAILURES=""

# 7a. node_modules existence
if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    SMOKE_FAILURES="${SMOKE_FAILURES} node_modules(missing)"
fi

# 7b. package.json valid JSON
if ! node -e "JSON.parse(require('fs').readFileSync('$PROJECT_ROOT/package.json','utf8'))" 2>/dev/null; then
    SMOKE_FAILURES="${SMOKE_FAILURES} package.json(invalid)"
fi

# 7c. Syntax check all function files (single node process via vm.Script, ~80ms)
if [ -d "$PROJECT_ROOT/functions" ]; then
    SYNTAX_ERRORS=$(node -e "
const fs = require('fs');
const vm = require('vm');
const {execSync} = require('child_process');
const files = execSync('find $PROJECT_ROOT/functions -name \"*.js\" -not -path \"*/node_modules/*\"').toString().trim().split('\n').filter(Boolean);
const errors = [];
for (const f of files) {
  try { new vm.Script(fs.readFileSync(f, 'utf8'), {filename: f}); }
  catch(e) { errors.push(f.replace('$PROJECT_ROOT/', '') + ': ' + e.message.split('\n')[0]); }
}
if (errors.length) { console.log(errors.length); console.error(errors.join('\n')); process.exit(1); }
" 2>&1 || true)
    if [ -n "$SYNTAX_ERRORS" ]; then
        BAD_COUNT=$(echo "$SYNTAX_ERRORS" | head -1)
        SMOKE_FAILURES="${SMOKE_FAILURES} functions(${BAD_COUNT} syntax errors)"
    fi
fi

if [ -n "$SMOKE_FAILURES" ]; then
    echo "SMOKE TEST FAILED:${SMOKE_FAILURES}" >&2
    echo "  Fix these before starting work. Run 'npm test' for details." >&2
fi

# 8. Local dev server startup (needed for Newman E2E tests on port 3000)
if [ -z "$SKIP_DEV_SERVER" ] && [ -d "$PROJECT_ROOT/functions" ]; then
    if ! lsof -i :3000 >/dev/null 2>&1; then
        # Start dev server in background (twilio-run directly, bypasses npm prestart)
        (cd "$PROJECT_ROOT" && npx twilio-run --port 3000 >/dev/null 2>&1 &)
        echo "Dev server started on :3000 (background, for Newman E2E)." >&2
    fi
fi

echo "Run /preflight for full environment validation." >&2

# --- Session Context Loader ---
# Surface accumulated knowledge so Claude starts with relevant context.
# Fast reads only (grep, wc, ls). No jq on large files.

LEARNINGS_FILE="$SESSION_DIR/learnings.md"
PENDING_FILE="$SESSION_DIR/pending-actions.md"
DECISIONS_FILE="$PROJECT_ROOT/DESIGN_DECISIONS.md"
COMPACTION_DIR="$LOGS_DIR"

CONTEXT_LINES=""

# Recent learnings: count + last 3 topic headers
if [ -f "$LEARNINGS_FILE" ]; then
    LEARN_COUNT=$(grep -c '^## \[' "$LEARNINGS_FILE" 2>/dev/null) || LEARN_COUNT=0
    if [ "$LEARN_COUNT" -gt 0 ]; then
        RECENT_TOPICS=$(grep '^## \[' "$LEARNINGS_FILE" | tail -3 | sed 's/^## \[[0-9-]*\] //' | sed 's/^ *//' | tr '\n' '|' | sed 's/|$//;s/|/, /g')
        LEARN_MSG="Learnings: $LEARN_COUNT entries (latest: $RECENT_TOPICS)"
        if [ "$LEARN_COUNT" -gt 10 ]; then
            LEARN_MSG="$LEARN_MSG — consider pruning"
        fi
        CONTEXT_LINES="${CONTEXT_LINES}${LEARN_MSG}\n"
    fi
fi

# Recent design decisions: last 2 titles
if [ -f "$DECISIONS_FILE" ]; then
    RECENT_DECISIONS=$(grep '^## Decision [0-9]' "$DECISIONS_FILE" | tail -2 | sed 's/^## //' | tr '\n' '|' | sed 's/|$//;s/|/, /g')
    if [ -n "$RECENT_DECISIONS" ]; then
        CONTEXT_LINES="${CONTEXT_LINES}Decisions: $RECENT_DECISIONS\n"
    fi
fi

# Last compaction summary: filename + age
LATEST_COMPACTION=$(ls -t "$COMPACTION_DIR"/compaction-summary-*.md 2>/dev/null | head -1)
if [ -n "$LATEST_COMPACTION" ]; then
    COMP_NAME=$(basename "$LATEST_COMPACTION" .md | sed 's/compaction-summary-//')
    COMP_MTIME=$(stat -f '%m' "$LATEST_COMPACTION" 2>/dev/null || stat -c '%Y' "$LATEST_COMPACTION" 2>/dev/null)
    if [ -n "$COMP_MTIME" ]; then
        COMP_AGE_DAYS=$(( ($(date +%s) - COMP_MTIME) / 86400 ))
        COMP_MSG="Last compaction: $COMP_NAME (${COMP_AGE_DAYS}d ago)"
        if [ "$COMP_AGE_DAYS" -gt 7 ]; then
            COMP_MSG="$COMP_MSG — stale, hook may have stopped firing"
        fi
        CONTEXT_LINES="${CONTEXT_LINES}${COMP_MSG}\n"
    fi
fi

# Pending actions count (non-auto-cleared entries)
if [ -f "$PENDING_FILE" ]; then
    PENDING_COUNT=$(grep -c '^- ' "$PENDING_FILE" 2>/dev/null) || PENDING_COUNT=0
    if [ "$PENDING_COUNT" -gt 0 ]; then
        CONTEXT_LINES="${CONTEXT_LINES}Pending actions: $PENDING_COUNT\n"
    fi
fi

# Output context block if anything was found
if [ -n "$CONTEXT_LINES" ]; then
    echo "--- Session Context ---" >&2
    printf "$CONTEXT_LINES" >&2
    echo "Use /recall <topic> to search accumulated knowledge." >&2
    echo "---" >&2
fi

# --- MEMORY.md auto-prune ---
# Remove sections tagged with <!-- prune --> markers from previous wrap-up
MEMORY_FILE="$HOME/.claude/projects/-Users-mcarpenter-workspaces-twilio-feature-factory/memory/MEMORY.md"
if [ -f "$MEMORY_FILE" ]; then
    if grep -q '<!-- prune -->' "$MEMORY_FILE"; then
        PRUNE_COUNT=$(grep -c '<!-- prune -->' "$MEMORY_FILE")
        # Remove sections: from <!-- prune --> through its ## header and content, stopping at next ## heading
        # Uses skip==0 instead of !skip for BSD awk (macOS) compatibility
        awk '/<!-- prune -->/{skip=1;seen_header=0;next} /^## /{if(skip){if(seen_header){skip=0;print;next}else{seen_header=1;next}}} skip==0' "$MEMORY_FILE" > "${MEMORY_FILE}.tmp"
        mv "${MEMORY_FILE}.tmp" "$MEMORY_FILE"
        echo "MEMORY: Auto-pruned $PRUNE_COUNT stale entries from MEMORY.md" >&2
    fi
    MEMORY_LINES=$(wc -l < "$MEMORY_FILE" | tr -d ' ')
    if [ "$MEMORY_LINES" -gt 100 ]; then
        echo "MEMORY: ${MEMORY_LINES}/200 lines (entries after 200 are truncated). Run /wrap-up to review." >&2
    fi
fi

# --- Reset Session Tracking ---
# Reset session-start timestamp for the flywheel
date +%s > "$SESSION_DIR/.session-start"

# Clear session-files tracking (new session = new file list)
rm -f "$SESSION_DIR/.session-files"

exit 0
