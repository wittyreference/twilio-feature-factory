# Context Engineering for Twilio Development

Unified context management skill — fundamentals, compression techniques, and session optimization.

## Quick Reference: Compression Ratios

| Content Type | Ratio | Preserve | Drop |
|-------------|-------|----------|------|
| TwiML | 5:1 | Verb sequence, actions, key attrs | XML boilerplate, default attrs |
| Webhook payload | 4:1 | From/To, SID, status, body/digits | AccountSid, ApiVersion, geo fields |
| Test output (pass) | 10:1 | Count by category | Individual test names |
| Test output (fail) | 3:1 | Test name, expected vs received | Stack traces |
| Error logs | 5:1 | Error code, URL, count, timeframe | Duplicate entries |
| Conversation history | 8:1 | Decisions, files changed, current state | Implementation details |

## When to Compress

- TwiML responses > 20 lines → `Voice: Say(x) → Gather(y) → Dial(z)`
- Webhook payloads > 5 fields → `SMS from +1555...4567: "Hello" (SMxxx)`
- Test output > 50 lines → `Tests: 12 passed (voice: 4, messaging: 4, verify: 4)`
- Error logs with repeats → `Error 11200: /voice/incoming 502 — 5 occurrences in 2 min`
- Session history > 10 exchanges → summarize progress, drop resolved threads

## Context Budget

| Task Type | Recommended Load |
|-----------|-----------------|
| Simple bug fix | 1 file + error message |
| New function | Pattern file + domain CLAUDE.md |
| Feature with tests | 2-3 files max |
| Complex refactor | 4-5 files, summarized |
| Full workflow | Use orchestrator, load per-phase |

## Loading Strategy

**Always loaded** (~2,900 tokens / 1.4% of 200K):
- Root CLAUDE.md, .meta/CLAUDE.md, MEMORY.md

**Load on demand** (when entering domain):
- Domain CLAUDE.md (e.g., `functions/voice/CLAUDE.md`)
- Similar existing function as pattern
- Relevant test file

**Avoid loading**:
- CLAUDE.md files for domains you're not touching
- Full test suites (just the relevant test)
- Historical git logs
- Passing test output (compress to counts)

## Session Optimization

**After 10+ exchanges**: Summarize progress, drop resolved discussions, keep decisions.

**Session summary format**:
```markdown
## Session Summary
### Completed: [tasks done]
### In Progress: [current work]
### Key Decisions: [choices made]
### Files Modified: [file list]
```

## Twilio-Specific Patterns

**TwiML compression**: `Say(welcome, Amy) → Gather(dtmf+speech, 5s) → Redirect(/ivr)`

**ConversationRelay compression**: `CR: wss://relay.example.com (Amy, Deepgram STT, interruptible)`

**Webhook compression**: `Inbound call: +1555...4567 → +1555...6543 (CAxxx, ringing)`

**Gather result**: `Gather: DTMF="2", Speech="support please" (92% confidence)`

**Verify status**: `Verify: +1555...4567 via SMS → pending (VExxx)`

## When NOT to Compress

Keep full context when actively debugging, writing new code from a pattern, first encounter with an API, doing code review, or security auditing.

## Anti-Patterns

- Loading all CLAUDE.md files "just in case"
- Keeping full error logs after the bug is fixed
- Including passing test output in ongoing context
- Repeating the same context in every message
- Loading full webhook payloads when only From/To/Body matter
