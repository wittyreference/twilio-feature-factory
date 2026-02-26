#!/bin/bash
# ABOUTME: Detects drift between factory files and their plugin counterparts.
# ABOUTME: Reads plugin-sync-map.json and reports which mapped files changed since last sync.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SYNC_MAP="$PROJECT_ROOT/.claude/plugin-sync-map.json"
SYNC_STATE="$PROJECT_ROOT/.claude/plugin-sync-state.json"

# Require jq
if ! command -v jq &>/dev/null; then
    echo "ERROR: jq is required for plugin drift detection" >&2
    exit 0
fi

# Require sync map
if [[ ! -f "$SYNC_MAP" ]]; then
    echo "ERROR: Plugin sync map not found at $SYNC_MAP" >&2
    exit 0
fi

# Read last sync commit (default to empty = check all history)
LAST_SYNC_COMMIT=""
if [[ -f "$SYNC_STATE" ]]; then
    LAST_SYNC_COMMIT=$(jq -r '.last_sync_commit // empty' "$SYNC_STATE" 2>/dev/null)
fi

# Validate last sync commit still exists in git history
if [[ -n "$LAST_SYNC_COMMIT" ]]; then
    if ! git -C "$PROJECT_ROOT" cat-file -t "$LAST_SYNC_COMMIT" &>/dev/null; then
        echo "WARNING: Last sync commit $LAST_SYNC_COMMIT not found in git history" >&2
        LAST_SYNC_COMMIT=""
    fi
fi

# Extract all factory paths from sync map (all categories)
FACTORY_PATHS=$(jq -r '.mappings | to_entries[] | .value[] | .factory' "$SYNC_MAP" 2>/dev/null)

if [[ -z "$FACTORY_PATHS" ]]; then
    echo "No mappings found in sync map" >&2
    exit 0
fi

# Check which mapped files have changed since last sync
DRIFTED_FILES=()
DRIFTED_DETAILS=()

while IFS= read -r factory_path; do
    [[ -z "$factory_path" ]] && continue

    if [[ -n "$LAST_SYNC_COMMIT" ]]; then
        CHANGES=$(git -C "$PROJECT_ROOT" log --oneline "${LAST_SYNC_COMMIT}..HEAD" -- "$factory_path" 2>/dev/null | wc -l | tr -d ' ')
    else
        # No sync state — treat all existing mapped files as potentially drifted
        if [[ -f "$PROJECT_ROOT/$factory_path" ]]; then
            CHANGES=1
        else
            CHANGES=0
        fi
    fi

    if [[ "$CHANGES" -gt 0 ]]; then
        DRIFTED_FILES+=("$factory_path")

        # Look up the plugin target and adaptation for this file
        PLUGIN_TARGET=$(jq -r --arg fp "$factory_path" \
            '.mappings | to_entries[] | .value[] | select(.factory == $fp) | .plugin' \
            "$SYNC_MAP" 2>/dev/null)
        ADAPTATION=$(jq -r --arg fp "$factory_path" \
            '.mappings | to_entries[] | .value[] | select(.factory == $fp) | .adaptation' \
            "$SYNC_MAP" 2>/dev/null)

        DRIFTED_DETAILS+=("$factory_path -> $PLUGIN_TARGET [$ADAPTATION] ($CHANGES commit(s))")
    fi
done <<< "$FACTORY_PATHS"

DRIFT_COUNT=${#DRIFTED_FILES[@]}

# Output mode: --count for just the number, --files for file list, default for full report
MODE="${1:---report}"

# Check MCP server source drift vs last npm publish
MCP_PKG="$PROJECT_ROOT/agents/mcp-servers/twilio/package.json"
MCP_SRC_DIR="agents/mcp-servers/twilio/src"
MCP_STALE=false
MCP_STALE_COUNT=0

if [[ -f "$MCP_PKG" ]]; then
    # Find the commit that last touched package.json (the publish commit)
    LAST_PUBLISH_COMMIT=$(git -C "$PROJECT_ROOT" log -1 --format="%H" -- "$MCP_PKG" 2>/dev/null)
    if [[ -n "$LAST_PUBLISH_COMMIT" ]]; then
        MCP_STALE_COUNT=$(git -C "$PROJECT_ROOT" log --oneline "${LAST_PUBLISH_COMMIT}..HEAD" -- "$MCP_SRC_DIR" 2>/dev/null | wc -l | tr -d ' ')
        if [[ "$MCP_STALE_COUNT" -gt 0 ]]; then
            MCP_STALE=true
        fi
    fi
fi

case "$MODE" in
    --count)
        echo "$DRIFT_COUNT"
        ;;
    --files)
        for f in "${DRIFTED_FILES[@]}"; do
            echo "$f"
        done
        ;;
    --check-files)
        # Check specific files (passed as remaining args) against sync map
        # Used by hooks to check if staged/modified files are syncable
        shift
        SYNCABLE_COUNT=0
        for check_file in "$@"; do
            if echo "$FACTORY_PATHS" | grep -qF "$check_file"; then
                SYNCABLE_COUNT=$((SYNCABLE_COUNT + 1))
            fi
        done
        echo "$SYNCABLE_COUNT"
        ;;
    --report|*)
        if [[ "$DRIFT_COUNT" -eq 0 ]] && [[ "$MCP_STALE" == "false" ]]; then
            echo "Plugin sync: No drift detected. Factory and plugin are in sync."
        else
            echo ""
            echo "PLUGIN DRIFT REPORT"
            echo "==================="
            echo ""
            if [[ "$DRIFT_COUNT" -gt 0 ]]; then
                echo "$DRIFT_COUNT factory file(s) changed since last sync"
                if [[ -n "$LAST_SYNC_COMMIT" ]]; then
                    LAST_SYNC_DATE=$(jq -r '.last_sync // "unknown"' "$SYNC_STATE" 2>/dev/null)
                    echo "Last sync: $LAST_SYNC_DATE (${LAST_SYNC_COMMIT:0:7})"
                else
                    echo "Last sync: never (no sync state found)"
                fi
                echo ""
                echo "Drifted files:"
                for detail in "${DRIFTED_DETAILS[@]}"; do
                    echo "  - $detail"
                done
                echo ""
                echo "Run /plugin-sync to review and apply changes."
            fi
            if [[ "$MCP_STALE" == "true" ]]; then
                MCP_VERSION=$(jq -r '.version' "$MCP_PKG" 2>/dev/null)
                echo ""
                echo "MCP SERVER STALE"
                echo "================"
                echo ""
                echo "Published: @twilio-feature-factory/mcp-twilio@${MCP_VERSION}"
                echo "Source changes since publish: $MCP_STALE_COUNT commit(s) in $MCP_SRC_DIR"
                echo ""
                echo "To republish: bump version in agents/mcp-servers/twilio/package.json, then npm publish from that dir."
            fi
        fi
        ;;
esac

exit 0
