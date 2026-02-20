#!/bin/bash
# ABOUTME: Comprehensive integration tests for all Claude Code hooks.
# ABOUTME: Tests stdin JSON parsing, blocking conditions, and exit codes.

set -uo pipefail
# Note: NOT using set -e because we intentionally test non-zero exit codes

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="$(cd "$HOOK_DIR/../.." && pwd)"

PASS_COUNT=0
FAIL_COUNT=0

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

assert_exit() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"
    if [ "$expected" = "$actual" ]; then
        echo -e "${GREEN}PASS${NC}: $test_name (exit=$actual)"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${RED}FAIL${NC}: $test_name (expected exit=$expected, got exit=$actual)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

assert_output_contains() {
    local test_name="$1"
    local expected="$2"
    local output="$3"
    if echo "$output" | grep -qF "$expected"; then
        echo -e "${GREEN}PASS${NC}: $test_name"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${RED}FAIL${NC}: $test_name"
        echo "  Expected to contain: $expected"
        echo "  Output: $(echo "$output" | head -3)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

# Helper to run a hook with JSON input (captures both stdout and stderr)
run_hook() {
    local hook="$1"
    local json_input="$2"
    echo "$json_input" | bash "$HOOK_DIR/$hook" 2>&1 || true
}

run_hook_exit() {
    local hook="$1"
    local json_input="$2"
    echo "$json_input" | bash "$HOOK_DIR/$hook" >/dev/null 2>&1
    local rc=$?
    echo $rc
}

# ============================================
echo ""
echo "================================================"
echo "HOOK VALIDATION SUITE"
echo "================================================"
echo ""

# ============================================
# _meta-mode.sh tests
# ============================================
echo "--- _meta-mode.sh ---"

# Test meta mode detection in a clean subshell to avoid env contamination
META_RESULT=$(
    unset PROJECT_ROOT CLAUDE_META_MODE CLAUDE_PENDING_ACTIONS CLAUDE_LEARNINGS
    source "$HOOK_DIR/_meta-mode.sh"
    echo "MODE=$CLAUDE_META_MODE"
    echo "PENDING=$CLAUDE_PENDING_ACTIONS"
    echo "LEARNINGS=$CLAUDE_LEARNINGS"
    echo "ROOT=$PROJECT_ROOT"
)

META_MODE=$(echo "$META_RESULT" | grep "^MODE=" | cut -d= -f2)
META_PENDING=$(echo "$META_RESULT" | grep "^PENDING=" | cut -d= -f2)
META_LEARNINGS=$(echo "$META_RESULT" | grep "^LEARNINGS=" | cut -d= -f2)
META_ROOT=$(echo "$META_RESULT" | grep "^ROOT=" | cut -d= -f2)

# Determine expected mode based on whether .meta/ exists
if [ -d "$PROJECT_ROOT/.meta" ]; then
    EXPECTED_MODE="true"
    EXPECTED_DIR=".meta"
else
    EXPECTED_MODE="false"
    EXPECTED_DIR=".claude"
fi

if [ "$META_MODE" = "$EXPECTED_MODE" ]; then
    echo -e "${GREEN}PASS${NC}: Meta mode correctly detected as $EXPECTED_MODE (.meta/ $([ -d "$PROJECT_ROOT/.meta" ] && echo exists || echo absent))"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo -e "${RED}FAIL${NC}: Meta mode wrong (expected $EXPECTED_MODE, got $META_MODE)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

if [ "$META_PENDING" = "$META_ROOT/$EXPECTED_DIR/pending-actions.md" ]; then
    echo -e "${GREEN}PASS${NC}: Pending actions path routes to $EXPECTED_DIR/"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo -e "${RED}FAIL${NC}: Pending actions path wrong: $META_PENDING (expected $META_ROOT/$EXPECTED_DIR/pending-actions.md)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

if [ "$META_LEARNINGS" = "$META_ROOT/$EXPECTED_DIR/learnings.md" ]; then
    echo -e "${GREEN}PASS${NC}: Learnings path routes to $EXPECTED_DIR/"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo -e "${RED}FAIL${NC}: Learnings path wrong: $META_LEARNINGS (expected $META_ROOT/$EXPECTED_DIR/learnings.md)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# Now source for use by the rest of this script (needed for path variables)
unset PROJECT_ROOT CLAUDE_META_MODE CLAUDE_PENDING_ACTIONS CLAUDE_LEARNINGS
source "$HOOK_DIR/_meta-mode.sh"

# Determine the session dir used by hooks
if [ "$CLAUDE_META_MODE" = "true" ]; then
    SESSION_DIR="$PROJECT_ROOT/.meta"
else
    SESSION_DIR="$PROJECT_ROOT/.claude"
fi

# ============================================
# pre-write-validate.sh tests
# ============================================
echo ""
echo "--- pre-write-validate.sh ---"

# Test: empty input passes
EXIT=$(run_hook_exit "pre-write-validate.sh" '{}')
assert_exit "Empty JSON passes" "0" "$EXIT"

# Test: no content passes
EXIT=$(run_hook_exit "pre-write-validate.sh" '{"tool_input":{"file_path":"/tmp/x.js"}}')
assert_exit "No content passes" "0" "$EXIT"

# Meta mode isolation tests (only applicable when .meta/ exists)
if [ "$CLAUDE_META_MODE" = "true" ]; then
    # Test: meta mode blocks production path (use .json to avoid ABOUTME check)
    META_BLOCK_JSON='{"tool_input":{"file_path":"'"$PROJECT_ROOT"'/some-prod-file.json","content":"hello"}}'
    OUTPUT=$(echo "$META_BLOCK_JSON" | CLAUDE_ALLOW_PRODUCTION_WRITE="" bash "$HOOK_DIR/pre-write-validate.sh" 2>&1 || true)
    EXIT=$(echo "$META_BLOCK_JSON" | CLAUDE_ALLOW_PRODUCTION_WRITE="" bash "$HOOK_DIR/pre-write-validate.sh" >/dev/null 2>&1; echo $?)
    assert_exit "Meta mode blocks production path" "2" "$EXIT"
    assert_output_contains "Meta mode error message" "Meta mode active" "$OUTPUT"

    # Test: meta mode allows .meta/ path
    EXIT=$(run_hook_exit "pre-write-validate.sh" '{"tool_input":{"file_path":"'"$PROJECT_ROOT"'/.meta/test.md","content":"hello"}}')
    assert_exit "Meta mode allows .meta/ path" "0" "$EXIT"

    # Test: meta mode allows .claude/ path
    EXIT=$(run_hook_exit "pre-write-validate.sh" '{"tool_input":{"file_path":"'"$PROJECT_ROOT"'/.claude/test.md","content":"hello"}}')
    assert_exit "Meta mode allows .claude/ path" "0" "$EXIT"

    # Test: meta mode allows scripts/ path
    EXIT=$(run_hook_exit "pre-write-validate.sh" '{"tool_input":{"file_path":"'"$PROJECT_ROOT"'/scripts/test.sh","content":"hello"}}')
    assert_exit "Meta mode allows scripts/ path" "0" "$EXIT"

    # Test: meta mode allows __tests__/ path
    EXIT=$(run_hook_exit "pre-write-validate.sh" '{"tool_input":{"file_path":"'"$PROJECT_ROOT"'/__tests__/test.js","content":"hello"}}')
    assert_exit "Meta mode allows __tests__/ path" "0" "$EXIT"

    # Test: meta mode allows root .md files
    EXIT=$(run_hook_exit "pre-write-validate.sh" '{"tool_input":{"file_path":"'"$PROJECT_ROOT"'/README.md","content":"hello"}}')
    assert_exit "Meta mode allows root .md files" "0" "$EXIT"

    # Test: meta mode allows files OUTSIDE the project root (e.g., ~/.claude/plans/)
    EXIT=$(run_hook_exit "pre-write-validate.sh" '{"tool_input":{"file_path":"/Users/someone/.claude/plans/test-plan.md","content":"hello"}}')
    assert_exit "Meta mode allows files outside project root" "0" "$EXIT"

    # Test: bypass meta mode (use non-function path to avoid ABOUTME check)
    EXIT=$(CLAUDE_ALLOW_PRODUCTION_WRITE=true run_hook_exit "pre-write-validate.sh" '{"tool_input":{"file_path":"'"$PROJECT_ROOT"'/some-config.json","content":"{}"}}')
    assert_exit "CLAUDE_ALLOW_PRODUCTION_WRITE bypasses meta" "0" "$EXIT"
else
    echo "  (skipping meta mode isolation tests — .meta/ not present)"
    # Test: writes to any path pass when not in meta mode
    EXIT=$(run_hook_exit "pre-write-validate.sh" '{"tool_input":{"file_path":"'"$PROJECT_ROOT"'/some-config.json","content":"{}"}}')
    assert_exit "No meta mode: writes pass freely" "0" "$EXIT"
fi

# Build fake credential strings dynamically to avoid GitHub Push Protection
# flagging them as real secrets in the test file itself
FAKE_HEX="00112233aabbccdd00112233aabbccdd"
FAKE_SID="AC${FAKE_HEX}"
FAKE_KEY="SK${FAKE_HEX}"

# Test: Account SID blocked
SID_JSON=$(python3 -c "import json; print(json.dumps({'tool_input':{'file_path':'/tmp/test.js','content':'const sid = \"$FAKE_SID\";'}}))")
OUTPUT=$(echo "$SID_JSON" | CLAUDE_ALLOW_PRODUCTION_WRITE=true bash "$HOOK_DIR/pre-write-validate.sh" 2>&1; true)
EXIT=$(echo "$SID_JSON" | CLAUDE_ALLOW_PRODUCTION_WRITE=true bash "$HOOK_DIR/pre-write-validate.sh" >/dev/null 2>&1; echo $?)
assert_exit "Hardcoded Account SID blocked" "2" "$EXIT"
assert_output_contains "Account SID error" "Hardcoded Twilio Account SID" "$OUTPUT"

# Test: API Key SID blocked
KEY_JSON=$(python3 -c "import json; print(json.dumps({'tool_input':{'file_path':'/tmp/test.js','content':'const key = \"$FAKE_KEY\";'}}))")
EXIT=$(echo "$KEY_JSON" | CLAUDE_ALLOW_PRODUCTION_WRITE=true bash "$HOOK_DIR/pre-write-validate.sh" >/dev/null 2>&1; echo $?)
assert_exit "Hardcoded API Key blocked" "2" "$EXIT"

# Test: Auth token blocked
TOKEN_JSON=$(python3 -c "import json; print(json.dumps({'tool_input':{'file_path':'/tmp/test.js','content':'authToken = \"$FAKE_HEX\";'}}))")
EXIT=$(echo "$TOKEN_JSON" | CLAUDE_ALLOW_PRODUCTION_WRITE=true bash "$HOOK_DIR/pre-write-validate.sh" >/dev/null 2>&1; echo $?)
assert_exit "Hardcoded auth token blocked" "2" "$EXIT"

# Test: env var reference for SID passes
EXIT=$(CLAUDE_ALLOW_PRODUCTION_WRITE=true run_hook_exit "pre-write-validate.sh" '{"tool_input":{"file_path":"/tmp/test.js","content":"const sid = process.env.TWILIO_ACCOUNT_SID;"}}')
assert_exit "Env var SID reference passes" "0" "$EXIT"

# Test: magic test number blocked in non-test file
MAGIC_JSON='{"tool_input":{"file_path":"/tmp/prod.js","content":"const num = \"+15005550006\";"}}'
OUTPUT=$(echo "$MAGIC_JSON" | CLAUDE_ALLOW_PRODUCTION_WRITE=true bash "$HOOK_DIR/pre-write-validate.sh" 2>&1; true)
EXIT=$(echo "$MAGIC_JSON" | CLAUDE_ALLOW_PRODUCTION_WRITE=true bash "$HOOK_DIR/pre-write-validate.sh" >/dev/null 2>&1; echo $?)
assert_exit "Magic test number blocked" "2" "$EXIT"
assert_output_contains "Magic number error" "magic test numbers" "$OUTPUT"

# Test: magic test number allowed in test file
EXIT=$(CLAUDE_ALLOW_PRODUCTION_WRITE=true run_hook_exit "pre-write-validate.sh" '{"tool_input":{"file_path":"/tmp/test.test.js","content":"const num = \"+15005550006\";"}}')
assert_exit "Magic test number allowed in .test.js" "0" "$EXIT"

# Test: credential check skipped for .md files
MD_SID_JSON=$(python3 -c "import json; print(json.dumps({'tool_input':{'file_path':'$PROJECT_ROOT/.claude/notes.md','content':'Example: $FAKE_SID'}}))")
EXIT=$(echo "$MD_SID_JSON" | bash "$HOOK_DIR/pre-write-validate.sh" >/dev/null 2>&1; echo $?)
assert_exit "Credential check skipped for .md" "0" "$EXIT"

# ============================================
# pre-bash-validate.sh tests
# ============================================
echo ""
echo "--- pre-bash-validate.sh ---"

# Build command strings dynamically to avoid the pre-bash hook matching patterns
# in this test script's own command text
G="git"
C="commit"
P="push"
NV="--no-verify"
FF="--force"

# Test: --no-verify blocked
CMD_JSON=$(python3 -c "import json; print(json.dumps({'tool_input':{'command':'$G $C -m test $NV'}}))")
EXIT=$(echo "$CMD_JSON" | bash "$HOOK_DIR/pre-bash-validate.sh" >/dev/null 2>&1; echo $?)
assert_exit "Blocks --no-verify" "2" "$EXIT"

# Test: -n short form blocked
CMD_JSON=$(python3 -c "import json; print(json.dumps({'tool_input':{'command':'$G $C -n -m test'}}))")
EXIT=$(echo "$CMD_JSON" | bash "$HOOK_DIR/pre-bash-validate.sh" >/dev/null 2>&1; echo $?)
assert_exit "Blocks -n short form" "2" "$EXIT"

# Test: force push to main blocked
CMD_JSON=$(python3 -c "import json; print(json.dumps({'tool_input':{'command':'$G $P $FF main'}}))")
EXIT=$(echo "$CMD_JSON" | bash "$HOOK_DIR/pre-bash-validate.sh" >/dev/null 2>&1; echo $?)
assert_exit "Blocks force push to main" "2" "$EXIT"

# Test: force push to master blocked
CMD_JSON=$(python3 -c "import json; print(json.dumps({'tool_input':{'command':'$G $P $FF master'}}))")
EXIT=$(echo "$CMD_JSON" | bash "$HOOK_DIR/pre-bash-validate.sh" >/dev/null 2>&1; echo $?)
assert_exit "Blocks force push to master" "2" "$EXIT"

# Test: force push to feature branch allowed
CMD_JSON=$(python3 -c "import json; print(json.dumps({'tool_input':{'command':'$G $P $FF feature-branch'}}))")
EXIT=$(echo "$CMD_JSON" | bash "$HOOK_DIR/pre-bash-validate.sh" >/dev/null 2>&1; echo $?)
assert_exit "Allows force push to feature branch" "0" "$EXIT"

# Test: normal npm command passes
EXIT=$(echo '{"tool_input":{"command":"npm install express"}}' | bash "$HOOK_DIR/pre-bash-validate.sh" >/dev/null 2>&1; echo $?)
assert_exit "Normal npm command passes" "0" "$EXIT"

# Test: empty input passes
EXIT=$(echo '{}' | bash "$HOOK_DIR/pre-bash-validate.sh" >/dev/null 2>&1; echo $?)
assert_exit "Empty JSON passes" "0" "$EXIT"

# ============================================
# post-write.sh tests
# ============================================
echo ""
echo "--- post-write.sh ---"

# Test: empty input passes
EXIT=$(echo '{}' | bash "$HOOK_DIR/post-write.sh" >/dev/null 2>&1; echo $?)
assert_exit "Empty JSON passes" "0" "$EXIT"

# Test: non-JS file skips lint
EXIT=$(echo '{"tool_input":{"file_path":"'"$PROJECT_ROOT"'/.meta/test.md"}}' | bash "$HOOK_DIR/post-write.sh" >/dev/null 2>&1; echo $?)
assert_exit "Non-JS file passes" "0" "$EXIT"

# Test: session file tracking (must run from project root for git rev-parse)
SESSION_FILE="$SESSION_DIR/.session-files"
rm -f "$SESSION_FILE"
(cd "$PROJECT_ROOT" && echo '{"tool_input":{"file_path":"'"$PROJECT_ROOT"'/.claude/test-tracking.md"}}' | bash "$HOOK_DIR/post-write.sh" >/dev/null 2>&1)
if [ -f "$SESSION_FILE" ] && grep -q "test-tracking.md" "$SESSION_FILE"; then
    echo -e "${GREEN}PASS${NC}: Session file tracking works"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo -e "${RED}FAIL${NC}: Session file not tracked in $SESSION_FILE"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# ============================================
# post-bash.sh tests
# ============================================
echo ""
echo "--- post-bash.sh ---"

# Test: empty input passes
EXIT=$(echo '{}' | bash "$HOOK_DIR/post-bash.sh" >/dev/null 2>&1; echo $?)
assert_exit "Empty JSON passes" "0" "$EXIT"

# Test: normal command passes
EXIT=$(echo '{"tool_input":{"command":"ls -la"}}' | bash "$HOOK_DIR/post-bash.sh" >/dev/null 2>&1; echo $?)
assert_exit "Normal command passes" "0" "$EXIT"

# ============================================
# flywheel-doc-check.sh tests
# ============================================
echo ""
echo "--- flywheel-doc-check.sh ---"

# Test: runs without error (force flag to skip debounce)
EXIT=$(bash "$HOOK_DIR/flywheel-doc-check.sh" --force >/dev/null 2>&1; echo $?)
assert_exit "Flywheel doc check runs cleanly" "0" "$EXIT"

# Test: debounce works (second call within 2 min should skip)
bash "$HOOK_DIR/flywheel-doc-check.sh" --force >/dev/null 2>&1
OUTPUT=$(bash "$HOOK_DIR/flywheel-doc-check.sh" 2>&1)
if [ -z "$OUTPUT" ]; then
    echo -e "${GREEN}PASS${NC}: Debounce suppresses second run"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo -e "${RED}FAIL${NC}: Debounce didn't work (got output)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# ============================================
# subagent-log.sh tests
# ============================================
echo ""
echo "--- subagent-log.sh ---"

# Test: runs without error
EXIT=$(echo '{}' | bash "$HOOK_DIR/subagent-log.sh" >/dev/null 2>&1; echo $?)
assert_exit "Subagent log runs cleanly" "0" "$EXIT"

# ============================================
# session-start-log.sh tests
# ============================================
echo ""
echo "--- session-start-log.sh ---"

# Test: runs with session input (from project root for git rev-parse)
EXIT=$(cd "$PROJECT_ROOT" && echo '{"session_id":"test-hook-123","source":"test","model":"test-model"}' | bash "$HOOK_DIR/session-start-log.sh" >/dev/null 2>&1; echo $?)
assert_exit "Session start log runs" "0" "$EXIT"

# Check log file was created
LOGS_DIR="$SESSION_DIR/logs"
if [ -f "$LOGS_DIR/session-events.log" ]; then
    if grep -q "test-hook-123" "$LOGS_DIR/session-events.log"; then
        echo -e "${GREEN}PASS${NC}: Session event logged"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${RED}FAIL${NC}: Session ID not in log"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
else
    echo -e "${RED}FAIL${NC}: Session events log not created"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# ============================================
# pre-compact.sh tests
# ============================================
echo ""
echo "--- pre-compact.sh ---"

# Test: runs and creates marker (from project root)
EXIT=$(cd "$PROJECT_ROOT" && echo '{"session_id":"test-compact-hook","trigger":"auto"}' | bash "$HOOK_DIR/pre-compact.sh" >/dev/null 2>&1; echo $?)
assert_exit "Pre-compact runs" "0" "$EXIT"

MARKER="$SESSION_DIR/.compact-pending"
if [ -f "$MARKER" ]; then
    echo -e "${GREEN}PASS${NC}: Compact marker file created"
    PASS_COUNT=$((PASS_COUNT + 1))
    rm -f "$MARKER"
else
    echo -e "${RED}FAIL${NC}: Compact marker not created"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# Check compaction event logged
if grep -q "test-compact-hook" "$LOGS_DIR/compaction-events.log" 2>/dev/null; then
    echo -e "${GREEN}PASS${NC}: Compaction event logged"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo -e "${RED}FAIL${NC}: Compaction event not logged"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# ============================================
# post-compact-summary.sh tests
# ============================================
echo ""
echo "--- post-compact-summary.sh ---"

# Test: non-compact source exits early
EXIT=$(echo '{"source":"startup","session_id":"test"}' | bash "$HOOK_DIR/post-compact-summary.sh" >/dev/null 2>&1; echo $?)
assert_exit "Non-compact source exits early" "0" "$EXIT"

# Test: compact source runs (no transcript available)
OUTPUT=$(echo '{"source":"compact","session_id":"test-post","transcript_path":""}' | bash "$HOOK_DIR/post-compact-summary.sh" 2>&1)
EXIT=$?
assert_exit "Compact source runs" "0" "$EXIT"

# ============================================
# notify-ready.sh tests
# ============================================
echo ""
echo "--- notify-ready.sh ---"

# Test: runs without error
EXIT=$(bash "$HOOK_DIR/notify-ready.sh" >/dev/null 2>&1; echo $?)
assert_exit "Notify ready runs cleanly" "0" "$EXIT"

# ============================================
# archive-plan.sh tests
# ============================================
echo ""
echo "--- archive-plan.sh ---"

# Test: runs without error (no plans to archive)
EXIT=$(bash "$HOOK_DIR/archive-plan.sh" >/dev/null 2>&1; echo $?)
assert_exit "Archive plan runs cleanly (no plans)" "0" "$EXIT"

# ============================================
# session-checklist.sh tests
# ============================================
echo ""
echo "--- session-checklist.sh ---"

# Test: runs without error
OUTPUT=$(bash "$HOOK_DIR/session-checklist.sh" 2>&1)
EXIT=$?
assert_exit "Session checklist runs" "0" "$EXIT"

# ============================================
# teammate-idle-check.sh tests
# ============================================
echo ""
echo "--- teammate-idle-check.sh ---"

# Test: unknown task type passes
EXIT=$(CLAUDE_TASK_SUBJECT="" CLAUDE_TASK_DESCRIPTION="" bash "$HOOK_DIR/teammate-idle-check.sh" >/dev/null 2>&1; echo $?)
assert_exit "Unknown task type passes" "0" "$EXIT"

# ============================================
# task-completed-check.sh tests
# ============================================
echo ""
echo "--- task-completed-check.sh ---"

# Test: non-code task passes
EXIT=$(CLAUDE_TASK_SUBJECT="update docs" CLAUDE_TASK_DESCRIPTION="improve readme" bash "$HOOK_DIR/task-completed-check.sh" >/dev/null 2>&1; echo $?)
assert_exit "Non-code task passes" "0" "$EXIT"

# ============================================
# ORPHANED HOOK CHECK
# ============================================
echo ""
echo "--- Orphaned hook check ---"

# Check for any hook scripts that exist on disk but aren't registered in settings.json
ORPHAN_COUNT=0
for hook_file in "$HOOK_DIR"/*.sh; do
    hook_name=$(basename "$hook_file")
    # Skip helper files (prefixed with _) and test directories
    if [[ "$hook_name" == _* ]]; then
        continue
    fi
    if ! grep -q "$hook_name" "$PROJECT_ROOT/.claude/settings.json" 2>/dev/null; then
        echo -e "${RED}FAIL${NC}: $hook_name exists but is NOT registered in settings.json (orphaned)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        ORPHAN_COUNT=$((ORPHAN_COUNT + 1))
    fi
done
if [ "$ORPHAN_COUNT" -eq 0 ]; then
    echo -e "${GREEN}PASS${NC}: No orphaned hook scripts found"
    PASS_COUNT=$((PASS_COUNT + 1))
fi

# ============================================
# SETTINGS.JSON CONSISTENCY CHECK
# ============================================
echo ""
echo "--- Settings consistency ---"

# Check that every hook script referenced in settings.json exists
REFERENCED_HOOKS=$(grep -oE '[a-z_-]+\.sh' "$PROJECT_ROOT/.claude/settings.json" | sort -u)
for hook_name in $REFERENCED_HOOKS; do
    if [ -f "$HOOK_DIR/$hook_name" ]; then
        echo -e "${GREEN}PASS${NC}: Referenced hook $hook_name exists"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${RED}FAIL${NC}: Referenced hook $hook_name does NOT exist"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
done

# Check all hooks have ABOUTME
echo ""
echo "--- ABOUTME compliance ---"
for hook_file in "$HOOK_DIR"/*.sh; do
    hook_name=$(basename "$hook_file")
    if [ "$hook_name" = "_meta-mode.sh" ]; then
        continue  # Helper, not a standalone hook
    fi
    ABOUTME_COUNT=$(head -5 "$hook_file" | grep -c "# ABOUTME:" || true)
    if [ "$ABOUTME_COUNT" -ge 2 ]; then
        echo -e "${GREEN}PASS${NC}: $hook_name has ABOUTME"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${RED}FAIL${NC}: $hook_name missing ABOUTME ($ABOUTME_COUNT lines)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
done

# ============================================
# SUMMARY
# ============================================
echo ""
echo "================================================"
TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo "Results: $PASS_COUNT/$TOTAL passed"
if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "${RED}$FAIL_COUNT test(s) failed${NC}"
    echo "================================================"
    exit 1
else
    echo -e "${GREEN}All tests passed${NC}"
    echo "================================================"
    exit 0
fi
