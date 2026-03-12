#!/bin/bash
# ABOUTME: Monitors Claude Code and Agent SDK releases for new features relevant to our harness.
# ABOUTME: Cross-references changelog items against .claude/ config to identify integration opportunities.

set -uo pipefail

# --- Configuration ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CACHE_DIR="$PROJECT_ROOT/.claude/.update-cache"
STATE_FILE="$CACHE_DIR/changelog-state.json"
DIGEST_FILE="$CACHE_DIR/changelog-digest.md"
CACHE_TTL_SECONDS=86400  # 24 hours

REPOS=(
    "anthropics/claude-code|claude_code|CC"
    "anthropics/claude-agent-sdk|agent_sdk|SDK"
)

# --- Flags ---
QUIET=false
FORCE=false
for arg in "$@"; do
    case "$arg" in
        --quiet) QUIET=true ;;
        --force) FORCE=true ;;
        --help)
            echo "Usage: check-changelog.sh [--quiet] [--force]"
            echo ""
            echo "  --quiet   Only output if new integration opportunities found"
            echo "  --force   Bypass cache and check GitHub now"
            echo ""
            echo "Monitors anthropics/claude-code and anthropics/claude-agent-sdk"
            echo "for new features relevant to our harness configuration."
            exit 0
            ;;
    esac
done

# --- Helpers ---
log() {
    if [ "$QUIET" = false ]; then
        echo "$@" >&2
    fi
}

# --- Cache check ---
use_cache() {
    if [ "$FORCE" = true ]; then return 1; fi
    if [ ! -f "$STATE_FILE" ]; then return 1; fi
    local cache_ts
    cache_ts=$(jq -r '.checked_at // 0' "$STATE_FILE" 2>/dev/null)
    local now; now=$(date +%s)
    local age=$(( now - cache_ts ))
    [ "$age" -lt "$CACHE_TTL_SECONDS" ]
}

# --- Require gh CLI ---
if ! command -v gh >/dev/null 2>&1; then
    log "check-changelog: gh CLI not found, skipping"
    exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
    log "check-changelog: jq not found, skipping"
    exit 0
fi

# --- Check cache freshness ---
if use_cache; then
    # Check if there's a digest with opportunities to show
    if [ -f "$DIGEST_FILE" ] && grep -q "^###" "$DIGEST_FILE" 2>/dev/null; then
        OPP_COUNT=$(grep -c "^- \*\*" "$DIGEST_FILE" 2>/dev/null) || OPP_COUNT=0
        if [ "$OPP_COUNT" -gt 0 ]; then
            echo "CHANGELOG: $OPP_COUNT integration opportunity(ies) found. Run /check-updates to review." >&2
        fi
    fi
    log "Changelog cache is fresh (use --force to refresh)"
    exit 0
fi

# --- Initialize state ---
mkdir -p "$CACHE_DIR"
if [ ! -f "$STATE_FILE" ]; then
    cat > "$STATE_FILE" <<'INITEOF'
{
  "claude_code": { "last_checked_version": "0.0.0", "checked_at": 0 },
  "agent_sdk": { "last_checked_version": "0.0.0", "checked_at": 0 },
  "checked_at": 0
}
INITEOF
fi

# --- Categorize a changelog bullet ---
categorize_bullet() {
    local bullet="$1"
    case "$bullet" in
        *[Aa]dded*[Ss]etting*|*[Aa]dded*\`auto*|*[Aa]dded*\`CLAUDE_*|*[Aa]dded*\`include*)
            echo "SETTING" ;;
        *[Aa]dded*[Hh]ook*|*[Aa]dded*Hook*|*[Aa]dded*\`Pre*|*[Aa]dded*\`Post*|*[Aa]dded*\`Session*|*[Aa]dded*\`Stop*|*[Aa]dded*\`Config*)
            echo "HOOK" ;;
        *[Aa]dded*\`/*|*[Aa]dded*command*|*[Aa]dded*slash*)
            echo "COMMAND" ;;
        *[Aa]dded*tool*|*[Aa]dded*MCP*|*[Aa]dded*agent*|*[Aa]dded*subagent*)
            echo "CAPABILITY" ;;
        *[Cc]hanged*|*[Rr]enamed*|*[Mm]oved*)
            echo "CHANGE" ;;
        *[Dd]eprecated*|*[Rr]emoved*)
            echo "DEPRECATION" ;;
        *[Ff]ixed*)
            echo "FIX" ;;
        *)
            echo "OTHER" ;;
    esac
}

# --- Extract backtick-delimited identifier from a bullet ---
extract_identifier() {
    local bullet="$1"
    echo "$bullet" | grep -oE '\`[^\`]+\`' | head -1 | tr -d '`'
}

# --- Check if identifier is in our harness config ---
check_harness_reference() {
    local identifier="$1"
    if [ -z "$identifier" ]; then echo ""; return; fi
    local matches
    matches=$(grep -rl "$identifier" "$PROJECT_ROOT/.claude/" 2>/dev/null | head -3 | sed "s|$PROJECT_ROOT/||g" | tr '\n' ', ' | sed 's/,$//')
    echo "$matches"
}

# --- Semver comparison: returns 0 if $1 > $2 ---
semver_gt() {
    local IFS='.'
    local v1=($1) v2=($2)
    for i in 0 1 2; do
        v1[$i]=${v1[$i]:-0}
        v2[$i]=${v2[$i]:-0}
    done
    for i in 0 1 2; do
        if (( ${v1[$i]} > ${v2[$i]} )); then return 0; fi
        if (( ${v1[$i]} < ${v2[$i]} )); then return 1; fi
    done
    return 1  # Equal
}

# --- Main: Process each repo ---
DIGEST_CONTENT=""
TOTAL_OPPORTUNITIES=0
NOW_ISO=$(date -Iseconds 2>/dev/null || date +%Y-%m-%dT%H:%M:%S)

for repo_config in "${REPOS[@]}"; do
    IFS='|' read -r REPO STATE_KEY LABEL <<< "$repo_config"

    LAST_VERSION=$(jq -r ".${STATE_KEY}.last_checked_version // \"0.0.0\"" "$STATE_FILE" 2>/dev/null)
    log "Checking $REPO (last checked: v$LAST_VERSION)..."

    # Fetch releases from GitHub as a JSON array, extract bullets per release.
    # jq outputs one line per bullet: TAG<tab>BULLET_TEXT
    # This avoids multiline JSON parsing issues in bash.
    BULLETS_TSV=$(gh api "repos/$REPO/releases" --paginate \
        | jq -r --arg last "$LAST_VERSION" '
            .[] |
            (.tag_name | ltrimstr("v")) as $ver |
            # Simple semver comparison via split+tonumber
            (($ver | split(".") | map(tonumber)) as $v |
             ($last | split(".") | map(tonumber)) as $l |
             if $v[0] > $l[0] then true
             elif $v[0] == $l[0] and $v[1] > $l[1] then true
             elif $v[0] == $l[0] and $v[1] == $l[1] and $v[2] > $l[2] then true
             else false end) as $newer |
            select($newer) |
            .tag_name as $tag |
            (.body // "" | split("\n") | map(select(startswith("- "))) | .[]) |
            "\($tag)\t\(.[2:])"
        ' 2>/dev/null) || {
        log "  Failed to fetch releases for $REPO"
        continue
    }

    if [ -z "$BULLETS_TSV" ]; then
        log "  No new releases since v$LAST_VERSION"
        continue
    fi

    # Find the latest version in the results
    LATEST_VERSION=$(echo "$BULLETS_TSV" | cut -f1 | sed 's/^v//' | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)
    NEW_COUNT=$(echo "$BULLETS_TSV" | cut -f1 | sort -u | wc -l | tr -d ' ')

    DIGEST_CONTENT="${DIGEST_CONTENT}## $LABEL: v${LAST_VERSION} → v${LATEST_VERSION} ($NEW_COUNT new release(s))"$'\n\n'

    # Process bullets
    OPPORTUNITIES=""
    CHANGES=""
    FIXES=""

    while IFS=$'\t' read -r TAG CLEAN; do
        [ -z "$CLEAN" ] && continue

        CATEGORY=$(categorize_bullet "$CLEAN")
        IDENTIFIER=$(extract_identifier "$CLEAN")

        case "$CATEGORY" in
            SETTING|HOOK|COMMAND|CAPABILITY)
                HARNESS_REF=$(check_harness_reference "$IDENTIFIER")
                if [ -n "$HARNESS_REF" ]; then
                    OPPORTUNITIES="${OPPORTUNITIES}- **\`$IDENTIFIER\`** ($TAG) — Already referenced in: $HARNESS_REF"$'\n'
                else
                    OPPORTUNITIES="${OPPORTUNITIES}- **\`$IDENTIFIER\`** ($TAG) — NEW, not yet in harness. $CLEAN"$'\n'
                    TOTAL_OPPORTUNITIES=$((TOTAL_OPPORTUNITIES + 1))
                fi
                ;;
            CHANGE|DEPRECATION)
                CHANGES="${CHANGES}- ($TAG) $CLEAN"$'\n'
                ;;
            FIX)
                # Only surface fixes that reference things we use
                if [ -n "$IDENTIFIER" ]; then
                    HARNESS_REF=$(check_harness_reference "$IDENTIFIER")
                    if [ -n "$HARNESS_REF" ]; then
                        FIXES="${FIXES}- ($TAG) $CLEAN — affects: $HARNESS_REF"$'\n'
                    fi
                fi
                ;;
        esac
    done <<< "$BULLETS_TSV"

    # Write section to digest
    if [ -n "$OPPORTUNITIES" ]; then
        DIGEST_CONTENT="${DIGEST_CONTENT}### Integration Opportunities"$'\n\n'
        DIGEST_CONTENT="${DIGEST_CONTENT}${OPPORTUNITIES}"$'\n'
    fi

    if [ -n "$CHANGES" ]; then
        DIGEST_CONTENT="${DIGEST_CONTENT}### Behavioral Changes & Deprecations"$'\n\n'
        DIGEST_CONTENT="${DIGEST_CONTENT}${CHANGES}"$'\n'
    fi

    if [ -n "$FIXES" ]; then
        DIGEST_CONTENT="${DIGEST_CONTENT}### Relevant Fixes"$'\n\n'
        DIGEST_CONTENT="${DIGEST_CONTENT}${FIXES}"$'\n'
    fi

    # Update state for this repo
    jq ".${STATE_KEY}.last_checked_version = \"$LATEST_VERSION\" | .${STATE_KEY}.checked_at = $(date +%s)" "$STATE_FILE" > "${STATE_FILE}.tmp"
    mv "${STATE_FILE}.tmp" "$STATE_FILE"
done

# Update global checked_at
jq ".checked_at = $(date +%s)" "$STATE_FILE" > "${STATE_FILE}.tmp"
mv "${STATE_FILE}.tmp" "$STATE_FILE"

# --- Write digest ---
if [ -n "$DIGEST_CONTENT" ]; then
    cat > "$DIGEST_FILE" <<DIGESTEOF
# Changelog Digest — $NOW_ISO

$DIGEST_CONTENT
---
*Generated by check-changelog.sh. Run \`/check-updates\` to review.*
DIGESTEOF

    if [ "$TOTAL_OPPORTUNITIES" -gt 0 ]; then
        echo "CHANGELOG: $TOTAL_OPPORTUNITIES new integration opportunity(ies) in Claude Code/Agent SDK. Run /check-updates to review." >&2
    else
        log "Changelog checked — no new integration opportunities (changes/fixes logged to digest)."
    fi
else
    log "No new releases found across monitored repos."
fi

exit 0
