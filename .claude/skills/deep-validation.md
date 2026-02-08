# Deep Validation Patterns for Twilio

This skill covers validation patterns that go beyond simple API response checking. Load this skill when testing Twilio integrations or building validation into workflows.

## Why Deep Validation Matters

A 200 OK from Twilio API doesn't guarantee success. The operation may be queued but:
- TwiML validation could fail later
- Carrier could reject the message
- Webhook could return errors
- Call could fail to connect
- Voice quality could be degraded

Tests that only check for 200 OK give false confidence.

## The Deep Validation Pattern

For each operation type, check multiple signals after API operations:

### SMS/MMS Validation

```typescript
interface MessageValidation {
  // Primary: Check message status progression
  resourceStatus: {
    passed: boolean;
    status: 'queued' | 'sending' | 'sent' | 'delivered' | 'undelivered' | 'failed';
  };

  // Secondary: Check for debugger alerts
  debuggerAlerts: {
    passed: boolean;
    alerts: Alert[];  // Error codes 30003, 30004, etc.
  };

  // Optional: Check callback data (if callbacks configured)
  callbackReceived: {
    passed: boolean;
    data: object;
  };
}
```

**Status progression**: `queued` → `sending` → `sent` → `delivered`

**Common failure codes**:
| Code | Meaning |
|------|---------|
| 30003 | Unreachable destination |
| 30004 | Message blocked |
| 30005 | Unknown destination |
| 30006 | Landline or unreachable |
| 30007 | Carrier violation |

### Voice Call Validation

```typescript
interface CallValidation {
  // Primary: Check call status
  resourceStatus: {
    passed: boolean;
    status: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'no-answer' | 'failed';
  };

  // Secondary: Check call events for HTTP errors
  callEvents: {
    passed: boolean;
    events: Event[];  // HTTP requests/responses during call
  };

  // Secondary: Check debugger for TwiML errors
  debuggerAlerts: {
    passed: boolean;
    alerts: Alert[];
  };

  // Quality: Voice Insights call summary
  voiceInsights: {
    passed: boolean;
    summary: {
      callQuality: string;
      disposition: string;
      jitter: number;
      packetLoss: number;
    };
  };
}
```

**Status progression**: `queued` → `ringing` → `in-progress` → `completed`

### Conference Validation

```typescript
interface ConferenceValidation {
  // All call validation checks, plus:

  // Conference-specific: Summary metrics
  conferenceSummary: {
    passed: boolean;
    participantCount: number;
    duration: number;
    aggregateQuality: string;
  };

  // Per-participant quality
  participantSummaries: {
    passed: boolean;
    participants: ParticipantSummary[];
  };
}
```

### Verification Validation

```typescript
interface VerificationValidation {
  // Primary: Check verification status
  resourceStatus: {
    passed: boolean;
    status: 'pending' | 'approved' | 'canceled' | 'max_attempts_reached' | 'expired';
  };

  // Secondary: Debugger alerts
  debuggerAlerts: {
    passed: boolean;
    alerts: Alert[];
  };
}
```

## Timing Considerations

### Voice/Conference Insights Timing

Summaries are NOT immediately available after call/conference ends:

| State | When Available | Use |
|-------|----------------|-----|
| Partial | ~2 minutes after end (no SLA) | Quick validation |
| Complete | 30 minutes after end (guaranteed) | Final validation |

Check `processingState` field:
```typescript
const summary = await client.insights.v1.calls(callSid).summary().fetch();
if (summary.processingState === 'complete') {
  // Data is final and immutable
} else if (summary.processingState === 'partial') {
  // Data may change, consider polling or waiting
}
```

### Debugger Alert Timing

Query debugger for alerts in the timeframe of your operation:
```typescript
const alerts = await client.monitor.alerts.list({
  startDate: operationStartTime,
  endDate: new Date(),
  logLevel: 'error'
});
```

## MCP Validation Tools (Preferred Method)

**USE THESE MCP TOOLS** instead of CLI commands or manual API polling. They're available via the Twilio MCP server.

### Available Tools

| MCP Tool | Purpose |
|----------|---------|
| `validate_call` | Deep call validation with Voice Insights, events, content quality |
| `validate_message` | Message delivery validation with debugger check |
| `validate_recording` | Recording completion validation |
| `validate_transcript` | Transcript completion + sentence validation |
| `validate_debugger` | Account-wide debugger error check |
| `validate_voice_ai_flow` | Full Voice AI flow (call + recording + transcript + SMS) |
| `validate_two_way` | Two-way conversation validation |
| `validate_language_operator` | Language Operator results validation |

### Using MCP Tools (Claude Code)

```text
# Validate a call - checks status, events, Voice Insights
validate_call(callSid: "CA123...", validateContent: true)

# Validate message delivery
validate_message(messageSid: "SM456...")

# Full Voice AI flow validation
validate_voice_ai_flow(
  callSid: "CA123...",
  forbiddenPatterns: ["application error", "please try again"]
)

# Check debugger for recent errors
validate_debugger(lookbackSeconds: 300, logLevel: "error")
```

### Why MCP Tools Over CLI

| CLI Approach | MCP Tool Approach |
|--------------|-------------------|
| Manual polling with retries | Automatic polling with timeout |
| Parse text output | Structured JSON response |
| Multiple commands needed | Single tool call |
| No content validation | Forbidden pattern detection |
| Manual error correlation | Unified error reporting |

## Using the DeepValidator (Programmatic)

For programmatic use in Node.js, the DeepValidator helper is at `agents/mcp-servers/twilio/src/validation/deep-validator.ts`:

```typescript
import { DeepValidator } from '../validation/deep-validator';

// Validate a message
const result = await DeepValidator.validateMessage(messageSid, {
  waitForTerminal: true,  // Wait for delivered/failed status
  timeout: 30000          // Max wait time
});

if (!result.success) {
  console.log('Failures:', result.errors);
}

// Validate a call
const callResult = await DeepValidator.validateCall(callSid, {
  waitForComplete: true,
  checkVoiceInsights: true
});

// Validate a conference
const confResult = await DeepValidator.validateConference(conferenceSid, {
  waitForComplete: true,
  checkParticipantQuality: true
});
```

## Integration with Tests

### Jest Matchers

The test helper provides custom matchers:

```typescript
import { setupDeepValidation } from '../helpers/deep-validation';

beforeAll(() => {
  setupDeepValidation();
});

test('SMS delivers successfully', async () => {
  const message = await sendTestSms();

  await expect(message.sid).toBeDelivered();
  await expect(message.sid).toHaveNoDebuggerAlerts();
});

test('Call completes with good quality', async () => {
  const call = await makeTestCall();

  await expect(call.sid).toCompleteSuccessfully();
  await expect(call.sid).toHaveGoodVoiceQuality();
});
```

### Callback Infrastructure

For deep validation of callbacks, the project uses Sync-based callback capture:

```
functions/callbacks/
├── status-callback.protected.js    # Captures message/call status
├── fallback-handler.protected.js   # Captures fallback events
└── voice-events.protected.js       # Captures voice events

All callbacks write to Sync documents with 24hr TTL for test retrieval.
```

## Validation Checklist

### For Every Operation

- [ ] Check resource status via API
- [ ] Query debugger for errors in timeframe
- [ ] Verify no unexpected alerts

### For Voice Calls

- [ ] Check call events for HTTP errors
- [ ] Verify Voice Insights summary (after 2+ minutes)
- [ ] Check quality metrics if available

### For Conferences

- [ ] All call validation checks
- [ ] Conference summary metrics
- [ ] Per-participant quality checks

### For SMS/MMS

- [ ] Wait for terminal status (delivered/failed)
- [ ] Check for carrier rejection codes
- [ ] Verify callback data if configured

## Anti-Patterns

### Don't Do This

```typescript
// BAD: Only checking HTTP status
const response = await client.messages.create({ to, from, body });
if (response.sid) {
  console.log('Success!');  // False confidence
}
```

### Do This Instead (MCP Tool)

```text
# BEST: Use MCP validation tool
validate_message(messageSid: "SM123...", waitForTerminal: true)
```

### Do This Instead (Programmatic)

```typescript
// GOOD: Deep validation in code
const message = await client.messages.create({ to, from, body });
const validation = await DeepValidator.validateMessage(message.sid, {
  waitForTerminal: true
});

if (validation.success) {
  console.log('Message delivered successfully');
} else {
  console.log('Issues found:', validation.errors);
}
```

## Related Documentation

- [MCP Validation Tools](/agents/mcp-servers/twilio/src/tools/validation.ts) - Tool definitions
- [DeepValidator source](/agents/mcp-servers/twilio/src/validation/deep-validator.ts) - Library implementation
- [Validation CLAUDE.md](/agents/mcp-servers/twilio/src/validation/CLAUDE.md) - Validation patterns
- [Callback functions](/functions/callbacks/CLAUDE.md) - Callback infrastructure
- [Voice skill](/.claude/skills/voice.md) - Voice-specific validation
