#!/bin/bash
# ABOUTME: Generates learning exercises from autonomous work session logs.
# ABOUTME: Reads session-log.jsonl events and creates exercise stubs in exercises.md.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_meta-mode.sh"

# Only runs in meta mode (learning infrastructure lives in .meta/)
if [ "$CLAUDE_META_MODE" != "true" ] || [ -z "$CLAUDE_LEARNING_DIR" ]; then
    exit 0
fi

SESSION_LOG="$CLAUDE_LEARNING_DIR/session-log.jsonl"
EXERCISES_FILE="$CLAUDE_LEARNING_DIR/exercises.md"

# Nothing to process if no session log or it's empty
if [ ! -s "$SESSION_LOG" ]; then
    exit 0
fi

# Require jq for JSON parsing
if ! command -v jq &>/dev/null; then
    echo "generate-learning-exercises: jq required but not found" >&2
    exit 0
fi

# Count events before processing
EVENT_COUNT=$(wc -l < "$SESSION_LOG" | tr -d ' ')
if [ "$EVENT_COUNT" -eq 0 ]; then
    exit 0
fi

GENERATED=0
TIMESTAMP=$(date "+%Y-%m-%d %H:%M")

# Process each event and generate exercise stubs
while IFS= read -r line; do
    # Skip empty lines
    [ -z "$line" ] && continue

    EVENT_TYPE=$(echo "$line" | jq -r '.type // empty' 2>/dev/null)
    EVENT_PATH=$(echo "$line" | jq -r '.path // empty' 2>/dev/null)
    EVENT_CONTEXT=$(echo "$line" | jq -r '.context // empty' 2>/dev/null)
    EVENT_SESSION=$(echo "$line" | jq -r '.session // "unknown"' 2>/dev/null)

    # Skip if we can't parse the event
    [ -z "$EVENT_TYPE" ] && continue

    # Skip if this path already has a pending exercise
    if [ -n "$EVENT_PATH" ] && grep -qF "$EVENT_PATH" "$EXERCISES_FILE" 2>/dev/null; then
        continue
    fi

    case "$EVENT_TYPE" in
        file_created)
            cat >> "$EXERCISES_FILE" <<EOF

## Prediction > Observation > Reflection
- **File:** \`$EVENT_PATH\`
- **Context:** $EVENT_CONTEXT
- **Session:** $EVENT_SESSION
- **Generated:** $TIMESTAMP

**Exercise:** Before reading this file, predict what it does based on its name and context. Then read it. What surprised you? What matched your prediction?

---
EOF
            GENERATED=$((GENERATED + 1))
            ;;

        arch_decision)
            cat >> "$EXERCISES_FILE" <<EOF

## Generation > Comparison
- **File:** \`$EVENT_PATH\`
- **Context:** $EVENT_CONTEXT
- **Session:** $EVENT_SESSION
- **Generated:** $TIMESTAMP

**Exercise:** How would YOU approach this problem? Write your approach first, then compare with what was implemented. Where do the approaches differ? Why might one be preferred?

---
EOF
            GENERATED=$((GENERATED + 1))
            ;;

        pattern_used)
            cat >> "$EXERCISES_FILE" <<EOF

## Trace the Path
- **File:** \`$EVENT_PATH\`
- **Context:** $EVENT_CONTEXT
- **Session:** $EVENT_SESSION
- **Generated:** $TIMESTAMP

**Exercise:** Walk through the execution path step by step. What triggers this code? What happens at each stage? Where does control flow go next?

---
EOF
            GENERATED=$((GENERATED + 1))
            ;;

        error_resolved)
            cat >> "$EXERCISES_FILE" <<EOF

## Debug This
- **File:** \`$EVENT_PATH\`
- **Context:** $EVENT_CONTEXT
- **Session:** $EVENT_SESSION
- **Generated:** $TIMESTAMP

**Exercise:** What went wrong here? What was the root cause? How was it fixed? Could this class of error happen elsewhere?

---
EOF
            GENERATED=$((GENERATED + 1))
            ;;

        file_modified|test_created)
            cat >> "$EXERCISES_FILE" <<EOF

## Prediction > Observation > Reflection
- **File:** \`$EVENT_PATH\`
- **Context:** $EVENT_CONTEXT
- **Session:** $EVENT_SESSION
- **Generated:** $TIMESTAMP

**Exercise:** Read the changes to this file. What problem was being solved? Could you have predicted this approach?

---
EOF
            GENERATED=$((GENERATED + 1))
            ;;
    esac
done < "$SESSION_LOG"

# Clear the session log after processing to prevent duplicate exercises
> "$SESSION_LOG"

if [ "$GENERATED" -gt 0 ]; then
    echo "Learning: $GENERATED exercise(s) generated. Run /learn in your next session." >&2
fi

exit 0
