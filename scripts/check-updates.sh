#!/bin/bash
# ABOUTME: Checks the local version against the latest GitHub release and prompts to update.
# ABOUTME: Caches results to avoid hitting GitHub API on every invocation.

set -euo pipefail

# --- Configuration ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_OWNER="wittyreference"
REPO_NAME="twilio-feature-factory"
VERSION_FILE="$PROJECT_ROOT/package.json"
CACHE_DIR="$PROJECT_ROOT/.claude/.update-cache"
CACHE_FILE="$CACHE_DIR/latest-release.json"
CACHE_TTL_SECONDS=14400  # 4 hours

# --- Flags ---
QUIET=false
FORCE=false
for arg in "$@"; do
    case "$arg" in
        --quiet) QUIET=true ;;
        --force) FORCE=true ;;
        --help)
            echo "Usage: check-updates.sh [--quiet] [--force]"
            echo ""
            echo "  --quiet   Only output if an update is available (for session-start hooks)"
            echo "  --force   Bypass cache and check GitHub now"
            echo ""
            exit 0
            ;;
    esac
done

# --- Helpers ---
log() {
    if [ "$QUIET" = false ]; then
        echo "$@"
    fi
}

log_stderr() {
    echo "$@" >&2
}

# --- Read local version ---
if [ ! -f "$VERSION_FILE" ]; then
    log "ERROR: Cannot find $VERSION_FILE"
    exit 1
fi

LOCAL_VERSION=$(jq -r '.version // empty' "$VERSION_FILE" 2>/dev/null)
if [ -z "$LOCAL_VERSION" ]; then
    log "ERROR: Cannot read version from $VERSION_FILE"
    exit 1
fi

# --- Semver comparison ---
# Returns 0 if $1 < $2 (update available), 1 otherwise
semver_lt() {
    local IFS='.'
    local i
    local v1=($1) v2=($2)
    # Zero-pad to 3 parts
    for i in 0 1 2; do
        v1[$i]=${v1[$i]:-0}
        v2[$i]=${v2[$i]:-0}
    done
    for i in 0 1 2; do
        if (( ${v1[$i]} < ${v2[$i]} )); then
            return 0
        elif (( ${v1[$i]} > ${v2[$i]} )); then
            return 1
        fi
    done
    return 1  # Equal = no update
}

# --- Check cache ---
use_cache() {
    if [ "$FORCE" = true ]; then
        return 1
    fi
    if [ ! -f "$CACHE_FILE" ]; then
        return 1
    fi
    local cache_ts
    cache_ts=$(jq -r '.checked_at // 0' "$CACHE_FILE" 2>/dev/null)
    local now
    now=$(date +%s)
    local age=$(( now - cache_ts ))
    if [ "$age" -lt "$CACHE_TTL_SECONDS" ]; then
        return 0
    fi
    return 1
}

# --- Fetch latest release from GitHub ---
fetch_latest_release() {
    local remote_version=""
    local release_url=""
    local release_name=""

    # Try gh CLI first (handles auth automatically)
    if command -v gh >/dev/null 2>&1; then
        local release_json
        release_json=$(gh api "repos/$REPO_OWNER/$REPO_NAME/releases/latest" 2>/dev/null) || true
        if [ -n "$release_json" ]; then
            remote_version=$(echo "$release_json" | jq -r '.tag_name // empty' 2>/dev/null)
            release_url=$(echo "$release_json" | jq -r '.html_url // empty' 2>/dev/null)
            release_name=$(echo "$release_json" | jq -r '.name // empty' 2>/dev/null)
        fi
    fi

    # Fallback to curl (unauthenticated, lower rate limit)
    if [ -z "$remote_version" ] && command -v curl >/dev/null 2>&1; then
        local release_json
        release_json=$(curl -sf "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases/latest" 2>/dev/null) || true
        if [ -n "$release_json" ]; then
            remote_version=$(echo "$release_json" | jq -r '.tag_name // empty' 2>/dev/null)
            release_url=$(echo "$release_json" | jq -r '.html_url // empty' 2>/dev/null)
            release_name=$(echo "$release_json" | jq -r '.name // empty' 2>/dev/null)
        fi
    fi

    # Strip leading 'v' from tag (e.g., v1.2.0 -> 1.2.0)
    remote_version="${remote_version#v}"

    echo "$remote_version|$release_url|$release_name"
}

# --- Write cache ---
write_cache() {
    local version="$1"
    local url="$2"
    local name="$3"
    mkdir -p "$CACHE_DIR"
    cat > "$CACHE_FILE" <<CACHEEOF
{
  "version": "$version",
  "url": "$url",
  "name": "$name",
  "checked_at": $(date +%s)
}
CACHEEOF
}

# --- Main ---
REMOTE_VERSION=""
RELEASE_URL=""
RELEASE_NAME=""

if use_cache; then
    REMOTE_VERSION=$(jq -r '.version // empty' "$CACHE_FILE" 2>/dev/null)
    RELEASE_URL=$(jq -r '.url // empty' "$CACHE_FILE" 2>/dev/null)
    RELEASE_NAME=$(jq -r '.name // empty' "$CACHE_FILE" 2>/dev/null)
    log "Using cached release info (use --force to refresh)"
else
    IFS='|' read -r REMOTE_VERSION RELEASE_URL RELEASE_NAME <<< "$(fetch_latest_release)"
    if [ -n "$REMOTE_VERSION" ]; then
        write_cache "$REMOTE_VERSION" "$RELEASE_URL" "$RELEASE_NAME"
    fi
fi

# --- No releases published yet ---
if [ -z "$REMOTE_VERSION" ]; then
    log "No GitHub releases found for $REPO_OWNER/$REPO_NAME."
    log "Current local version: $LOCAL_VERSION"
    # Cache the "no release" result too
    write_cache "" "" ""
    exit 0
fi

# --- Compare versions ---
if semver_lt "$LOCAL_VERSION" "$REMOTE_VERSION"; then
    # Update available — always print, even in quiet mode
    log_stderr ""
    log_stderr "UPDATE AVAILABLE: $REPO_NAME $LOCAL_VERSION -> $REMOTE_VERSION"
    if [ -n "$RELEASE_NAME" ]; then
        log_stderr "  Release: $RELEASE_NAME"
    fi
    log_stderr "  Update:  cd $(pwd) && ./scripts/update.sh"
    if [ -n "$RELEASE_URL" ]; then
        log_stderr "  Details: $RELEASE_URL"
    fi
    log_stderr ""
    exit 2  # Special exit code: update available
else
    log "Up to date ($LOCAL_VERSION)"
    exit 0
fi
