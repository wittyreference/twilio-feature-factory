#!/bin/bash
# ABOUTME: Provides end-of-session documentation review summary.
# ABOUTME: Lists files changed and suggests which docs may need updates.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Get files modified in this session (uncommitted changes)
cd "$PROJECT_ROOT" || exit 0

# Check if we're in a git repo
if [ ! -d ".git" ]; then
    exit 0
fi

# Get list of modified/added/untracked files - include new files!
CHANGED_FILES=$(git status --porcelain 2>/dev/null | grep -E "^(M|A| M| A|\?\?)" | awk '{print $NF}')

if [ -z "$CHANGED_FILES" ]; then
    exit 0
fi

# Helper to output to both stdout and stderr for visibility
output() {
    echo "$1"
    echo "$1" >&2
}

# Analyze changes and suggest doc updates
output ""
output "SESSION DOCUMENTATION REVIEW"
output "========================================"
output ""

# Check for MCP server changes
if echo "$CHANGED_FILES" | grep -q "agents/mcp-servers"; then
    output "MCP Server changes detected:"
    output "   -> Update API_REFERENCE.md if new tools added"
    output "   -> Update TOOL_BOUNDARIES.md if behavior changed"
    output ""
fi

# Check for Feature Factory changes
if echo "$CHANGED_FILES" | grep -q "agents/feature-factory"; then
    output "Feature Factory changes detected:"
    output "   -> Update agents/feature-factory/CLAUDE.md"
    output "   -> Update todo.md session log"
    output ""
fi

# Check for function changes
if echo "$CHANGED_FILES" | grep -q "functions/"; then
    output "Function changes detected:"
    output "   -> Update relevant functions/*/CLAUDE.md"
    output ""
fi

# Check for hook changes
if echo "$CHANGED_FILES" | grep -q ".claude/hooks"; then
    output "Hook changes detected:"
    output "   -> Update root CLAUDE.md hooks documentation"
    output ""
fi

# Check for architectural changes (new directories, major refactors)
if echo "$CHANGED_FILES" | grep -qE "^agents/.*/(index|orchestrator|config)"; then
    output "Architectural changes detected:"
    output "   -> Update DESIGN_DECISIONS.md with rationale"
    output ""
fi

# Check for validation changes
if echo "$CHANGED_FILES" | grep -q "validation/"; then
    output "Validation changes detected:"
    output "   -> Update DESIGN_DECISIONS.md (deep validation)"
    output ""
fi

# Count uncommitted files
UNCOMMITTED_COUNT=$(echo "$CHANGED_FILES" | wc -l | tr -d ' ')

# List key docs that might need review
output "Session summary:"
output "   * $UNCOMMITTED_COUNT uncommitted file(s)"
output "   * Check todo.md for session log update"
output "   * Review learnings.md for promotion"
output ""
output "========================================"

exit 0
