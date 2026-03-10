#!/usr/bin/env bash
# ABOUTME: Generates a structural map of the codebase for LLM context injection.
# ABOUTME: Extracts ABOUTME comments, export surfaces, and test coverage per file.

set -euo pipefail

FORMAT="text" ROOT_DIR="" MAX_DEPTH=6
INCLUDE_EXTS="ts,js,sh"
EXCLUDE_PATTERNS="node_modules,dist,.feature-factory,coverage"

usage() {
  cat <<'USAGE'
Usage: repo-map.sh [OPTIONS]

Generates a condensed structural map of the codebase for LLM context injection.

Options:
  --text              Tree format with ABOUTME annotations (default)
  --json              Machine-readable JSON output
  --compact           One line per file with truncated annotations
  --dir <path>        Root directory to map (default: repo root)
  --depth <n>         Max directory depth (default: 6)
  --include <pattern> File extension filter (default: ts,js,sh)
  --exclude <pattern> Skip paths matching pattern (default: node_modules,dist,.feature-factory,coverage)
  --help              Show this help message
USAGE
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --text)    FORMAT="text"; shift ;;
    --json)    FORMAT="json"; shift ;;
    --compact) FORMAT="compact"; shift ;;
    --dir)     ROOT_DIR="$2"; shift 2 ;;
    --depth)   MAX_DEPTH="$2"; shift 2 ;;
    --include) INCLUDE_EXTS="$2"; shift 2 ;;
    --exclude) EXCLUDE_PATTERNS="$2"; shift 2 ;;
    --help)    usage ;;
    *)         echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
if [[ -z "$ROOT_DIR" ]]; then ROOT_DIR="$REPO_ROOT"
elif [[ "$ROOT_DIR" != /* ]]; then ROOT_DIR="$REPO_ROOT/$ROOT_DIR"; fi

# Build find arguments from comma-separated patterns and collect matching files
collect_files() {
  local args=("$ROOT_DIR" -maxdepth "$MAX_DEPTH")
  local IFS=','
  for pat in $EXCLUDE_PATTERNS; do
    args+=(-path "*/${pat}/*" -prune -o)
  done
  local name_parts=() first=true
  for ext in $INCLUDE_EXTS; do
    $first && first=false || name_parts+=(-o)
    name_parts+=(-name "*.${ext}")
  done
  args+=(\( "${name_parts[@]}" \) -type f -print)
  find "${args[@]}" | sort
}

get_aboutme() {
  grep -h 'ABOUTME:' "$1" 2>/dev/null | sed 's/.*ABOUTME: *//' || true
}

get_exports() {
  [[ "$1" != *.ts ]] && return
  grep -oE 'export\s+(async\s+)?(function|class|interface|type|const|enum)\s+[A-Za-z_][A-Za-z0-9_]*' "$1" 2>/dev/null \
    | sed -E 's/export[[:space:]]+(async[[:space:]]+)?(function|class|interface|type|const|enum)[[:space:]]+//' || true
}

# Check __tests__/stem.test.* or __tests__/stem.spec.* in nearby directories
check_tested() {
  local base dir stem
  base="$(basename "$1")" dir="$(dirname "$1")" stem="${base%.*}"
  for search_dir in "$dir/__tests__" "$dir/../__tests__" "${dir%/src*}/__tests__"; do
    if [[ -d "$search_dir" ]]; then
      for pat in "${stem}.test."* "${stem}.spec."*; do
        [[ -f "$search_dir/$pat" ]] && { echo "tested"; return; }
      done
    fi
  done
  echo "untested"
}

relpath() { echo "${1#"$ROOT_DIR"/}"; }

# --- Output Formatters ---

output_text() {
  local files prev_dir=""
  files=$(collect_files)
  [[ -z "$files" ]] && { echo "(no files found)"; return; }
  while IFS= read -r file; do
    local rel fdir base status aboutme exports
    rel=$(relpath "$file") fdir=$(dirname "$rel")
    if [[ "$fdir" != "$prev_dir" ]]; then
      echo "" && echo "$fdir/" && prev_dir="$fdir"
    fi
    base=$(basename "$rel") status=$(check_tested "$file")
    printf "  %-40s [%s]" "$base" "$status"
    aboutme=$(get_aboutme "$file" | head -1)
    [[ -n "$aboutme" ]] && printf "  — %s" "$aboutme"
    echo ""
    exports=$(get_exports "$file")
    [[ -n "$exports" ]] && echo "$exports" | while IFS= read -r sym; do
      printf "    export %s\n" "$sym"
    done
  done <<< "$files"
}

output_compact() {
  local files
  files=$(collect_files)
  [[ -z "$files" ]] && return
  while IFS= read -r file; do
    local rel aboutme_line export_list status
    rel=$(relpath "$file")
    aboutme_line=$(get_aboutme "$file" | head -1 | cut -c1-80)
    export_list=$(get_exports "$file" | paste -sd ',' -)
    status=$(check_tested "$file")
    printf "%s" "$rel"
    [[ -n "$aboutme_line" ]] && printf "  [%s]" "$aboutme_line"
    [[ -n "$export_list" ]] && printf "  exports: %s" "$export_list"
    printf "  [%s]\n" "$status"
  done <<< "$files"
}

output_json() {
  local files first=true
  files=$(collect_files)
  printf '{"files":['
  [[ -n "$files" ]] && while IFS= read -r file; do
    local rel aboutme_json="[" exports_json="[" ab_first=true ex_first=true tested_bool="false"
    rel=$(relpath "$file")
    $first && first=false || printf ','
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      $ab_first && ab_first=false || aboutme_json+=","
      line="${line//\\/\\\\}" && line="${line//\"/\\\"}"
      aboutme_json+="\"$line\""
    done < <(get_aboutme "$file")
    aboutme_json+="]"
    while IFS= read -r sym; do
      [[ -z "$sym" ]] && continue
      $ex_first && ex_first=false || exports_json+=","
      exports_json+="\"$sym\""
    done < <(get_exports "$file")
    exports_json+="]"
    [[ "$(check_tested "$file")" == "tested" ]] && tested_bool="true"
    printf '{"path":"%s","aboutme":%s,"exports":%s,"tested":%s}' \
      "$rel" "$aboutme_json" "$exports_json" "$tested_bool"
  done <<< "$files"
  printf ']}\n'
}

case "$FORMAT" in
  text)    output_text ;;
  compact) output_compact ;;
  json)    output_json ;;
esac
