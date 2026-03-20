#!/bin/bash
# ABOUTME: Self-contained updater that handles clone, fork, and template installs uniformly.
# ABOUTME: Detects remote setup, stashes local changes, merges upstream, and runs npm install.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
UPSTREAM_URL="https://github.com/wittyreference/twilio-feature-factory.git"
UPSTREAM_REMOTE="upstream"
DEFAULT_BRANCH="main"

# --- Helpers ---
info()  { echo "  $*"; }
warn()  { echo "  WARNING: $*" >&2; }
error() { echo "  ERROR: $*" >&2; exit 1; }

# --- Pre-flight ---
cd "$PROJECT_ROOT"

if [ ! -d .git ]; then
    error "Not a git repository. Cannot update."
fi

echo ""
echo "Checking for updates..."
echo ""

# --- Ensure we have a remote pointing to the source repo ---
ORIGIN_URL=$(git remote get-url origin 2>/dev/null || echo "")

# Normalize URLs for comparison (strip .git suffix and trailing slashes)
normalize_url() {
    echo "$1" | sed 's/\.git$//' | sed 's:/*$::'
}

ORIGIN_NORMALIZED=$(normalize_url "$ORIGIN_URL")
UPSTREAM_NORMALIZED=$(normalize_url "$UPSTREAM_URL")

if [ "$ORIGIN_NORMALIZED" = "$UPSTREAM_NORMALIZED" ]; then
    # Direct clone — origin IS upstream
    FETCH_REMOTE="origin"
    info "Direct clone detected (origin = source repo)"
else
    # Fork or template — need upstream remote
    EXISTING_UPSTREAM_URL=$(git remote get-url "$UPSTREAM_REMOTE" 2>/dev/null || echo "")
    if [ -z "$EXISTING_UPSTREAM_URL" ]; then
        info "Adding '$UPSTREAM_REMOTE' remote -> $UPSTREAM_URL"
        git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
    else
        EXISTING_NORMALIZED=$(normalize_url "$EXISTING_UPSTREAM_URL")
        if [ "$EXISTING_NORMALIZED" != "$UPSTREAM_NORMALIZED" ]; then
            warn "'$UPSTREAM_REMOTE' remote points to $EXISTING_UPSTREAM_URL (expected $UPSTREAM_URL)"
            warn "Updating '$UPSTREAM_REMOTE' remote URL"
            git remote set-url "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
        fi
    fi
    FETCH_REMOTE="$UPSTREAM_REMOTE"
    info "Fork/template detected (fetching from '$FETCH_REMOTE')"
fi

# --- Fetch latest ---
info "Fetching from $FETCH_REMOTE..."
git fetch "$FETCH_REMOTE" "$DEFAULT_BRANCH" --tags --quiet

# --- Check if update is needed ---
LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(git rev-parse "$FETCH_REMOTE/$DEFAULT_BRANCH")

if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
    echo ""
    info "Already up to date."
    echo ""
    exit 0
fi

# Count how many commits behind
BEHIND_COUNT=$(git rev-list --count HEAD.."$FETCH_REMOTE/$DEFAULT_BRANCH")
info "$BEHIND_COUNT new commit(s) available"

# --- Stash local changes if any ---
STASHED=false
if ! git diff --quiet || ! git diff --cached --quiet; then
    info "Stashing local changes..."
    git stash push -m "auto-stash before update $(date +%Y-%m-%d-%H%M%S)" --quiet
    STASHED=true
fi

# --- Merge ---
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
if [ "$CURRENT_BRANCH" != "$DEFAULT_BRANCH" ]; then
    warn "You're on branch '$CURRENT_BRANCH', not '$DEFAULT_BRANCH'."
    warn "Merging $FETCH_REMOTE/$DEFAULT_BRANCH into current branch."
fi

echo ""
info "Merging $FETCH_REMOTE/$DEFAULT_BRANCH..."
if git merge "$FETCH_REMOTE/$DEFAULT_BRANCH" --no-edit; then
    info "Merge successful."
else
    echo ""
    warn "Merge conflicts detected. Resolve them manually, then run:"
    warn "  git add . && git commit"
    if [ "$STASHED" = true ]; then
        warn "Your stashed changes can be restored with: git stash pop"
    fi
    exit 1
fi

# --- Restore stashed changes ---
if [ "$STASHED" = true ]; then
    info "Restoring stashed changes..."
    if git stash pop --quiet; then
        info "Stash restored."
    else
        warn "Stash pop had conflicts. Resolve with: git stash show -p | git apply"
    fi
fi

# --- Post-update: npm install ---
if [ -f "$PROJECT_ROOT/package.json" ]; then
    info "Running npm install..."
    npm install --quiet 2>/dev/null
    info "Dependencies updated."
fi

# --- Clear update cache so next session-start sees fresh state ---
rm -rf "$PROJECT_ROOT/.claude/.update-cache"

# --- Summary ---
echo ""
echo "Update complete. $BEHIND_COUNT commit(s) merged from $FETCH_REMOTE/$DEFAULT_BRANCH."

# Show what changed (abbreviated)
echo ""
echo "Recent changes:"
git log --oneline "$LOCAL_HEAD".."$REMOTE_HEAD" | head -10
TOTAL=$(git log --oneline "$LOCAL_HEAD".."$REMOTE_HEAD" | wc -l | tr -d ' ')
if [ "$TOTAL" -gt 10 ]; then
    echo "  ... and $(( TOTAL - 10 )) more"
fi
echo ""
