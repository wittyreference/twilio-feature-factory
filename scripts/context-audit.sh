#!/usr/bin/env bash
# ABOUTME: Content completeness audit for CLAUDE.md context atomization.
# ABOUTME: Captures baseline and verifies zero content loss after refactoring.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASELINE_FILE="$PROJECT_ROOT/.meta/context-audit-baseline.txt"
REPORT_FILE="$PROJECT_ROOT/.meta/context-audit-report.txt"

# Directories to search for relocated content
SEARCH_DIRS=(
  "$PROJECT_ROOT/.claude/rules"
  "$PROJECT_ROOT/.claude/references"
  "$PROJECT_ROOT/.claude/skills"
  "$PROJECT_ROOT/functions/voice/CLAUDE.md"
  "$PROJECT_ROOT/functions/conversation-relay/CLAUDE.md"
  "$PROJECT_ROOT/functions/pay/CLAUDE.md"
  "$PROJECT_ROOT/functions/messaging/CLAUDE.md"
  "$PROJECT_ROOT/functions/sync/CLAUDE.md"
  "$PROJECT_ROOT/functions/taskrouter/CLAUDE.md"
  "$PROJECT_ROOT/functions/verify/CLAUDE.md"
  "$PROJECT_ROOT/functions/callbacks/CLAUDE.md"
  "$PROJECT_ROOT/functions/messaging-services/CLAUDE.md"
  "$PROJECT_ROOT/functions/proxy/CLAUDE.md"
  "$PROJECT_ROOT/functions/phone-numbers/CLAUDE.md"
  "$PROJECT_ROOT/functions/helpers/CLAUDE.md"
  "$PROJECT_ROOT/scripts/CLAUDE.md"
  "$PROJECT_ROOT/agents/mcp-servers/twilio/CLAUDE.md"
  "$PROJECT_ROOT/agents/mcp-servers/twilio/src/validation/CLAUDE.md"
  "$PROJECT_ROOT/agents/feature-factory/CLAUDE.md"
  "$PROJECT_ROOT/agents/voice-ai-builder/CLAUDE.md"
  "$PROJECT_ROOT/agents/doc-generator/CLAUDE.md"
  "$PROJECT_ROOT/infrastructure/sip-lab/CLAUDE.md"
  "$PROJECT_ROOT/CLAUDE.md"
)

extract_substantive_lines() {
  # Extract lines that carry actual content (not blank, not pure markdown formatting)
  local file="$1"
  grep -vE '^\s*$|^#{1,6}\s*$|^---\s*$|^\|[-: ]+\|$|^```\s*$|^```[a-z]+\s*$' "$file" \
    | grep -vE '^\s*\|[-]+' \
    | sed 's/^[[:space:]]*//' \
    | sort -u
}

normalize_line() {
  # Normalize a line for fuzzy matching: lowercase, strip markdown formatting, compress whitespace
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/\*\*//g; s/`//g; s/^[-*] //; s/[[:space:]]\+/ /g; s/^[[:space:]]*//; s/[[:space:]]*$//'
}

capture_baseline() {
  echo "=== Capturing baseline from root CLAUDE.md ==="
  local source="$PROJECT_ROOT/CLAUDE.md"

  if [[ ! -f "$source" ]]; then
    echo "ERROR: $source not found"
    exit 1
  fi

  mkdir -p "$(dirname "$BASELINE_FILE")"

  # Extract substantive lines
  local count=0
  while IFS= read -r line; do
    # Skip very short lines (headers without content, table separators)
    if [[ ${#line} -lt 5 ]]; then
      continue
    fi
    # Skip pure markdown table header rows
    if [[ "$line" =~ ^\|[[:space:]]*[-:]+[[:space:]]*\| ]]; then
      continue
    fi
    echo "$line" >> "$BASELINE_FILE.tmp"
    count=$((count + 1))
  done < <(grep -vE '^\s*$|^#{1,6}\s*$|^---\s*$|^```\s*$|^```[a-z]+\s*$' "$source" || true)

  # Deduplicate but preserve order
  awk '!seen[$0]++' "$BASELINE_FILE.tmp" > "$BASELINE_FILE"
  rm -f "$BASELINE_FILE.tmp"

  local total
  total=$(wc -l < "$BASELINE_FILE" | tr -d ' ')
  echo "Baseline captured: $total substantive lines"
  echo "Saved to: $BASELINE_FILE"
}

verify_completeness() {
  echo "=== Verifying content completeness ==="

  if [[ ! -f "$BASELINE_FILE" ]]; then
    echo "ERROR: No baseline found. Run with --before first."
    exit 1
  fi

  # Build search corpus from all destination files
  local corpus_file
  corpus_file=$(mktemp)

  for target in "${SEARCH_DIRS[@]}"; do
    if [[ -d "$target" ]]; then
      find "$target" -name "*.md" -type f -exec cat {} + >> "$corpus_file" 2>/dev/null
    elif [[ -f "$target" ]]; then
      cat "$target" >> "$corpus_file" 2>/dev/null
    fi
  done

  local total=0
  local found=0
  local missing=0
  local missing_lines=""

  while IFS= read -r line; do
    total=$((total + 1))
    local normalized
    normalized=$(normalize_line "$line")

    # Skip very short normalized lines (too generic to match meaningfully)
    if [[ ${#normalized} -lt 10 ]]; then
      found=$((found + 1))
      continue
    fi

    # Try exact match first (case-insensitive)
    if grep -qiF "$line" "$corpus_file" 2>/dev/null; then
      found=$((found + 1))
      continue
    fi

    # Try normalized fuzzy match — extract key phrases (3+ word segments)
    local key_phrase
    key_phrase=$(echo "$normalized" | grep -oE '[a-z]{3,}([[:space:]][a-z]{3,}){2,}' | head -1 || true)

    if [[ -n "$key_phrase" ]] && grep -qiF "$key_phrase" "$corpus_file" 2>/dev/null; then
      found=$((found + 1))
      continue
    fi

    # Try matching significant unique terms (technical terms, file paths)
    local tech_term
    tech_term=$(echo "$line" | grep -oE '[A-Z][a-z]+\.[A-Z][a-z]+|functions/[a-z/-]+|\.claude/[a-z/-]+|TWILIO_[A-Z_]+|console\.(error|warn|log)|setBody|isFinal|voiceUrl|dotenv|source_sid|media_url' | head -1 || true)

    if [[ -n "$tech_term" ]] && grep -qiF "$tech_term" "$corpus_file" 2>/dev/null; then
      found=$((found + 1))
      continue
    fi

    missing=$((missing + 1))
    missing_lines="${missing_lines}\nMISSING: ${line}"
  done < "$BASELINE_FILE"

  rm -f "$corpus_file"

  # Generate report
  {
    echo "=== Context Audit Report ==="
    echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Total substantive lines: $total"
    echo "Found/Accounted: $found"
    echo "Missing: $missing"
    echo ""
    if [[ $missing -gt 0 ]]; then
      echo "=== MISSING LINES ==="
      echo -e "$missing_lines"
    else
      echo "ALL CONTENT ACCOUNTED FOR"
    fi
  } | tee "$REPORT_FILE"

  echo ""
  echo "Report saved to: $REPORT_FILE"

  if [[ $missing -gt 0 ]]; then
    echo ""
    echo "WARNING: $missing lines not found in any destination file."
    echo "Review the MISSING lines above before proceeding."
    return 1
  fi

  return 0
}

usage() {
  echo "Usage: $0 [--before|--after]"
  echo ""
  echo "  --before   Capture baseline from current root CLAUDE.md"
  echo "  --after    Verify all baseline content exists in destination files"
  echo ""
  echo "Run --before on main branch, make changes, then --after to verify."
}

case "${1:-}" in
  --before)
    rm -f "$BASELINE_FILE"
    capture_baseline
    ;;
  --after)
    verify_completeness
    ;;
  *)
    usage
    exit 1
    ;;
esac
