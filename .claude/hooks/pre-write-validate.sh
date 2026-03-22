#!/bin/bash
# ABOUTME: Pre-write validation hook for credential safety, ABOUTME, and meta isolation.
# ABOUTME: Blocks writes containing hardcoded credentials, missing headers, or violating meta mode.
#
# META MODE BYPASS: Use Bash with inline env var to write to production paths:
#   CLAUDE_ALLOW_PRODUCTION_WRITE=true cat > functions/path/file.js << 'EOF'
#   ...
#   EOF

# Claude Code passes tool input as JSON on stdin, not env vars.
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT="$(cat)"
fi

FILE_PATH=""
CONTENT=""
if [ -n "$HOOK_INPUT" ] && ! command -v jq &> /dev/null; then
    echo "WARNING: jq not installed — safety hooks disabled (credential detection, pipeline gate, ABOUTME). Run: brew install jq" >&2
fi
if [ -n "$HOOK_INPUT" ] && command -v jq &> /dev/null; then
    FILE_PATH="$(echo "$HOOK_INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
    CONTENT="$(echo "$HOOK_INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty' 2>/dev/null)"
fi

# Exit early if no content to validate
if [ -z "$CONTENT" ]; then
    exit 0
fi

# ============================================
# META-MODE ISOLATION CHECK
# ============================================

# Source meta-mode detection
HOOK_DIR="$(dirname "$0")"
if [ -f "$HOOK_DIR/_meta-mode.sh" ]; then
    source "$HOOK_DIR/_meta-mode.sh"
fi

# Check meta-mode isolation (can be bypassed with CLAUDE_ALLOW_PRODUCTION_WRITE=true)
if [ "$CLAUDE_META_MODE" = "true" ] && [ "$CLAUDE_ALLOW_PRODUCTION_WRITE" != "true" ]; then
    # Get project root for path comparison
    PROJECT_ROOT="${PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

    # Resolve symlinks in both paths to handle macOS /tmp → /private/tmp
    # For new files, resolve directory portion (file doesn't exist yet)
    _META_DIR="$(dirname "$FILE_PATH")"
    _META_RESOLVED_DIR="$(realpath "$_META_DIR" 2>/dev/null || echo "$_META_DIR")"
    RESOLVED_FILE_PATH="$_META_RESOLVED_DIR/$(basename "$FILE_PATH")"
    RESOLVED_PROJECT_ROOT="$(realpath "$PROJECT_ROOT" 2>/dev/null || echo "$PROJECT_ROOT")"

    # Compute relative path from both resolved and raw FILE_PATH.
    # When .meta/ is a symlink to an external directory (e.g., factory-workshop),
    # realpath resolves it outside PROJECT_ROOT, breaking the prefix strip.
    # Fall back to the raw FILE_PATH (relative to PROJECT_ROOT) for pattern matching.
    RELATIVE_PATH="${RESOLVED_FILE_PATH#$RESOLVED_PROJECT_ROOT/}"
    if [[ "$RELATIVE_PATH" == "$RESOLVED_FILE_PATH" ]]; then
        # Resolved path is outside project root — use raw path instead
        RELATIVE_PATH="${FILE_PATH#$RESOLVED_PROJECT_ROOT/}"
        # If still absolute, try stripping unresolved PROJECT_ROOT
        if [[ "$RELATIVE_PATH" == "$FILE_PATH" ]]; then
            RELATIVE_PATH="${FILE_PATH#$PROJECT_ROOT/}"
        fi
    fi

    # Only enforce meta-mode isolation for files INSIDE the project root.
    # Files outside (e.g., ~/.claude/plans/, ~/.claude/memory/) are not
    # production code — credential checks below still apply to them.
    if [[ "$RELATIVE_PATH" != "$FILE_PATH" ]]; then
        # Allowed paths in meta mode
        # - .meta/* - meta development files
        # - .claude/* - Claude Code configuration (hooks, plans, etc.)
        # - scripts/* - development scripts (often need updating)
        # - __tests__/* - test files (part of development)
        # - *.md in root - documentation files

        ALLOWED=false
        case "$RELATIVE_PATH" in
            .meta/*)
                ALLOWED=true
                ;;
            .claude/*)
                ALLOWED=true
                ;;
            scripts/*)
                ALLOWED=true
                ;;
            .github/*)
                ALLOWED=true
                ;;
            __tests__/*)
                ALLOWED=true
                ;;
            agents/*)
                ALLOWED=true
                ;;
            .env|.env.*)
                # .env files are gitignored local config, not production code
                ALLOWED=true
                ;;
            */CLAUDE.md)
                # Domain CLAUDE.md files are development documentation, not production code
                ALLOWED=true
                ;;
            *.md)
                # Root-level markdown files are docs
                if [[ "$RELATIVE_PATH" != */* ]]; then
                    ALLOWED=true
                fi
                ;;
        esac

        if [ "$ALLOWED" = "false" ]; then
            echo "BLOCKED: Meta mode active - changes to production code blocked!" >&2
            echo "" >&2
            echo "You are in META DEVELOPMENT mode (.meta/ directory exists)." >&2
            echo "Changes should go to .meta/ during meta-development." >&2
            echo "" >&2
            echo "Attempted to write: $RELATIVE_PATH" >&2
            echo "" >&2
            echo "Allowed paths in meta mode:" >&2
            echo "  - .meta/*" >&2
            echo "  - .claude/plans/*" >&2
            echo "  - .claude/archive/*" >&2
            echo "" >&2
            echo "To intentionally promote changes to production code:" >&2
            echo "  export CLAUDE_ALLOW_PRODUCTION_WRITE=true" >&2
            echo "" >&2
            echo "Or remove .meta/ directory to exit meta mode entirely." >&2
            echo "" >&2
            exit 2
        fi
    fi
fi

# ============================================
# RESOLVE PATHS FOR DOWNSTREAM CHECKS
# ============================================
# Resolve symlinks once for all downstream sections.
# macOS: /tmp → /private/tmp causes ${FILE_PATH#$PROJECT_ROOT/} to fail
# when git rev-parse returns /private/tmp but Claude passes /tmp.
# For new files (pre-write), realpath fails on the file itself because it
# doesn't exist yet. Resolve the directory portion instead, then reattach
# the filename. This handles the /tmp → /private/tmp symlink on macOS.
PROJECT_ROOT="${PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
_FILE_DIR="$(dirname "$FILE_PATH")"
_RESOLVED_DIR="$(realpath "$_FILE_DIR" 2>/dev/null || echo "$_FILE_DIR")"
RESOLVED_FILE_PATH="$_RESOLVED_DIR/$(basename "$FILE_PATH")"
RESOLVED_PROJECT_ROOT="$(realpath "$PROJECT_ROOT" 2>/dev/null || echo "$PROJECT_ROOT")"

# ============================================
# CREDENTIAL SAFETY CHECK
# ============================================

# Skip credential checks for infrastructure/config files that legitimately
# contain credentials, plus test files, docs, and env examples.
# Uses a flag instead of exit 0 so downstream checks (assertion warnings,
# naming patterns) still run — those are specifically designed for .md files.
SKIP_CREDENTIALS=false

# Test files and docs
if [[ "$FILE_PATH" =~ \.test\.(js|ts)$ ]] || [[ "$FILE_PATH" =~ \.spec\.(js|ts)$ ]] || \
   [[ "$FILE_PATH" =~ _test\.go$ ]] || \
   [[ "$FILE_PATH" =~ __tests__/ ]] || [[ "$FILE_PATH" =~ \.md$ ]] || \
   [[ "$FILE_PATH" =~ \.env\.example$ ]] || [[ "$FILE_PATH" =~ \.env\.sample$ ]]; then
    SKIP_CREDENTIALS=true
fi

# Infrastructure/config files that legitimately contain credentials.
# These are gitignored or external to the repo — not application code.
if [[ "$(basename "$FILE_PATH")" =~ ^\.env(\..*)?$ ]] || \
   [[ "$FILE_PATH" =~ \.twilio-cli/ ]] || \
   [[ "$FILE_PATH" =~ node_modules/ ]]; then
    SKIP_CREDENTIALS=true
fi

if [ "$SKIP_CREDENTIALS" = "false" ]; then
    # Pattern for Twilio Account SID (not in env var reference)
    if echo "$CONTENT" | grep -E "AC[a-f0-9]{32}" | grep -vqE "(process\.env|context\.|TWILIO_ACCOUNT_SID|ACCOUNT_SID)"; then
        echo "BLOCKED: Hardcoded Twilio Account SID detected!" >&2
        echo "" >&2
        echo "Found pattern matching 'ACxxxxxxxx...' which appears to be a hardcoded Account SID." >&2
        echo "Use environment variables instead:" >&2
        echo "  - In serverless functions: context.TWILIO_ACCOUNT_SID" >&2
        echo "  - In Node.js: process.env.TWILIO_ACCOUNT_SID" >&2
        echo "" >&2
        exit 2
    fi

    # Pattern for Twilio API Key SID
    if echo "$CONTENT" | grep -E "SK[a-f0-9]{32}" | grep -vqE "(process\.env|context\.|TWILIO_API_KEY|API_KEY)"; then
        echo "BLOCKED: Hardcoded Twilio API Key SID detected!" >&2
        echo "" >&2
        echo "API Keys must not be hardcoded. Use environment variables:" >&2
        echo "  - context.TWILIO_API_KEY or process.env.TWILIO_API_KEY" >&2
        echo "" >&2
        exit 2
    fi

    # Pattern for hardcoded auth token assignment
    if echo "$CONTENT" | grep -qE "(authToken|AUTH_TOKEN)['\"]?\s*[:=]\s*['\"][a-f0-9]{32}['\"]"; then
        echo "BLOCKED: Hardcoded Twilio Auth Token detected!" >&2
        echo "" >&2
        echo "Auth tokens must never be hardcoded. Use environment variables:" >&2
        echo "  - In serverless functions: context.TWILIO_AUTH_TOKEN" >&2
        echo "  - In Node.js: process.env.TWILIO_AUTH_TOKEN" >&2
        echo "" >&2
        exit 2
    fi
fi

# ============================================
# PROMPT INJECTION HEURISTIC CHECK
# ============================================

# Skip injection checks for documentation files (they legitimately discuss these topics)
SKIP_INJECTION=false
if [[ "$FILE_PATH" =~ \.md$ ]] || [[ "$FILE_PATH" =~ CLAUDE\.md$ ]] || \
   [[ "$FILE_PATH" =~ \.test\.(js|ts)$ ]] || [[ "$FILE_PATH" =~ __tests__/ ]] || \
   [[ "$FILE_PATH" =~ _safety-patterns\.sh$ ]]; then
    SKIP_INJECTION=true
fi

if [ "$SKIP_INJECTION" = "false" ] && [ -n "$CONTENT" ]; then
    source "$HOOK_DIR/_emit-event.sh"
    source "$HOOK_DIR/_safety-patterns.sh"
    EMIT_SESSION_ID="$(echo "$HOOK_INPUT" | jq -r '.session_id // empty' 2>/dev/null)"

    if ! check_injection_patterns "$CONTENT" "file_content"; then
        echo "BLOCKED: Content contains text matching known prompt injection patterns." >&2
        echo "" >&2
        echo "This may be a false positive. If the content is legitimate:" >&2
        echo "  - Documentation files (.md) are exempt from this check" >&2
        echo "  - Test files are exempt from this check" >&2
        echo "  - Review the content and use Bash write if needed" >&2
        echo "" >&2
        exit 2
    fi
fi

# ============================================
# ABOUTME VALIDATION FOR NEW JS FILES
# ============================================

# Check if this is a new JavaScript function file (not a test)
# Use both raw and resolved paths to handle macOS /tmp → /private/tmp symlinks
if { [[ "$FILE_PATH" =~ functions/.*\.js$ ]] || [[ "$RESOLVED_FILE_PATH" =~ functions/.*\.js$ ]]; } && \
   [[ ! "$FILE_PATH" =~ \.test\.js$ ]]; then
    # Check if file doesn't exist yet (new file) — check both path forms
    if [ ! -f "$FILE_PATH" ] && [ ! -f "$RESOLVED_FILE_PATH" ]; then
        # Validate ABOUTME is present in content being written
        if ! echo "$CONTENT" | head -5 | grep -q "// ABOUTME:"; then
            echo "BLOCKED: New function file missing ABOUTME comment!" >&2
            echo "" >&2
            echo "All code files must start with a 2-line ABOUTME comment:" >&2
            echo "" >&2
            echo "// ABOUTME: [What this file does - action-oriented]" >&2
            echo "// ABOUTME: [Additional context - key behaviors, dependencies]" >&2
            echo "" >&2
            echo "Example:" >&2
            echo "// ABOUTME: Handles incoming voice calls with greeting and input gathering." >&2
            echo "// ABOUTME: Uses Polly.Amy voice and supports DTMF and speech input." >&2
            echo "" >&2
            exit 2
        fi
    fi
fi

# ============================================
# PIPELINE GATE — New functions require tests
# ============================================

# Only check new function files (not tests, not helpers/private utilities)
if { [[ "$FILE_PATH" =~ functions/.*\.js$ ]] || [[ "$RESOLVED_FILE_PATH" =~ functions/.*\.js$ ]]; } && \
   [[ ! "$FILE_PATH" =~ \.test\.js$ ]] && \
   [[ ! "$FILE_PATH" =~ _test\.go$ ]] && \
   [[ ! "$FILE_PATH" =~ /helpers/ ]]; then

    if [ ! -f "$FILE_PATH" ] && [ ! -f "$RESOLVED_FILE_PATH" ]; then
        # Skip if override is set
        if [ "${SKIP_PIPELINE_GATE:-}" = "true" ]; then
            echo "Pipeline gate bypassed (SKIP_PIPELINE_GATE=true)" >&2
        else
            # Derive expected test path
            # functions/voice/ivr-welcome.js → __tests__/unit/voice/ivr-welcome.test.js
            # functions/voice/ivr-welcome.protected.js → __tests__/unit/voice/ivr-welcome.test.js
            REL_FUNC="${FILE_PATH#*/functions/}"
            DOMAIN=$(dirname "$REL_FUNC")
            BASENAME=$(basename "$REL_FUNC" .js)
            BASENAME="${BASENAME%.protected}"
            BASENAME="${BASENAME%.private}"
            TEST_PATH="__tests__/unit/${DOMAIN}/${BASENAME}.test.js"

            if [ ! -f "$PROJECT_ROOT/$TEST_PATH" ] && [ ! -f "$RESOLVED_PROJECT_ROOT/$TEST_PATH" ]; then
                echo "" >&2
                echo "BLOCKED: New function file has no corresponding tests!" >&2
                echo "" >&2
                echo "  Function:  functions/${REL_FUNC}" >&2
                echo "  Expected:  ${TEST_PATH}" >&2
                echo "" >&2
                echo "This project enforces pipeline-driven development." >&2
                echo "For new features, use the development pipeline:" >&2
                echo "" >&2
                echo "  /architect [feature]   # Start with design review" >&2
                echo "  /test-gen [feature]    # Write failing tests first" >&2
                echo "  /dev [task]            # Then implement" >&2
                echo "" >&2
                echo "See .claude/references/workflow-patterns.md for full phase sequences." >&2
                echo "" >&2
                echo "Override: SKIP_PIPELINE_GATE=true (for emergency fixes)" >&2
                exit 2
            fi
        fi
    fi
fi

# ============================================
# TEST FILE ABOUTME WARNING (not blocking)
# ============================================

if [[ "$FILE_PATH" =~ \.test\.js$ ]] || [[ "$FILE_PATH" =~ __tests__ ]]; then
    if [ ! -f "$FILE_PATH" ]; then
        if ! echo "$CONTENT" | head -5 | grep -q "// ABOUTME:"; then
            echo "Note: Consider adding ABOUTME comment to test file." >&2
        fi
    fi
fi

# ============================================
# HIGH-RISK ASSERTION WARNING (not blocking)
# ============================================

# Check documentation files for high-risk assertion patterns
if [[ "$FILE_PATH" =~ CLAUDE\.md$ ]] || [[ "$FILE_PATH" =~ \.claude/skills/.*\.md$ ]]; then
    WARNED=false

    # Check for negative behavioral claims without citation
    if echo "$CONTENT" | grep -qiE "(cannot|can't|not able to|impossible|not supported|not available)" && \
       ! echo "$CONTENT" | grep -qE "<!-- (verified|UNVERIFIED):"; then
        if [ "$WARNED" = false ]; then
            echo "" >&2
            echo "⚠️  HIGH-RISK ASSERTION WARNING" >&2
            echo "   File: $FILE_PATH" >&2
            WARNED=true
        fi
        echo "   → Negative behavioral claim detected (cannot/not supported/etc.)" >&2
    fi

    # Check for absolute claims without citation
    if echo "$CONTENT" | grep -qE "\b(always|never|must|only)\b" && \
       echo "$CONTENT" | grep -qiE "(twilio|twiml|api|webhook|call|sms|message)" && \
       ! echo "$CONTENT" | grep -qE "<!-- (verified|UNVERIFIED):"; then
        if [ "$WARNED" = false ]; then
            echo "" >&2
            echo "⚠️  HIGH-RISK ASSERTION WARNING" >&2
            echo "   File: $FILE_PATH" >&2
            WARNED=true
        fi
        echo "   → Absolute claim detected (always/never/must/only)" >&2
    fi

    # Check for numeric limits without citation (e.g., "max 16KB", "up to 4")
    if echo "$CONTENT" | grep -qE "(max|maximum|up to|at least|limit)[^a-z]*[0-9]+" && \
       ! echo "$CONTENT" | grep -qE "<!-- (verified|UNVERIFIED):"; then
        if [ "$WARNED" = false ]; then
            echo "" >&2
            echo "⚠️  HIGH-RISK ASSERTION WARNING" >&2
            echo "   File: $FILE_PATH" >&2
            WARNED=true
        fi
        echo "   → Numeric limit detected without citation" >&2
    fi

    if [ "$WARNED" = true ]; then
        echo "" >&2
        echo "   Did you verify these claims against official Twilio docs?" >&2
        echo "   Add citations: <!-- verified: twilio.com/docs/... -->" >&2
        echo "   Or mark uncertain: <!-- UNVERIFIED: reason -->" >&2
        echo "" >&2
    fi
fi

# ============================================
# NON-EVERGREEN NAMING PATTERN WARNING (not blocking)
# ============================================

# Check for naming patterns that indicate temporal context
# These names will become misleading as codebase evolves
if echo "$CONTENT" | grep -qE "\b(Improved|Enhanced|Better|Refactored)[A-Z][a-zA-Z]*"; then
    MATCHED_NAMES=$(echo "$CONTENT" | grep -oE "\b(Improved|Enhanced|Better|Refactored)[A-Z][a-zA-Z]*" | head -5 | tr '\n' ', ' | sed 's/,$//')
    echo "" >&2
    echo "⚠️  NON-EVERGREEN NAMING WARNING" >&2
    echo "   File: $FILE_PATH" >&2
    echo "   Found: $MATCHED_NAMES" >&2
    echo "" >&2
    echo "   Names like 'ImprovedX' or 'BetterY' become misleading over time." >&2
    echo "   What's 'improved' today will be 'old' tomorrow." >&2
    echo "   Use descriptive names that explain WHAT it does, not WHEN it was written." >&2
    echo "" >&2
fi

# Also check for "New" prefix followed by uppercase (but allow "new" in sentences)
# Pattern: NewSomething in declarations (not "new something" or "newline")
if echo "$CONTENT" | grep -qE "(const|let|var|function|class|type|interface)\s+New[A-Z]"; then
    MATCHED_NAMES=$(echo "$CONTENT" | grep -oE "(const|let|var|function|class|type|interface)\s+New[A-Z][a-zA-Z]*" | sed 's/^[a-z]* //' | head -5 | tr '\n' ', ' | sed 's/,$//')
    echo "" >&2
    echo "⚠️  NON-EVERGREEN NAMING WARNING" >&2
    echo "   File: $FILE_PATH" >&2
    echo "   Found: $MATCHED_NAMES" >&2
    echo "" >&2
    echo "   Names like 'NewHandler' will be outdated when you add another one." >&2
    echo "   Use descriptive names instead: 'StreamingHandler', 'BatchHandler', etc." >&2
    echo "" >&2
fi

# ============================================
# MAGIC TEST NUMBER CHECK (BLOCKING)
# ============================================

# Twilio magic test numbers (+15005550xxx) should only be in test files
# These are special numbers that bypass actual phone networks
if echo "$CONTENT" | grep -qE "\+?1?5005550[0-9]{3}"; then
    # Check if this is a test file
    if [[ ! "$FILE_PATH" =~ (\.test\.|\.spec\.|__tests__|test/|tests/|\.test$|\.spec$) ]]; then
        MATCHED_NUMBERS=$(echo "$CONTENT" | grep -oE "\+?1?5005550[0-9]{3}" | head -3 | tr '\n' ', ' | sed 's/,$//')
        echo "BLOCKED: Twilio magic test numbers in non-test file!" >&2
        echo "" >&2
        echo "Found: $MATCHED_NUMBERS" >&2
        echo "File: $FILE_PATH" >&2
        echo "" >&2
        echo "Magic test numbers (+15005550xxx) bypass actual phone networks and" >&2
        echo "should only be used in test files." >&2
        echo "" >&2
        echo "For test files: rename to .test.js/.spec.js or move to __tests__/" >&2
        echo "For production: use environment variables for phone numbers" >&2
        echo "" >&2
        exit 2
    fi
fi

exit 0
