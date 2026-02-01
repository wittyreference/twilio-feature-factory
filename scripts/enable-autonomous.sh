#!/bin/bash
# ABOUTME: Enable autonomous mode for Claude Code sessions.
# ABOUTME: Displays warning, requires acknowledgment, launches with expanded permissions.

set -e

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Box characters
BOX_TL='╔'
BOX_TR='╗'
BOX_BL='╚'
BOX_BR='╝'
BOX_H='═'
BOX_V='║'
BOX_ML='╠'
BOX_MR='╣'

# Acknowledgment phrase
ACKNOWLEDGMENT_PHRASE="I ACKNOWLEDGE THE RISKS"

# Print horizontal line
print_line() {
    local width=72
    printf "${BOX_V}"
    printf "${BOX_H}%.0s" $(seq 1 $width)
    printf "${BOX_V}\n"
}

# Print text line with padding
print_text() {
    local text="$1"
    local width=72
    # Strip ANSI codes for length calculation
    local visible_text=$(echo -e "$text" | sed 's/\x1b\[[0-9;]*m//g')
    local visible_len=${#visible_text}
    local padding=$((width - visible_len - 2))
    local left_pad=2
    local right_pad=$((padding - left_pad))
    if [ $right_pad -lt 0 ]; then right_pad=0; fi
    printf "${BOX_V}%${left_pad}s%b%${right_pad}s${BOX_V}\n" "" "$text" ""
}

# Print centered text
print_centered() {
    local text="$1"
    local width=72
    local visible_text=$(echo -e "$text" | sed 's/\x1b\[[0-9;]*m//g')
    local visible_len=${#visible_text}
    local padding=$((width - visible_len))
    local left_pad=$((padding / 2))
    local right_pad=$((padding - left_pad))
    printf "${BOX_V}%${left_pad}s%b%${right_pad}s${BOX_V}\n" "" "$text" ""
}

# Display warning
display_warning() {
    local width=72

    echo ""
    printf "${BOX_TL}"
    printf "${BOX_H}%.0s" $(seq 1 $width)
    printf "${BOX_TR}\n"

    print_centered "${YELLOW}${BOLD}  AUTONOMOUS MODE WARNING  ${NC}"

    printf "${BOX_ML}"
    printf "${BOX_H}%.0s" $(seq 1 $width)
    printf "${BOX_MR}\n"

    print_text ""
    print_text "This mode runs Claude Code WITHOUT permission prompts."
    print_text ""
    print_text "${RED}REAL MONEY${NC}: Twilio API calls will be made (charges apply)."
    print_text "${RED}REAL HUMANS${NC}: Test calls/SMS may reach real phone numbers."
    print_text "${RED}COMPLIANCE${NC}: Ensure test numbers are properly isolated."
    print_text ""
    print_text "${CYAN}Quality gates STILL ENFORCED:${NC}"
    print_text "${GREEN}✓${NC} TDD (tests must fail first, then pass)"
    print_text "${GREEN}✓${NC} Linting (must pass)"
    print_text "${GREEN}✓${NC} Coverage (80% threshold)"
    print_text "${GREEN}✓${NC} Credential safety (secrets never committed)"
    print_text "${GREEN}✓${NC} Documentation flywheel (learnings captured)"
    print_text ""
    print_text "${CYAN}Pre-approved commands:${NC}"
    print_text "• npm test, npm run lint, npm run build"
    print_text "• twilio serverless:deploy, twilio profiles:*"
    print_text "• git add, git commit, git status, git diff, git log"
    print_text "• Read, Write, Edit, Glob, Grep (all files)"
    print_text ""
    print_text "${CYAN}Still blocked (require explicit approval):${NC}"
    print_text "• git push --force, git reset --hard"
    print_text "• rm -rf, destructive operations"
    print_text "• Network requests to unknown hosts"
    print_text ""

    printf "${BOX_BL}"
    printf "${BOX_H}%.0s" $(seq 1 $width)
    printf "${BOX_BR}\n"
    echo ""
}

# Countdown before prompt
countdown() {
    local seconds=5
    while [ $seconds -gt 0 ]; do
        printf "\r${DIM}Starting in ${seconds} seconds...${NC}    "
        sleep 1
        ((seconds--))
    done
    printf "\r                                        \r"
}

# Prompt for acknowledgment
prompt_acknowledgment() {
    local max_attempts=3
    local attempts=0

    while [ $attempts -lt $max_attempts ]; do
        remaining=$((max_attempts - attempts))
        echo ""
        echo -e "${YELLOW}To proceed, type: ${BOLD}${ACKNOWLEDGMENT_PHRASE}${NC}"
        echo -e "${DIM}(${remaining} attempts remaining)${NC}"
        echo ""
        printf "> "
        read -r response

        if [ "$response" = "$ACKNOWLEDGMENT_PHRASE" ]; then
            echo ""
            echo -e "${GREEN}${BOLD}Acknowledgment received. Launching autonomous mode.${NC}"
            echo ""
            return 0
        fi

        ((attempts++))
        if [ $attempts -lt $max_attempts ]; then
            echo ""
            echo -e "${RED}Incorrect. Please type exactly: ${ACKNOWLEDGMENT_PHRASE}${NC}"
        fi
    done

    echo ""
    echo -e "${RED}Acknowledgment failed after ${max_attempts} attempts. Autonomous mode cancelled.${NC}"
    exit 1
}

# Main
main() {
    # Check if we're in the right directory
    if [ ! -f "package.json" ] || [ ! -d ".claude" ]; then
        echo -e "${RED}Error: Must be run from the twilio-agent-factory root directory${NC}"
        exit 1
    fi

    # Check if claude is available
    if ! command -v claude &> /dev/null; then
        echo -e "${RED}Error: 'claude' command not found. Please install Claude Code first.${NC}"
        exit 1
    fi

    # Display warning
    display_warning

    # Countdown
    countdown

    # Prompt for acknowledgment
    prompt_acknowledgment

    # Export environment variable
    export CLAUDE_AUTONOMOUS_ACKNOWLEDGED=true
    export CLAUDE_AUTONOMOUS_SESSION_START=$(date +%s)

    # Create audit log directory
    mkdir -p .claude/autonomous-sessions

    # Create session log
    SESSION_ID="autonomous-$(date +%Y%m%d-%H%M%S)"
    SESSION_LOG=".claude/autonomous-sessions/${SESSION_ID}.log"

    echo "================================================================================" > "$SESSION_LOG"
    echo "Autonomous Session: ${SESSION_ID}" >> "$SESSION_LOG"
    echo "Started: $(date -Iseconds)" >> "$SESSION_LOG"
    echo "Acknowledged via: interactive" >> "$SESSION_LOG"
    echo "================================================================================" >> "$SESSION_LOG"

    echo -e "${CYAN}Session ID: ${SESSION_ID}${NC}"
    echo -e "${DIM}Audit log: ${SESSION_LOG}${NC}"
    echo ""

    # Launch Claude Code with autonomous permissions
    # The --allowedTools flag pre-approves specific tool patterns
    claude --allowedTools "Bash(npm test*)" \
           --allowedTools "Bash(npm run lint*)" \
           --allowedTools "Bash(npm run build*)" \
           --allowedTools "Bash(npm run dev*)" \
           --allowedTools "Bash(npx jest*)" \
           --allowedTools "Bash(npx tsc*)" \
           --allowedTools "Bash(npx eslint*)" \
           --allowedTools "Bash(twilio serverless:*)" \
           --allowedTools "Bash(twilio profiles:*)" \
           --allowedTools "Bash(twilio api:*)" \
           --allowedTools "Bash(git add *)" \
           --allowedTools "Bash(git commit *)" \
           --allowedTools "Bash(git status*)" \
           --allowedTools "Bash(git diff*)" \
           --allowedTools "Bash(git log*)" \
           --allowedTools "Bash(git branch*)" \
           --allowedTools "Bash(git checkout*)" \
           --allowedTools "Bash(git stash*)" \
           --allowedTools "Bash(ls *)" \
           --allowedTools "Bash(cat *)" \
           --allowedTools "Bash(head *)" \
           --allowedTools "Bash(tail *)" \
           --allowedTools "Bash(mkdir *)" \
           --allowedTools "Bash(pwd)" \
           --allowedTools "Bash(which *)" \
           --allowedTools "Bash(echo *)" \
           --allowedTools "Read" \
           --allowedTools "Write" \
           --allowedTools "Edit" \
           --allowedTools "Glob" \
           --allowedTools "Grep" \
           --allowedTools "WebSearch" \
           --allowedTools "WebFetch" \
           --allowedTools "Task" \
           --allowedTools "Skill" \
           "$@"

    # Log session end
    echo "" >> "$SESSION_LOG"
    echo "================================================================================" >> "$SESSION_LOG"
    echo "Session ended: $(date -Iseconds)" >> "$SESSION_LOG"
    echo "================================================================================" >> "$SESSION_LOG"

    echo ""
    echo -e "${GREEN}Autonomous session complete.${NC}"
    echo -e "${DIM}Audit log saved to: ${SESSION_LOG}${NC}"
}

main "$@"
