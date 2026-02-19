# Context Compression for Twilio

Techniques for compressing Twilio-specific content to preserve context budget.

## When to Compress

Compress when you encounter:

- TwiML responses longer than 20 lines
- Webhook payloads with more than 5 relevant fields
- Test output exceeding 50 lines
- Conversation history beyond 10 exchanges
- Multiple similar error messages
- Repeated function patterns

## Compression Techniques

### TwiML Compression

**Voice TwiML**

Before (full XML):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy" language="en-GB">Welcome to Acme Corp.</Say>
  <Gather input="dtmf speech" timeout="5" numDigits="1" action="/voice/menu" method="POST">
    <Say voice="Polly.Amy">Press 1 for sales, 2 for support.</Say>
  </Gather>
  <Say>No input received.</Say>
  <Redirect>/voice/incoming-call</Redirect>
</Response>
```

After (compressed):
```
Voice: Say(welcome, Amy) → Gather(dtmf+speech, 5s) → Say(menu) → Redirect(/voice/incoming-call)
```

**Messaging TwiML**

Before:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message to="+15551234567" from="+15559876543">
    <Body>Thanks for your order #12345. It will arrive in 2-3 days.</Body>
    <Media>https://example.com/receipt.pdf</Media>
  </Message>
</Response>
```

After:
```
SMS reply: Order confirmation #12345 + receipt PDF attachment
```

**ConversationRelay TwiML**

Before:
```xml
<Response>
  <Connect>
    <ConversationRelay url="wss://ai.example.com/relay" voice="Polly.Amy"
      language="en-US" transcriptionProvider="google" speechModel="telephony"
      profanityFilter="true" dtmfDetection="true" interruptible="true"/>
  </Connect>
</Response>
```

After:
```
ConversationRelay: wss://ai.example.com/relay (Amy, Google STT, interruptible)
```

### Webhook Payload Compression

**Voice Webhook**

Before (20+ fields):
```json
{
  "AccountSid": "ACxxxxx",
  "CallSid": "CAxxxxx",
  "CallStatus": "ringing",
  "Called": "+15559876543",
  "Caller": "+15551234567",
  "Direction": "inbound",
  "From": "+15551234567",
  "To": "+15559876543",
  ...
}
```

After:
```
Inbound call: +1555...4567 → +1555...6543 (CAxxxxx, ringing)
```

**Gather Results**

Before:
```json
{
  "AccountSid": "ACxxxxx",
  "CallSid": "CAxxxxx",
  "Digits": "2",
  "SpeechResult": "support please",
  "Confidence": "0.92",
  ...
}
```

After:
```
Gather result: DTMF="2", Speech="support please" (92% confidence)
```

**SMS Webhook**

Before (15+ fields):
```json
{
  "AccountSid": "ACxxxxx",
  "Body": "What are your hours?",
  "From": "+15551234567",
  "MessageSid": "SMxxxxx",
  "NumMedia": "0",
  "To": "+15559876543",
  ...
}
```

After:
```
SMS from +1555...4567: "What are your hours?" (SMxxxxx)
```

**Verify Webhook**

Before:
```json
{
  "verification_sid": "VExxxxx",
  "to": "+15551234567",
  "channel": "sms",
  "status": "pending",
  "valid": false,
  ...
}
```

After:
```
Verify: +1555...4567 via SMS → pending (VExxxxx)
```

### Test Output Compression

**Jest Results**

Before (100+ lines):
```
PASS __tests__/unit/voice/incoming-call.test.js
  incoming-call handler
    ✓ returns valid TwiML (15 ms)
    ✓ includes Say verb with greeting (3 ms)
    ✓ includes Gather for input (2 ms)
    ✓ handles missing parameters (4 ms)

PASS __tests__/unit/messaging/incoming-sms.test.js
  ...
```

After:
```
Tests: 12 passed (voice: 4, messaging: 4, verify: 4) - all green
```

**Failed Test**

Before:
```
FAIL __tests__/unit/verify/start-verification.test.js
  ● start-verification › should return error for missing phone

    expect(received).toEqual(expected)

    Expected: {"success": false, "error": "Missing required parameter: to"}
    Received: {"success": false, "error": "Missing parameter"}
```

After:
```
FAIL: start-verification "missing phone" test
Expected error: "Missing required parameter: to"
Got: "Missing parameter"
```

### Error Log Compression

**Twilio Debugger Logs**

Before (multiple entries):
```
[ERROR 11200] 2024-01-15 10:23:45 HTTP retrieval failure
  URL: https://example.com/voice/incoming
  Response: 502 Bad Gateway

[ERROR 11200] 2024-01-15 10:23:52 HTTP retrieval failure
  URL: https://example.com/voice/incoming
  Response: 502 Bad Gateway

[ERROR 11200] 2024-01-15 10:24:01 HTTP retrieval failure
  ...
```

After:
```
Error 11200 (HTTP failure): /voice/incoming returning 502 - 5 occurrences in 2 min
```

### Conversation History Compression

**Long Development Session**

Before (15 exchanges):
```
User: Create a voice IVR
Assistant: [200 lines of implementation]
User: Add option 3 for billing
Assistant: [100 lines of changes]
User: Tests are failing
Assistant: [debugging discussion]
User: Now it passes
...
```

After:
```
Session summary:
- Created voice IVR with 3 options (sales, support, billing)
- Files: incoming-call.js, menu-handler.js + tests
- Tests: All passing
- Current: Ready for review
```

## Compression Patterns

| Content Type | Compression Ratio | Key Elements to Preserve |
|--------------|-------------------|-------------------------|
| TwiML | 5:1 | Verb sequence, actions, key attributes |
| Webhook payload | 4:1 | From/To, SID, status, body/digits |
| Test output (pass) | 10:1 | Count by category, all green |
| Test output (fail) | 3:1 | Test name, expected vs received |
| Error logs | 5:1 | Error code, URL, count, timeframe |
| Conversation | 8:1 | Decisions made, files changed, current state |

## When NOT to Compress

Keep full context when:

- Actively debugging (need exact error messages)
- Writing new code (need exact patterns to follow)
- First encounter with a Twilio API (need full documentation)
- Code review (need exact line numbers)
- Security audit (need full credential patterns)
