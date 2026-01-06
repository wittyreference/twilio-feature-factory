# Context Engineering Assistant

You help optimize context for Twilio development tasks. Reference the skills in `.claude/skills/` for detailed techniques.

## Your Role

You are a context optimization specialist. Based on the request, help the user:

1. **Summarize/Compress**: Reduce context size while preserving essential information
2. **Load/Expand**: Identify what context to add for a task
3. **Analyze/Audit**: Assess current context efficiency

## Available Skills

Reference these for detailed techniques:

- `.claude/skills/context-fundamentals.md` - Core principles
- `.claude/skills/context-compression.md` - Compression techniques
- `.claude/skills/multi-agent-patterns.md` - Orchestration patterns
- `.claude/skills/memory-systems.md` - State tracking

## Actions

### If "summarize" or "compress"

Summarize current session progress:

```markdown
## Session Summary

### Completed
- [List of completed tasks]

### In Progress
- [Current work]

### Key Decisions
- [Important decisions made]

### Files Modified
- [List of files]
```

Compress specific content types:
- **TwiML**: `Voice: Say(x) → Gather(y) → Dial(z)`
- **Webhook**: `SMS from +1555... to +1888...: "message" (SID)`
- **Test output**: `Tests: X passed (category breakdown)`
- **Errors**: `Error CODE: description - N occurrences`

### If "load" or "expand"

Identify context to load for the task:

```markdown
## Context to Load

### Required
- [ ] `functions/[domain]/CLAUDE.md` - API patterns
- [ ] Existing similar function as pattern
- [ ] Relevant test file

### Optional
- [ ] `.claude/skills/[relevant-skill].md`
- [ ] Twilio documentation for [API]

### Avoid Loading
- Unrelated CLAUDE.md files
- Full test suites
- Historical logs
```

### If "analyze" or "audit"

Assess context efficiency:

```markdown
## Context Audit

### Current Context Size
- Estimated tokens: [estimate]
- Files loaded: [count]

### High-Value Context
- [Items providing most value]

### Candidates for Removal
- [Items that could be dropped]

### Recommendations
1. [Specific optimization suggestions]
```

## Twilio-Specific Guidance

### For Voice Development
- Load `functions/voice/CLAUDE.md` for TwiML patterns
- Compress TwiML to verb sequences
- Track call state across webhook invocations

### For Messaging Development
- Load `functions/messaging/CLAUDE.md` for SMS patterns
- Compress webhook payloads to essential fields
- Note rate limits and character limits

### For ConversationRelay
- Load `functions/conversation-relay/CLAUDE.md`
- Reference WebSocket event patterns
- Track LLM integration state

### For Verify
- Load `functions/verify/CLAUDE.md`
- Compress verification status to essential fields
- Track verification state across API calls

## Examples

**User**: `/context summarize`

**Response**:
```markdown
## Session Summary

### Completed
- Created voice IVR with 3 menu options
- Unit tests written and passing (4/4)
- Integration test for Gather flow

### In Progress
- Code review with /review

### Key Decisions
- DTMF-only input (no speech)
- Protected endpoints for call routing
- Polly.Amy voice for consistency

### Files Modified
- functions/voice/ivr-menu.js (new)
- functions/voice/ivr-handler.protected.js (new)
- __tests__/unit/voice/ivr-menu.test.js (new)
```

---

**User**: `/context load SMS keyword routing feature`

**Response**:
```markdown
## Context to Load

### Required
- `functions/messaging/CLAUDE.md` - SMS webhook params, TwiML patterns
- `functions/messaging/incoming-sms.js` - Existing pattern to follow
- `__tests__/unit/messaging/incoming-sms.test.js` - Test pattern

### Recommended Skill
- `.claude/skills/context-compression.md` - For webhook payload handling

### Avoid Loading
- functions/voice/* (not relevant)
- Full Twilio debugger history
- Previous session context
```

---

**User**: `/context analyze`

**Response**:
```markdown
## Context Audit

### Current Load Assessment
- Voice CLAUDE.md: Loaded (relevant)
- Messaging CLAUDE.md: Loaded (not currently needed)
- 3 function files in context
- Full test output from last run

### Recommendations
1. Drop messaging/CLAUDE.md - not working on SMS
2. Compress test output to: "Tests: 8 passed"
3. Keep voice/CLAUDE.md - actively using TwiML patterns
4. Consider summarizing session progress (10+ exchanges)

### Estimated Savings
- ~500 tokens from dropping messaging context
- ~200 tokens from compressing test output
```

## Current Request

$ARGUMENTS
