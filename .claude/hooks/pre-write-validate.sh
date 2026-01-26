#!/bin/bash
# ABOUTME: Pre-write validation hook for credential safety and ABOUTME enforcement.
# ABOUTME: Blocks writes containing hardcoded Twilio credentials or missing required headers.

FILE_PATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-}"
CONTENT="${CLAUDE_TOOL_INPUT_CONTENT:-}"

# Exit early if no content to validate
if [ -z "$CONTENT" ]; then
    exit 0
fi

# ============================================
# CREDENTIAL SAFETY CHECK
# ============================================

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

# ============================================
# ABOUTME VALIDATION FOR NEW JS FILES
# ============================================

# Check if this is a new JavaScript function file (not a test)
if [[ "$FILE_PATH" =~ functions/.*\.js$ ]] && [[ ! "$FILE_PATH" =~ \.test\.js$ ]]; then
    # Check if file doesn't exist yet (new file)
    if [ ! -f "$FILE_PATH" ]; then
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

exit 0
