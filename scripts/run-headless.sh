#!/bin/bash
# ABOUTME: Headless runner for Claude Code using `claude -p` (non-interactive).
# ABOUTME: Wraps claude -p with pre-approved tools, audit logging, and pre-defined tasks.

set -e

# Colors (for terminal output only — headless callers can ignore)
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# Defaults
MAX_TURNS=30
OUTPUT_FORMAT="stream-json"
PROMPT=""
PROMPT_FILE=""
TASK_NAME=""

# Resolve a pre-defined task name to its prompt
resolve_task_prompt() {
    case "$1" in
        validate)
            echo "Run /preflight checks, then run npm test --bail. Report results summary at the end."
            ;;
        test-fix)
            echo "Run npm test. If any tests fail, diagnose and fix them. Re-run tests to confirm all pass. Use /commit to commit fixes with a conventional commit message."
            ;;
        lint-fix)
            echo "Run npm run lint. If there are any errors, fix them. Re-run lint to confirm clean. Use /commit to commit fixes with a conventional commit message."
            ;;
        typecheck)
            echo "Run npx tsc --noEmit in agents/mcp-servers/twilio/. If there are type errors, fix them. Re-run tsc to confirm clean. Use /commit to commit fixes with a conventional commit message."
            ;;
        deploy-dev)
            echo "Run /preflight to verify environment, then run /deploy dev. Report deployment URLs at the end."
            ;;
        e2e-validate)
            cat "$(dirname "$0")/headless-tasks/e2e-validate.md"
            ;;
        *)
            echo ""
            ;;
    esac
}

usage() {
    cat <<'USAGE'
Usage: run-headless.sh [OPTIONS] [PROMPT]

Run Claude Code non-interactively with pre-approved tool permissions.

Options:
  --max-turns N      Maximum agentic turns (default: 30)
  --output-format F  Output format: stream-json, json, text (default: stream-json)
  --prompt-file PATH Read prompt from a file instead of command line
  --task NAME        Use a pre-defined task prompt
  --list-tasks       List available pre-defined tasks
  --help             Show this help message

Pre-defined tasks: validate, test-fix, lint-fix, typecheck, deploy-dev, e2e-validate

Environment:
  CLAUDE_HEADLESS_ACKNOWLEDGED=true  Required. Confirms you accept autonomous risks.

Examples:
  CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh "Run npm test and fix failures"
  CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh --task test-fix
  CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh --task validate --max-turns 50
  CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh --prompt-file .meta/plans/validation-plan.md --max-turns 80
USAGE
}

list_tasks() {
    echo "Available pre-defined tasks:"
    echo ""
    echo "  validate      Run /preflight checks, then npm test --bail"
    echo "  test-fix      Run tests, fix failures, commit fixes"
    echo "  lint-fix      Run linter, fix errors, commit fixes"
    echo "  typecheck     Run tsc --noEmit, fix type errors, commit fixes"
    echo "  deploy-dev    Run /preflight, then deploy to dev environment"
    echo "  e2e-validate  Full E2E: deploy, live calls, callback verification, auto-fix (use --max-turns 80)"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --max-turns)
            MAX_TURNS="$2"
            shift 2
            ;;
        --output-format)
            OUTPUT_FORMAT="$2"
            shift 2
            ;;
        --prompt-file)
            PROMPT_FILE="$2"
            shift 2
            ;;
        --task)
            TASK_NAME="$2"
            shift 2
            ;;
        --list-tasks)
            list_tasks
            exit 0
            ;;
        --help)
            usage
            exit 0
            ;;
        -*)
            echo -e "${RED}Error: Unknown option: $1${NC}" >&2
            usage
            exit 1
            ;;
        *)
            PROMPT="$1"
            shift
            ;;
    esac
done

# --- Validation ---

# Must be in project root
if [ ! -f "package.json" ] || [ ! -d ".claude" ]; then
    echo -e "${RED}Error: Must be run from the twilio-agent-factory root directory${NC}" >&2
    exit 1
fi

# Claude CLI must be available
if ! command -v claude &> /dev/null; then
    echo -e "${RED}Error: 'claude' command not found. Install Claude Code first.${NC}" >&2
    exit 1
fi

# Acknowledgment via env var (CI/CD pattern — no interactive prompt)
if [ "$CLAUDE_HEADLESS_ACKNOWLEDGED" != "true" ]; then
    echo -e "${RED}Error: CLAUDE_HEADLESS_ACKNOWLEDGED=true is required.${NC}" >&2
    echo "" >&2
    echo "Headless mode runs Claude Code non-interactively with pre-approved permissions." >&2
    echo "Set the environment variable to confirm you accept the risks:" >&2
    echo "" >&2
    echo "  CLAUDE_HEADLESS_ACKNOWLEDGED=true ./scripts/run-headless.sh ..." >&2
    echo "" >&2
    echo "Risks: Twilio API calls (charges apply), real calls/SMS, git commits." >&2
    exit 1
fi

# Resolve prompt from --task, --prompt-file, or positional argument
if [ -n "$TASK_NAME" ]; then
    PROMPT=$(resolve_task_prompt "$TASK_NAME")
    if [ -z "$PROMPT" ]; then
        echo -e "${RED}Error: Unknown task '$TASK_NAME'. Use --list-tasks to see available tasks.${NC}" >&2
        exit 1
    fi
elif [ -n "$PROMPT_FILE" ]; then
    if [ ! -f "$PROMPT_FILE" ]; then
        echo -e "${RED}Error: Prompt file not found: $PROMPT_FILE${NC}" >&2
        exit 1
    fi
    PROMPT=$(cat "$PROMPT_FILE")
fi

if [ -z "$PROMPT" ]; then
    echo -e "${RED}Error: No prompt provided. Use a quoted string, --task, or --prompt-file.${NC}" >&2
    usage
    exit 1
fi

# --- Session setup ---

mkdir -p .claude/autonomous-sessions

SESSION_ID="headless-$(date +%Y%m%d-%H%M%S)"
SESSION_LOG=".claude/autonomous-sessions/${SESSION_ID}.log"

{
    echo "================================================================================"
    echo "Headless Session: ${SESSION_ID}"
    echo "Started: $(date -Iseconds)"
    echo "Acknowledged via: CLAUDE_HEADLESS_ACKNOWLEDGED env var"
    echo "Max turns: ${MAX_TURNS}"
    echo "Output format: ${OUTPUT_FORMAT}"
    if [ -n "$TASK_NAME" ]; then
        echo "Task: ${TASK_NAME}"
    fi
    if [ -n "$PROMPT_FILE" ]; then
        echo "Prompt file: ${PROMPT_FILE}"
    fi
    echo "Prompt: ${PROMPT}"
    echo "================================================================================"
    echo ""
} > "$SESSION_LOG"

echo -e "${CYAN}Headless session: ${SESSION_ID}${NC}"
echo -e "${DIM}Audit log: ${SESSION_LOG}${NC}"
echo -e "${DIM}Max turns: ${MAX_TURNS}${NC}"
echo ""

# --- Launch claude -p ---

# Same --allowedTools list as enable-autonomous.sh (duplicated intentionally —
# both scripts need the full list and extracting to a shared file adds complexity
# for minimal gain).

claude -p "$PROMPT" \
       --max-turns "$MAX_TURNS" \
       --output-format "$OUTPUT_FORMAT" \
       --allowedTools "Bash(npm test*)" \
       --allowedTools "Bash(npm test:*)" \
       --allowedTools "Bash(npm run lint*)" \
       --allowedTools "Bash(npm run build*)" \
       --allowedTools "Bash(npm run dev*)" \
       --allowedTools "Bash(npm run setup*)" \
       --allowedTools "Bash(npm run setup:*)" \
       --allowedTools "Bash(npm run deploy*)" \
       --allowedTools "Bash(npm run deploy:*)" \
       --allowedTools "Bash(npm install*)" \
       --allowedTools "Bash(npm --version*)" \
       --allowedTools "Bash(npx jest*)" \
       --allowedTools "Bash(npx jest:*)" \
       --allowedTools "Bash(npx tsc*)" \
       --allowedTools "Bash(npx tsc:*)" \
       --allowedTools "Bash(npx eslint*)" \
       --allowedTools "Bash(npx ngrok*)" \
       --allowedTools "Bash(npx ngrok:*)" \
       --allowedTools "Bash(npx ts-node*)" \
       --allowedTools "Bash(npx ts-node:*)" \
       --allowedTools "Bash(twilio serverless:*)" \
       --allowedTools "Bash(twilio profiles:*)" \
       --allowedTools "Bash(twilio api:*)" \
       --allowedTools "Bash(twilio phone-numbers:*)" \
       --allowedTools "Bash(twilio debugger:*)" \
       --allowedTools "Bash(twilio plugins:*)" \
       --allowedTools "Bash(twilio --version*)" \
       --allowedTools "Bash(git add*)" \
       --allowedTools "Bash(git add:*)" \
       --allowedTools "Bash(git commit*)" \
       --allowedTools "Bash(git commit:*)" \
       --allowedTools "Bash(git status*)" \
       --allowedTools "Bash(git diff*)" \
       --allowedTools "Bash(git log*)" \
       --allowedTools "Bash(git branch*)" \
       --allowedTools "Bash(git checkout*)" \
       --allowedTools "Bash(git stash*)" \
       --allowedTools "Bash(git stash:*)" \
       --allowedTools "Bash(git pull*)" \
       --allowedTools "Bash(git pull:*)" \
       --allowedTools "Bash(git push*)" \
       --allowedTools "Bash(git push:*)" \
       --allowedTools "Bash(git remote*)" \
       --allowedTools "Bash(git show*)" \
       --allowedTools "Bash(gh auth*)" \
       --allowedTools "Bash(gh auth:*)" \
       --allowedTools "Bash(gh repo*)" \
       --allowedTools "Bash(gh repo:*)" \
       --allowedTools "Bash(ls*)" \
       --allowedTools "Bash(ls:*)" \
       --allowedTools "Bash(cat*)" \
       --allowedTools "Bash(head*)" \
       --allowedTools "Bash(tail*)" \
       --allowedTools "Bash(mkdir*)" \
       --allowedTools "Bash(pwd)" \
       --allowedTools "Bash(which*)" \
       --allowedTools "Bash(echo*)" \
       --allowedTools "Bash(echo:*)" \
       --allowedTools "Bash(tree*)" \
       --allowedTools "Bash(tree:*)" \
       --allowedTools "Bash(find*)" \
       --allowedTools "Bash(find:*)" \
       --allowedTools "Bash(grep*)" \
       --allowedTools "Bash(grep:*)" \
       --allowedTools "Bash(curl*)" \
       --allowedTools "Bash(curl:*)" \
       --allowedTools "Bash(jq*)" \
       --allowedTools "Bash(jq:*)" \
       --allowedTools "Bash(wc*)" \
       --allowedTools "Bash(wc:*)" \
       --allowedTools "Bash(chmod*)" \
       --allowedTools "Bash(chmod:*)" \
       --allowedTools "Bash(source*)" \
       --allowedTools "Bash(source:*)" \
       --allowedTools "Bash(node*)" \
       --allowedTools "Bash(node:*)" \
       --allowedTools "Bash(tee*)" \
       --allowedTools "Bash(tee:*)" \
       --allowedTools "Bash(lsof*)" \
       --allowedTools "Bash(lsof:*)" \
       --allowedTools "Bash(pkill*)" \
       --allowedTools "Bash(pkill:*)" \
       --allowedTools "Bash(ngrok*)" \
       --allowedTools "Bash(ngrok:*)" \
       --allowedTools "Bash(test*)" \
       --allowedTools "Bash(test:*)" \
       --allowedTools "Bash(xargs*)" \
       --allowedTools "Bash(xargs:*)" \
       --allowedTools "Bash(python3*)" \
       --allowedTools "Bash(python3:*)" \
       --allowedTools "Read" \
       --allowedTools "Write" \
       --allowedTools "Edit" \
       --allowedTools "Glob" \
       --allowedTools "Grep" \
       --allowedTools "WebSearch" \
       --allowedTools "WebFetch" \
       --allowedTools "Task" \
       --allowedTools "Skill" \
       2>&1 | tee -a "$SESSION_LOG"

EXIT_CODE=${PIPESTATUS[0]}

# --- Session end ---

{
    echo ""
    echo "================================================================================"
    echo "Session ended: $(date -Iseconds)"
    echo "Exit code: ${EXIT_CODE}"
    echo "================================================================================"
} >> "$SESSION_LOG"

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}Headless session complete.${NC}"
else
    echo -e "${RED}Headless session exited with code ${EXIT_CODE}.${NC}"
fi
echo -e "${DIM}Audit log: ${SESSION_LOG}${NC}"

exit $EXIT_CODE
