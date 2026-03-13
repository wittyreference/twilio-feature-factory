#!/usr/bin/env bash
# ABOUTME: Removes all blackjack implementation files so Claude can build from scratch.
# ABOUTME: Used before recording the CEO demo — resets to a clean state with only the prompt remaining.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}Blackjack Demo Reset${NC}"
echo "===================="
echo ""

# Verify we're on main and clean
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
    echo -e "${RED}ERROR: Not on main branch (on: $BRANCH). Switch to main first.${NC}"
    exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
    echo -e "${RED}ERROR: Working tree is not clean. Commit or stash changes first.${NC}"
    git status --short
    exit 1
fi

# Verify prompt exists
if [ ! -f ".meta/blackjack.md" ]; then
    echo -e "${RED}ERROR: .meta/blackjack.md not found. Cannot reset without the build prompt.${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Build prompt exists (.meta/blackjack.md)"

# Verify voice-sdk files exist (needed for PBX demo)
if [ ! -f "assets/voice-sdk-client.html" ] || [ ! -f "scripts/voice-sdk-server.js" ]; then
    echo -e "${RED}ERROR: Voice SDK files missing. Commit them first.${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Voice SDK files present (PBX demo safe)"

echo ""
echo -e "${YELLOW}Removing blackjack files...${NC}"

# Remove blackjack implementation files
rm -f functions/voice/blackjack/welcome.js
rm -f functions/voice/blackjack/action.protected.js
rm -f functions/voice/blackjack/dealer-turn.protected.js
rm -f functions/voice/blackjack/game-over.protected.js
rm -f functions/helpers/blackjack-engine.private.js
rm -f functions/helpers/blackjack-sync.private.js
rm -f assets/blackjack-client.html
rm -f scripts/blackjack-server.js
rm -f scripts/blackjack-tail.js
rmdir functions/voice/blackjack 2>/dev/null || true

# Remove test files
rm -rf __tests__/unit/voice/blackjack/

# Revert sdk-handler.js to remove game: routing
# Use node for reliable multi-line replacement (sed is too fragile for this)
HANDLER="functions/voice/sdk-handler.js"
if grep -q "game:" "$HANDLER" 2>/dev/null; then
    node -e "
      const fs = require('fs');
      let src = fs.readFileSync('$HANDLER', 'utf8');
      // Remove the 2-line game: block, preserving the } else { that follows
      src = src.replace(/  \} else if \(to\.startsWith\('game:'\)\) \{\n.*twiml\.redirect.*\n/m, '');
      fs.writeFileSync('$HANDLER', src);
    "
    echo -e "  ${GREEN}✓${NC} Removed game: routing from sdk-handler.js"
else
    echo -e "  ${YELLOW}⚠${NC} No game: routing found in sdk-handler.js (already clean)"
fi

echo ""

# Stage and commit
git add -A
REMOVED=$(git diff --cached --stat | tail -1)
echo -e "${BOLD}Changes:${NC} $REMOVED"
echo ""

git commit -m "chore: Reset blackjack for demo build"
echo ""
echo -e "${GREEN}${BOLD}Reset complete.${NC}"
echo ""
echo -e "  Build prompt: .meta/blackjack.md"
echo -e "  Voice SDK:    assets/voice-sdk-client.html (kept)"
echo -e "  PBX demo:     scripts/voice-sdk-server.js (kept)"
echo ""
echo -e "  ${BOLD}To restore after demo:${NC} git revert HEAD"
echo ""
