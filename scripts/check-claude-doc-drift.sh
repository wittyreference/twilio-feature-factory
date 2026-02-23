#!/bin/bash
# ABOUTME: Detects drift between actual directory contents and CLAUDE.md file inventories.
# ABOUTME: Reports files present but undocumented, and files documented but missing.

# Usage:
#   ./scripts/check-claude-doc-drift.sh          # Full report to stdout
#   ./scripts/check-claude-doc-drift.sh --quiet   # Only output drifted CLAUDE.md paths (for flywheel)
#   ./scripts/check-claude-doc-drift.sh --json     # Machine-readable JSON output

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

QUIET=false
JSON=false
for arg in "$@"; do
    case "$arg" in
        --quiet) QUIET=true ;;
        --json) JSON=true ;;
    esac
done

DRIFT_FOUND=false
DRIFT_REPORT=""
DRIFTED_PATHS=""

# Check a directory's CLAUDE.md against actual files
# Args: $1=directory (relative to PROJECT_ROOT), $2=file extension pattern, $3=CLAUDE.md path
check_directory() {
    local dir="$1"
    local ext="$2"
    local claude_md="$3"
    local abs_dir="$PROJECT_ROOT/$dir"
    local abs_claude="$PROJECT_ROOT/$claude_md"

    if [ ! -d "$abs_dir" ] || [ ! -f "$abs_claude" ]; then
        return
    fi

    # Get actual files (basename only)
    local actual_files
    actual_files=$(ls "$abs_dir"/*${ext} 2>/dev/null | xargs -I{} basename {} | sort)
    if [ -z "$actual_files" ]; then
        return
    fi

    # Extract documented filenames from CLAUDE.md
    # Matches filenames in backtick format (`filename.ext`) and tree format (├── filename.ext)
    # Allows dots in filenames for patterns like .protected.js, .private.js
    local escaped_ext="${ext//./\\.}"
    local documented_files
    documented_files=$( {
        grep -oE "\`[a-zA-Z][a-zA-Z0-9_.-]*${escaped_ext}\`" "$abs_claude" 2>/dev/null | tr -d '\`' || true
        grep -oE "    [├└]── [a-zA-Z][a-zA-Z0-9_.-]*${escaped_ext}" "$abs_claude" 2>/dev/null | sed 's/^.*[├└]── //' || true
    } | sort -u)

    # Find files present but not documented
    local undocumented
    undocumented=$(comm -23 <(echo "$actual_files") <(echo "$documented_files") 2>/dev/null || true)

    # Find files documented but not present
    local missing
    missing=$(comm -13 <(echo "$actual_files") <(echo "$documented_files") 2>/dev/null || true)

    if [ -n "$undocumented" ] || [ -n "$missing" ]; then
        DRIFT_FOUND=true
        DRIFTED_PATHS="${DRIFTED_PATHS}${claude_md}"$'\n'

        if [ "$QUIET" = false ]; then
            local undoc_count
            undoc_count=$(echo "$undocumented" | grep -c "." 2>/dev/null || echo "0")
            local missing_count
            missing_count=$(echo "$missing" | grep -c "." 2>/dev/null || echo "0")

            DRIFT_REPORT="${DRIFT_REPORT}## ${claude_md}"$'\n'
            if [ -n "$undocumented" ]; then
                DRIFT_REPORT="${DRIFT_REPORT}  Added since last doc update (${undoc_count}):"$'\n'
                while IFS= read -r f; do
                    [ -n "$f" ] && DRIFT_REPORT="${DRIFT_REPORT}    + ${f}"$'\n'
                done <<< "$undocumented"
            fi
            if [ -n "$missing" ]; then
                DRIFT_REPORT="${DRIFT_REPORT}  Removed since last doc update (${missing_count}):"$'\n'
                while IFS= read -r f; do
                    [ -n "$f" ] && DRIFT_REPORT="${DRIFT_REPORT}    - ${f}"$'\n'
                done <<< "$missing"
            fi
            DRIFT_REPORT="${DRIFT_REPORT}"$'\n'
        fi
    fi
}

# ============================================
# CHECK EACH SCOPED DIRECTORY
# ============================================

# Functions with file inventories
check_directory "functions/voice" ".js" "functions/voice/CLAUDE.md"
check_directory "functions/messaging" ".js" "functions/messaging/CLAUDE.md"
check_directory "functions/conversation-relay" ".js" "functions/conversation-relay/CLAUDE.md"
check_directory "functions/verify" ".js" "functions/verify/CLAUDE.md"
check_directory "functions/taskrouter" ".js" "functions/taskrouter/CLAUDE.md"
check_directory "functions/callbacks" ".js" "functions/callbacks/CLAUDE.md"
check_directory "functions/helpers" ".js" "functions/helpers/CLAUDE.md"

# MCP tool modules
check_directory "agents/mcp-servers/twilio/src/tools" ".ts" "agents/mcp-servers/twilio/CLAUDE.md"

# ============================================
# OUTPUT
# ============================================

if [ "$QUIET" = true ]; then
    # Output only drifted CLAUDE.md paths (one per line), for flywheel integration
    if [ -n "$DRIFTED_PATHS" ]; then
        echo "$DRIFTED_PATHS" | grep -v "^$"
    fi
elif [ "$JSON" = true ]; then
    if [ "$DRIFT_FOUND" = true ]; then
        echo '{"drift": true, "paths": ['
        echo "$DRIFTED_PATHS" | grep -v "^$" | sed 's/.*/"&"/' | paste -sd, -
        echo ']}'
    else
        echo '{"drift": false, "paths": []}'
    fi
else
    if [ "$DRIFT_FOUND" = true ]; then
        echo "CLAUDE.md inventory drift detected:"
        echo ""
        echo "$DRIFT_REPORT"
        echo "Run the documentation audit to fix these."
    else
        echo "No CLAUDE.md inventory drift detected. All file inventories are current."
    fi
fi

if [ "$DRIFT_FOUND" = true ]; then
    exit 1
else
    exit 0
fi
