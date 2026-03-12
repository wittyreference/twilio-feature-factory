#!/usr/bin/env bash
# ABOUTME: Compares files on disk against plugin-sync-map.json to find coverage gaps.
# ABOUTME: Reports files that are neither mapped nor excluded, helping keep the sync map current.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SYNC_MAP="$REPO_ROOT/.claude/plugin-sync-map.json"

if [[ ! -f "$SYNC_MAP" ]]; then
  echo "ERROR: Sync map not found at $SYNC_MAP" >&2
  exit 1
fi

# Extract all factory paths from sync map (mapped + excluded)
get_mapped_paths() {
  # Mapped paths from all categories
  jq -r '.mappings | to_entries[] | .value[] | .factory' "$SYNC_MAP" 2>/dev/null
  # Additional sources (e.g., invariant rule files)
  jq -r '.mappings | to_entries[] | .value[] | .additional_sources[]? // empty' "$SYNC_MAP" 2>/dev/null
  # Excluded paths from all categories
  jq -r '.excluded | to_entries[] | .value[]' "$SYNC_MAP" 2>/dev/null
}

KNOWN_PATHS=$(get_mapped_paths | sort -u)

# Enumerate all syncable files on disk
enumerate_syncable() {
  # Skills
  find "$REPO_ROOT/.claude/skills" -name "*.md" -maxdepth 1 2>/dev/null | sed "s|$REPO_ROOT/||"
  # Commands
  find "$REPO_ROOT/.claude/commands" -name "*.md" -maxdepth 1 2>/dev/null | sed "s|$REPO_ROOT/||"
  # Hooks
  find "$REPO_ROOT/.claude/hooks" -name "*.sh" -maxdepth 1 2>/dev/null | sed "s|$REPO_ROOT/||"
  # Rules
  find "$REPO_ROOT/.claude/rules" -name "*.md" -maxdepth 1 2>/dev/null | sed "s|$REPO_ROOT/||"
  # References
  find "$REPO_ROOT/.claude/references" -name "*.md" -maxdepth 1 2>/dev/null | sed "s|$REPO_ROOT/||"
  # Domain CLAUDE.md files
  find "$REPO_ROOT/functions" -name "CLAUDE.md" -maxdepth 2 2>/dev/null | sed "s|$REPO_ROOT/||"
  # Domain REFERENCE.md files
  find "$REPO_ROOT/functions" -name "REFERENCE.md" -maxdepth 2 2>/dev/null | sed "s|$REPO_ROOT/||"
  # Agent/infra REFERENCE.md files
  find "$REPO_ROOT/agents" -name "REFERENCE.md" -maxdepth 4 2>/dev/null | sed "s|$REPO_ROOT/||"
  # Scripts REFERENCE.md
  find "$REPO_ROOT/scripts" -name "REFERENCE.md" -maxdepth 1 2>/dev/null | sed "s|$REPO_ROOT/||"
  # Scripts (.sh and .js)
  find "$REPO_ROOT/scripts" -maxdepth 1 \( -name "*.sh" -o -name "*.js" \) 2>/dev/null | sed "s|$REPO_ROOT/||"
  # Workflows
  find "$REPO_ROOT/.claude/workflows" -name "*.md" -maxdepth 1 2>/dev/null | sed "s|$REPO_ROOT/||"
}

DISK_FILES=$(enumerate_syncable | sort -u)

# Find files that are on disk but not in any sync map entry
UNCOVERED=()
COVERED=0
TOTAL=0

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  TOTAL=$((TOTAL + 1))

  # Check exact match
  if echo "$KNOWN_PATHS" | grep -qxF "$file"; then
    COVERED=$((COVERED + 1))
    continue
  fi

  # Check if file is under an excluded directory prefix (e.g., "agents/mcp-servers/")
  matched=false
  while IFS= read -r known; do
    [[ -z "$known" ]] && continue
    # If the known path ends with / it is a directory prefix
    if [[ "$known" == */ ]] && [[ "$file" == "$known"* ]]; then
      matched=true
      break
    fi
  done <<< "$KNOWN_PATHS"

  if $matched; then
    COVERED=$((COVERED + 1))
  else
    UNCOVERED+=("$file")
  fi
done <<< "$DISK_FILES"

# Report
echo "SYNC MAP COVERAGE AUDIT"
echo "========================"
echo ""

if [[ ${#UNCOVERED[@]} -eq 0 ]]; then
  echo "All $TOTAL syncable files are accounted for in the sync map."
  echo "Coverage: $COVERED/$TOTAL (100%)"
  exit 0
fi

# Group uncovered by category
echo "Uncovered files (not in sync map):"
echo ""

declare -A CATEGORIES
for file in "${UNCOVERED[@]}"; do
  case "$file" in
    .claude/skills/*) CATEGORIES[SKILLS]+="  $file"$'\n' ;;
    .claude/commands/*) CATEGORIES[COMMANDS]+="  $file"$'\n' ;;
    .claude/hooks/*) CATEGORIES[HOOKS]+="  $file"$'\n' ;;
    .claude/rules/*) CATEGORIES[RULES]+="  $file"$'\n' ;;
    .claude/references/*) CATEGORIES[REFERENCES]+="  $file"$'\n' ;;
    .claude/workflows/*) CATEGORIES[WORKFLOWS]+="  $file"$'\n' ;;
    functions/*REFERENCE*) CATEGORIES[REFERENCE_DOCS]+="  $file"$'\n' ;;
    functions/*) CATEGORIES[DOMAIN_DOCS]+="  $file"$'\n' ;;
    agents/*) CATEGORIES[AGENT_DOCS]+="  $file"$'\n' ;;
    scripts/*) CATEGORIES[SCRIPTS]+="  $file"$'\n' ;;
    *) CATEGORIES[OTHER]+="  $file"$'\n' ;;
  esac
done

for cat in SKILLS COMMANDS HOOKS RULES REFERENCES WORKFLOWS DOMAIN_DOCS REFERENCE_DOCS AGENT_DOCS SCRIPTS OTHER; do
  if [[ -n "${CATEGORIES[$cat]:-}" ]]; then
    echo "  $cat:"
    echo -n "${CATEGORIES[$cat]}"
    echo ""
  fi
done

pct=$((COVERED * 100 / TOTAL))
echo "Coverage: $COVERED/$TOTAL ($pct%)"
echo "Gaps: ${#UNCOVERED[@]} file(s) need triage (map or exclude)"
exit 1
