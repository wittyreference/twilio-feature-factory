# Context Fundamentals for Twilio Development

This skill teaches core context engineering principles applied to Twilio CPaaS prototyping.

## Core Concept

Context engineering is the holistic curation of all information that enters the model's limited attention budget. Effective context engineering means finding the smallest set of high-signal tokens that maximize the likelihood of desired outcomes.

## The Twilio Context Challenge

Twilio development involves multiple context sources that compete for attention:

| Context Source | Size | Signal Value |
|----------------|------|--------------|
| CLAUDE.md files | ~500 lines each | High - project standards |
| Webhook payloads | 20+ fields | Medium - most fields unused |
| TwiML responses | 10-100+ lines | Medium - structure matters |
| Error logs | Variable | High when debugging |
| Test output | 50-500 lines | Low after passing |

## When to Load Context

### Starting a New Feature

Load:
- Root `CLAUDE.md` (always loaded automatically)
- Relevant subdirectory `CLAUDE.md` (e.g., `functions/voice/CLAUDE.md`)
- Similar existing function as pattern reference

Avoid loading:
- Unrelated CLAUDE.md files
- Full test suites
- Historical git logs

### Debugging a Failure

Load:
- `/twilio-logs` output (recent errors only)
- The failing function code
- Related test file
- Twilio error code reference

Avoid loading:
- Full webhook payload history
- Unrelated function files
- Passing test output

### Long Development Sessions

After 10+ exchanges:
- Summarize progress so far
- Drop resolved discussion threads
- Keep only active file contents
- Retain key decisions made

## Twilio-Specific Context Patterns

### Webhook Payload Context

Full payload (low efficiency):
```json
{
  "AccountSid": "ACxxxxx",
  "ApiVersion": "2010-04-01",
  "Body": "Hello",
  "From": "+15551234567",
  "FromCity": "San Francisco",
  "FromCountry": "US",
  "FromState": "CA",
  "FromZip": "94102",
  "MessageSid": "SMxxxxx",
  "NumMedia": "0",
  "NumSegments": "1",
  "SmsMessageSid": "SMxxxxx",
  "SmsSid": "SMxxxxx",
  "SmsStatus": "received",
  "To": "+15559876543",
  "ToCity": "New York",
  "ToCountry": "US",
  "ToState": "NY",
  "ToZip": "10001"
}
```

Essential context (high efficiency):
```
SMS received: +1555...4567 → +1555...6543
Body: "Hello"
MessageSid: SMxxxxx
```

### TwiML Response Context

Full TwiML (low efficiency):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy" language="en-GB">Welcome to our service.</Say>
  <Gather input="dtmf speech" timeout="5" numDigits="1" action="/voice/handle-input" method="POST">
    <Say>Press 1 for sales, 2 for support, or say your request.</Say>
  </Gather>
  <Say>We didn't receive any input. Goodbye.</Say>
  <Hangup/>
</Response>
```

Compressed context (high efficiency):
```
Voice flow: Say(welcome) → Gather(dtmf+speech, 5s, 1 digit) → Say(menu) → Hangup
Action: /voice/handle-input
```

### Function Context

When referencing a function, include:
- ABOUTME comments (2 lines)
- Handler signature
- Key logic branches
- Return/callback patterns

Omit:
- Import statements (unless debugging)
- Boilerplate error handling
- Comments explaining obvious code

## Context Budget Guidelines

| Task Type | Recommended Context Size |
|-----------|-------------------------|
| Simple bug fix | 1 file + error message |
| New function | Pattern file + CLAUDE.md |
| Feature with tests | 2-3 files max |
| Complex refactor | 4-5 files, summarized |
| Full workflow | Use orchestrator, load per-phase |

## Key Practices

1. **Load on demand**: Don't pre-load all CLAUDE.md files; load relevant ones when entering that domain

2. **Summarize frequently**: After completing a sub-task, summarize what was done before moving on

3. **Drop resolved context**: Once a test passes, the full test output is no longer needed

4. **Preserve decisions**: Keep key architectural decisions even when dropping implementation details

5. **Use references**: Instead of loading full files, reference them: "See `functions/voice/CLAUDE.md` for TwiML patterns"

6. **Consult doc-map first**: Check `.claude/references/doc-map.md` before starting work to identify which docs to load for the current operation

## Documentation Flywheel

The project uses a file-based documentation flywheel:

1. **Before acting**: Consult doc-map.md to identify relevant docs
2. **During work**: Hooks track files changed
3. **After completing**: Hooks write suggestions to `pending-actions.md`
4. **Before commits**: Read `pending-actions.md` and address suggestions

This ensures knowledge is captured and promoted to permanent documentation.

## Anti-Patterns to Avoid

- Loading all function files "just in case"
- Keeping full error logs after the error is fixed
- Including passing test output in ongoing context
- Loading multiple CLAUDE.md files simultaneously
- Repeating the same context in every message
