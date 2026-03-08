#!/usr/bin/env bash
# ABOUTME: Validates check-updates.sh and update.sh across three GitHub repos end-to-end.
# ABOUTME: Clones repos, creates fake releases, tests detection and update flow, then cleans up.

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

TIMESTAMP=$(date +%s)
TMP_DIR="/tmp/ff-update-validation-${TIMESTAMP}"
KEEP=false
VERBOSE=false

# Parse flags
for arg in "$@"; do
    case "$arg" in
        --keep) KEEP=true ;;
        --verbose) VERBOSE=true ;;
        --help|-h)
            echo "Usage: $0 [--keep] [--verbose]"
            echo ""
            echo "Validates check-updates.sh and update.sh across three GitHub repos."
            echo "Creates fake releases, tests update detection, runs update flow, cleans up."
            echo ""
            echo "  --keep     Don't delete the /tmp clones or fake releases when done"
            echo "  --verbose  Show full output from each script invocation"
            exit 0
            ;;
    esac
done

PASS=0
FAIL=0
TOTAL=0

test_result() {
    local name="$1"
    local expected="$2"
    local actual="$3"
    TOTAL=$((TOTAL + 1))

    if [ "$expected" = "$actual" ]; then
        echo -e "  ${GREEN}PASS${NC} $name"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $name"
        echo -e "       ${DIM}expected: $expected${NC}"
        echo -e "       ${DIM}actual:   $actual${NC}"
        FAIL=$((FAIL + 1))
    fi
}

# --- Repo configuration ---
REPOS=("twilio-feature-factory" "feature-factory" "twilio-claude-plugin")
REPO_OWNER="wittyreference"
FAKE_TAG="v99.0.0"
RELEASES_CREATED=""

# --- Cleanup ---
cleanup() {
    echo ""
    echo -e "${BOLD}Cleanup${NC}"

    if [ "$KEEP" = true ]; then
        if [ -n "$RELEASES_CREATED" ]; then
            echo -e "  ${YELLOW}--keep: Fake releases left on GitHub:${NC}"
            for repo in $RELEASES_CREATED; do
                echo -e "    ${DIM}gh release delete $FAKE_TAG --repo $REPO_OWNER/$repo --cleanup-tag -y${NC}"
            done
        fi
        if [ -d "$TMP_DIR" ]; then
            echo -e "  ${YELLOW}--keep: Clones at $TMP_DIR${NC}"
        fi
        return
    fi

    # Delete fake releases
    for repo in $RELEASES_CREATED; do
        echo -e "  Deleting $FAKE_TAG from $REPO_OWNER/$repo..."
        gh release delete "$FAKE_TAG" --repo "$REPO_OWNER/$repo" --cleanup-tag -y 2>/dev/null || true
    done

    # Remove tmp dir
    if [ -d "$TMP_DIR" ]; then
        echo -e "  Removing $TMP_DIR..."
        rm -rf "$TMP_DIR"
    fi

    echo -e "  Done."
}
trap cleanup EXIT

# --- Pre-flight ---
echo -e "${BOLD}Update Validation — Cross-Repo End-to-End${NC}"
echo ""

for cmd in gh jq git; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo -e "${RED}ERROR: $cmd is required but not installed${NC}"
        exit 1
    fi
done

if ! gh auth status >/dev/null 2>&1; then
    echo -e "${RED}ERROR: gh CLI is not authenticated. Run: gh auth login${NC}"
    exit 1
fi

# ─── Phase 1: Clone repos ────────────────────────────────────────────────
echo -e "${CYAN}Phase 1: Cloning repos${NC}"
mkdir -p "$TMP_DIR"

for repo in "${REPOS[@]}"; do
    echo -e "  Cloning $repo..."
    gh repo clone "$REPO_OWNER/$repo" "$TMP_DIR/$repo" -- --depth=50 --quiet 2>/dev/null
done
echo ""

# ─── Phase 2: Pre-release baseline ───────────────────────────────────────
echo -e "${CYAN}Phase 2: Pre-release baseline (should be up to date)${NC}"

for repo in "${REPOS[@]}"; do
    set +e
    CHECK_STDOUT=$("$TMP_DIR/$repo/scripts/check-updates.sh" --force 2>"$TMP_DIR/${repo}-pre-stderr.txt")
    CHECK_EXIT=$?
    set -e
    CHECK_STDERR=$(cat "$TMP_DIR/${repo}-pre-stderr.txt")

    if [ "$VERBOSE" = true ]; then
        echo -e "  ${DIM}stdout: $CHECK_STDOUT${NC}"
        [ -n "$CHECK_STDERR" ] && echo -e "  ${DIM}stderr: $CHECK_STDERR${NC}"
    fi

    test_result "$repo: check-updates exit code (pre-release)" "0" "$CHECK_EXIT"

    if echo "$CHECK_STDOUT" | grep -q "Up to date"; then
        test_result "$repo: reports up to date" "detected" "detected"
    else
        test_result "$repo: reports up to date" "detected" "missing"
    fi
done
echo ""

# ─── Phase 3: Create fake releases ───────────────────────────────────────
echo -e "${CYAN}Phase 3: Creating fake $FAKE_TAG releases${NC}"

for repo in "${REPOS[@]}"; do
    echo -e "  Creating $FAKE_TAG on $REPO_OWNER/$repo..."
    gh release create "$FAKE_TAG" \
        --repo "$REPO_OWNER/$repo" \
        --title "Test Release $FAKE_TAG" \
        --notes "Automated validation test — will be deleted" \
        >/dev/null 2>&1
    RELEASES_CREATED="$RELEASES_CREATED $repo"

    # Verify
    LATEST_TAG=$(gh api "repos/$REPO_OWNER/$repo/releases/latest" --jq '.tag_name' 2>/dev/null || echo "")
    test_result "$repo: fake release is latest" "$FAKE_TAG" "$LATEST_TAG"
done
echo ""

# ─── Phase 4: Post-release detection ─────────────────────────────────────
echo -e "${CYAN}Phase 4: Post-release detection (should find update)${NC}"

for repo in "${REPOS[@]}"; do
    # Clear any cache from phase 2
    rm -rf "$TMP_DIR/$repo/.claude/.update-cache" "$TMP_DIR/$repo/.update-cache"

    set +e
    CHECK_STDOUT=$("$TMP_DIR/$repo/scripts/check-updates.sh" --force 2>"$TMP_DIR/${repo}-post-stderr.txt")
    CHECK_EXIT=$?
    set -e
    CHECK_STDERR=$(cat "$TMP_DIR/${repo}-post-stderr.txt")

    if [ "$VERBOSE" = true ]; then
        echo -e "  ${DIM}stdout: $CHECK_STDOUT${NC}"
        echo -e "  ${DIM}stderr: $CHECK_STDERR${NC}"
    fi

    test_result "$repo: check-updates exit code (post-release)" "2" "$CHECK_EXIT"

    if echo "$CHECK_STDERR" | grep -q "UPDATE AVAILABLE"; then
        test_result "$repo: stderr contains UPDATE AVAILABLE" "detected" "detected"
    else
        test_result "$repo: stderr contains UPDATE AVAILABLE" "detected" "missing"
    fi

    if echo "$CHECK_STDERR" | grep -q "99.0.0"; then
        test_result "$repo: stderr contains 99.0.0" "detected" "detected"
    else
        test_result "$repo: stderr contains 99.0.0" "detected" "missing"
    fi

    if echo "$CHECK_STDERR" | grep -q "$repo"; then
        test_result "$repo: stderr contains repo name" "detected" "detected"
    else
        test_result "$repo: stderr contains repo name" "detected" "missing"
    fi
done
echo ""

# ─── Phase 5: Update script ──────────────────────────────────────────────
echo -e "${CYAN}Phase 5: update.sh (should be up to date)${NC}"

for repo in "${REPOS[@]}"; do
    set +e
    UPDATE_OUTPUT=$("$TMP_DIR/$repo/scripts/update.sh" 2>&1)
    UPDATE_EXIT=$?
    set -e

    if [ "$VERBOSE" = true ]; then
        echo -e "  ${DIM}$UPDATE_OUTPUT${NC}"
    fi

    test_result "$repo: update.sh exits cleanly" "0" "$UPDATE_EXIT"

    if echo "$UPDATE_OUTPUT" | grep -q "Already up to date"; then
        test_result "$repo: update.sh detects up-to-date" "detected" "detected"
    else
        test_result "$repo: update.sh detects up-to-date" "detected" "missing"
    fi
done
echo ""

# ─── Summary ─────────────────────────────────────────────────────────────
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${BOLD}Results: $PASS/$TOTAL passed${NC}"
if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}$FAIL test(s) FAILED${NC}"
else
    echo -e "${GREEN}All tests passed!${NC}"
fi
echo ""

exit "$FAIL"
