#!/usr/bin/env bash
# ABOUTME: Deterministic plugin sync - applies mechanical adaptations from factory to plugin.
# ABOUTME: Handles 11 of 14 adaptation types via sed/template. Reports AI-required ones for Claude review.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SYNC_MAP="$REPO_ROOT/.claude/plugin-sync-map.json"
PLUGIN_REPO="${PLUGIN_REPO:-$REPO_ROOT/../twilio-claude-plugin}"
STAGING_DIR="${STAGING_DIR:-$REPO_ROOT/.meta/plugin-sync-staging}"
DRY_RUN="${DRY_RUN:-false}"

if [[ ! -f "$SYNC_MAP" ]]; then
  echo "ERROR: Sync map not found at $SYNC_MAP" >&2
  exit 1
fi

if [[ ! -d "$PLUGIN_REPO" ]]; then
  echo "ERROR: Plugin repo not found at $PLUGIN_REPO" >&2
  echo "Set PLUGIN_REPO env var to override." >&2
  exit 1
fi

mkdir -p "$STAGING_DIR"

SYNCED=0
SKIPPED=0
AI_NEEDED=()
ERRORS=()

# --- Adaptation functions ---

apply_frontmatter() {
  local src="$1" dest="$2"
  local name desc
  name=$(basename "$(dirname "$dest")")
  desc="Twilio development skill: $name"

  cat > "$dest" <<EOF
---
name: "$name"
description: "$desc"
---

EOF
  cat "$src" >> "$dest"
}

apply_frontmatter_agent() {
  local src="$1" dest="$2"
  local name
  name=$(basename "$dest" .md)

  cat > "$dest" <<EOF
---
name: "$name"
description: "Twilio development agent: $name"
model: opus
---

EOF
  cat "$src" >> "$dest"
}

apply_strip_factory_paths() {
  local file="$1"
  # Remove or generalize factory-specific internal path references
  sed -i '' \
    -e 's|functions/[a-z-]*/||g' \
    -e 's|agents/[a-z-]*/||g' \
    -e 's|\./\.claude/||g' \
    -e 's|\.claude/||g' \
    -e 's|\.meta/||g' \
    -e 's|/functions/||g' \
    -e 's|/agents/||g' \
    "$file" 2>/dev/null || true
}

apply_strip_meta_mode() {
  local file="$1"
  # Remove _meta-mode.sh sourcing lines
  sed -i '' \
    -e '/source.*_meta-mode\.sh/d' \
    -e '/\. .*_meta-mode\.sh/d' \
    -e '/CLAUDE_META_MODE/d' \
    -e '/META_MODE/d' \
    -e '/\.meta\//d' \
    "$file" 2>/dev/null || true
}

apply_strip_flywheel() {
  local file="$1"
  sed -i '' \
    -e '/flywheel-doc-check/d' \
    -e '/pending-actions/d' \
    -e '/flywheel/d' \
    "$file" 2>/dev/null || true
}

apply_strip_auto_clear() {
  local file="$1"
  sed -i '' \
    -e '/auto-clear/d' \
    -e '/Auto-cleared/d' \
    "$file" 2>/dev/null || true
}

apply_strip_compact() {
  local file="$1"
  sed -i '' \
    -e '/compact-pending/d' \
    "$file" 2>/dev/null || true
}

apply_strip_team_refs() {
  local file="$1"
  sed -i '' \
    -e '/\/team /d' \
    -e '/Agent Teams/d' \
    -e '/agent.teams/d' \
    "$file" 2>/dev/null || true
}

apply_merge_invariant_rules() {
  local src="$1" dest="$2" additional_sources="$3"

  # Start with frontmatter
  local name
  name=$(basename "$(dirname "$dest")")
  cat > "$dest" <<EOF
---
name: "$name"
description: "Twilio development invariants and rules"
---

EOF

  # Concatenate primary source
  cat "$REPO_ROOT/$src" >> "$dest"
  echo "" >> "$dest"

  # Concatenate additional sources
  IFS=',' read -ra SOURCES <<< "$additional_sources"
  for extra in "${SOURCES[@]}"; do
    extra=$(echo "$extra" | tr -d '[] "')
    if [[ -f "$REPO_ROOT/$extra" ]]; then
      echo "---" >> "$dest"
      echo "" >> "$dest"
      cat "$REPO_ROOT/$extra" >> "$dest"
      echo "" >> "$dest"
    fi
  done

  # Strip factory paths from the merged result
  apply_strip_factory_paths "$dest"
}

apply_simplify() {
  local file="$1"
  # Remove factory-specific conditional blocks and meta-mode checks
  apply_strip_meta_mode "$file"
  apply_strip_flywheel "$file"
  # Remove complex factory-specific checks (multi-line blocks are harder to automate)
}

# --- Process each mapping category ---

process_mapping() {
  local factory_path="$1"
  local plugin_path="$2"
  local adaptation="$3"
  local additional_sources="${4:-}"

  local src="$REPO_ROOT/$factory_path"
  local dest_dir
  dest_dir=$(dirname "$STAGING_DIR/$plugin_path")
  local dest="$STAGING_DIR/$plugin_path"

  if [[ ! -f "$src" ]]; then
    ERRORS+=("Source not found: $factory_path")
    return
  fi

  # Check for AI-required adaptations
  if echo "$adaptation" | grep -qE 'generalize-role|generalize-agents|generalize-names|rewrite-meta-conditional'; then
    AI_NEEDED+=("$factory_path → $plugin_path [$adaptation]")
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  mkdir -p "$dest_dir"

  # Parse comma-separated adaptations and apply in order
  IFS=',' read -ra ADAPTATIONS <<< "$adaptation"

  # Start with a copy (or frontmatter)
  local needs_initial_copy=true
  for adapt in "${ADAPTATIONS[@]}"; do
    adapt=$(echo "$adapt" | tr -d ' ')
    if [[ "$adapt" == "frontmatter" || "$adapt" == "frontmatter-agent" || "$adapt" == "merge-invariant-rules" ]]; then
      needs_initial_copy=false
      break
    fi
  done

  if $needs_initial_copy; then
    cp "$src" "$dest"
  fi

  for adapt in "${ADAPTATIONS[@]}"; do
    adapt=$(echo "$adapt" | tr -d ' ')
    case "$adapt" in
      frontmatter)
        apply_frontmatter "$src" "$dest"
        ;;
      frontmatter-agent)
        apply_frontmatter_agent "$src" "$dest"
        ;;
      strip-factory-paths)
        apply_strip_factory_paths "$dest"
        ;;
      strip-meta-mode)
        apply_strip_meta_mode "$dest"
        ;;
      strip-flywheel)
        apply_strip_flywheel "$dest"
        ;;
      strip-auto-clear)
        apply_strip_auto_clear "$dest"
        ;;
      strip-compact)
        apply_strip_compact "$dest"
        ;;
      strip-team-refs)
        apply_strip_team_refs "$dest"
        ;;
      merge-invariant-rules)
        apply_merge_invariant_rules "$factory_path" "$dest" "$additional_sources"
        ;;
      simplify)
        apply_simplify "$dest"
        ;;
      minimal)
        cp "$src" "$dest"
        ;;
      generalize-role|generalize-agents|generalize-names)
        # Already handled above — these are AI-required
        ;;
      *)
        echo "  WARNING: Unknown adaptation type: $adapt" >&2
        ;;
    esac
  done

  SYNCED=$((SYNCED + 1))
}

# Parse and process each category from the sync map
echo "=== Deterministic Plugin Sync ==="
echo "Source: $REPO_ROOT"
echo "Plugin: $PLUGIN_REPO"
echo "Staging: $STAGING_DIR"
echo ""

# Process mappings using jq
for category in skills commands hooks scripts agents; do
  count=$(jq -r ".mappings.$category | length" "$SYNC_MAP" 2>/dev/null || echo 0)
  echo "Processing $category ($count mappings)..."

  for i in $(seq 0 $((count - 1))); do
    factory=$(jq -r ".mappings.$category[$i].factory" "$SYNC_MAP")
    plugin=$(jq -r ".mappings.$category[$i].plugin" "$SYNC_MAP")
    adaptation=$(jq -r ".mappings.$category[$i].adaptation" "$SYNC_MAP")
    additional=$(jq -r ".mappings.$category[$i].additional_sources // empty" "$SYNC_MAP")

    process_mapping "$factory" "$plugin" "$adaptation" "$additional"
  done
done

echo ""
echo "=== Results ==="
echo "Synced deterministically: $SYNCED"
echo "Skipped (needs AI):       $SKIPPED"
echo "Errors:                   ${#ERRORS[@]}"

if [[ ${#AI_NEEDED[@]} -gt 0 ]]; then
  echo ""
  echo "=== Needs Claude Review ==="
  for item in "${AI_NEEDED[@]}"; do
    echo "  - $item"
  done
fi

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo ""
  echo "=== Errors ==="
  for err in "${ERRORS[@]}"; do
    echo "  - $err"
  done
fi

if [[ "$DRY_RUN" == "false" && $SYNCED -gt 0 ]]; then
  echo ""
  echo "Staged files in: $STAGING_DIR"
  echo "Review and copy to plugin repo:"
  echo "  rsync -av $STAGING_DIR/ $PLUGIN_REPO/"
fi
