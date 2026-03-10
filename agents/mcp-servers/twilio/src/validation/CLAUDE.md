// ABOUTME: Validates Twilio operations beyond HTTP 200 responses (success confirmation).
// ABOUTME: Checks debugger alerts, status progression, callbacks, content quality, and side effects.

# Deep Validation

This directory contains helpers for validating Twilio API operations beyond simple 200 OK responses.

## Purpose

A 200 OK from Twilio API doesn't guarantee success. The message may be queued but:
- TwiML validation could fail later
- Carrier could reject the message
- Webhook could return errors
- Call could fail to connect

The deep validator checks multiple signals to verify actual operation success.

**For full API documentation, TypeScript interfaces, and integration patterns, see [REFERENCE.md](./REFERENCE.md).**

## Files

| File | Purpose |
|------|---------|
| `deep-validator.ts` | Main validation class with methods for messages, calls, verifications, tasks |
| `diagnostic-bridge.ts` | Connects validation failures to learning capture with root cause analysis |
| `learning-capture.ts` | Auto-captures learnings from validation failures to learnings.md |
| `pattern-tracker.ts` | Tracks recurring validation failure patterns across sessions |
| `comprehensive-validator.ts` | Orchestrates validators based on products used, feeds to self-healing loop |
| `index.ts` | Exports public API |

## Error Classification (Scalable Approach)

The DiagnosticBridge uses **range-based error classification** instead of mapping individual error codes. This scales to Twilio's 1500+ error codes without manual maintenance.

### Error Code Ranges

| Range  | Category      | Domain                              |
|--------|---------------|-------------------------------------|
| 11xxx  | code          | HTTP/webhook retrieval errors       |
| 12xxx  | code          | TwiML parsing/validation errors     |
| 13xxx  | code          | Voice call errors                   |
| 20xxx  | configuration | Authentication/API errors           |
| 21xxx  | configuration | Phone number/account errors         |
| 30xxx  | external      | Messaging delivery (carrier) errors |
| 31xxx  | external      | Messaging sending errors            |
| 32xxx  | configuration | Messaging Service errors            |
| 34xxx  | configuration | A2P 10DLC registration errors       |
| 60xxx  | code          | Verify service errors               |
| 63xxx  | external      | Verify delivery errors              |
| 64xxx  | code          | Voice/TTS/ConversationRelay errors  |
| 80xxx  | code          | Recording errors                    |
| 82xxx  | code          | Transcription errors                |
| 90xxx  | configuration | TaskRouter errors                   |

### How It Works

1. **ANY error or warning from debugger = failure that needs attention**
2. Error code determines the category via range lookup
3. Twilio's error message is used directly (not pre-mapped)
4. Fix suggestions are generic per domain, not per error code

## Validation Checks

For each operation, the validator runs multiple checks:

### Messages

| Check | Source | What It Validates |
|-------|--------|-------------------|
| resourceStatus | `messages(sid).fetch()` | Status is queued/sent/delivered (not failed/undelivered) |
| debuggerAlerts | `monitor.alerts.list()` | No alerts related to this SID |
| syncCallbacks | Sync Document | Callback data received (if Sync configured) |

### Calls

| Check | Source | What It Validates |
|-------|--------|-------------------|
| resourceStatus | `calls(sid).fetch()` | Status is completed (not failed/busy/no-answer) |
| debuggerAlerts | `monitor.alerts.list()` | No alerts related to this SID |
| callNotifications | `calls(sid).notifications.list()` | No error-level notifications |
| callEvents | `insights.v1.calls(sid).events.list()` | No HTTP errors in webhook requests |
| callContent | recordings + transcripts | Content quality validation (see below) |
| voiceInsights | `insights.v1.calls(sid).summary().fetch()` | No error tags in call summary |
| syncCallbacks | Sync Document | Callback data received (if Sync configured) |

### Call Content Validation

**Problem solved**: A call can be "completed" from Twilio's perspective but the user heard an error message like "application error has occurred".

The `callContent` check validates the actual content of the call:

| Check | What It Validates |
|-------|-------------------|
| Duration heuristics | Call duration >= minDuration (default: 15s). Short calls often indicate early errors. |
| Recording existence | Recording exists if `requireRecording: true` |
| Transcript patterns | Transcript does NOT contain forbidden patterns |

**Default forbidden patterns**:
- "application error"
- "we're sorry"
- "cannot be completed"
- "not configured"
- "please try again later"
- "an error occurred"
- "system error"

**Usage**:

```typescript
const result = await validator.validateCall(callSid, {
  validateContent: true,           // Enable content validation
  minDuration: 30,                 // Minimum 30 seconds expected
  forbiddenPatterns: [             // Custom patterns to detect
    'application error',
    'please hold',
  ],
  intelligenceServiceSid: 'GAxxx', // For transcript analysis
  requireRecording: false,         // Don't require recording
});

// Check result
if (!result.checks.callContent?.passed) {
  console.error('Content validation failed:', result.checks.callContent.message);
}
```

**When to use**: Enable content validation for Voice AI applications where you need to verify the AI actually had a conversation, not just that the call completed.

### Verifications

| Check | Source | What It Validates |
|-------|--------|-------------------|
| resourceStatus | `verify.v2.services(sid).verifications(vid).fetch()` | Status is pending/approved (not canceled/expired) |
| debuggerAlerts | `monitor.alerts.list()` | No alerts related to service/verification |

### Tasks

| Check | Source | What It Validates |
|-------|--------|-------------------|
| resourceStatus | `taskrouter.v1.workspaces(ws).tasks(tid).fetch()` | Task status check |
| debuggerAlerts | `monitor.alerts.list()` | No alerts related to workspace |

### Conferences

| Check | Source | What It Validates |
|-------|--------|-------------------|
| resourceStatus | `conferences(sid).fetch()` | Conference status (init/in-progress/completed) |
| debuggerAlerts | `monitor.alerts.list()` | No alerts related to this conference SID |
| conferenceInsights | `insights.v1.conferences(sid).fetch()` | Conference Insights summary data |
| conferenceParticipantInsights | `insights.v1.conferences(sid).conferenceParticipants.list()` | Participant-level insights data |
| functionLogs | Serverless API | Function logs related to conference (if configured) |

### Two-Way Conversations

| Check | Source | What It Validates |
|-------|--------|-------------------|
| transcriptStatus | `intelligence.v2.transcripts` | Both call legs have completed transcripts |
| sentenceCount | `transcripts(sid).sentences.list()` | Sentences extracted from both sides |
| speakerTurns | Sentence analysis | Natural conversation flow with turn-taking |
| topicKeywords | Text analysis | Required keywords appear in conversation |
| successPhrases | Text analysis | Success indicators found |

**⚠️ Conference Insights Timing:**
- Summaries are NOT available immediately after conference end
- Partial data: ~2 minutes after conference end (no SLA)
- Final data: Locked and immutable 30 minutes after end
- The validator gracefully handles 404 responses when data isn't ready yet
- Check `processingState` field in response for data completeness

## Quick Start

```typescript
import { DeepValidator } from './validation';

const validator = new DeepValidator(twilioClient);

// Validate a message
const result = await validator.validateMessage('SMxxxx', {
  waitForTerminal: true,
  timeout: 30000,
  syncServiceSid: process.env.TWILIO_SYNC_SERVICE_SID,
});

if (!result.success) {
  console.error('Errors:', result.errors);
  console.log('Checks:', result.checks);
}
```

## Standalone Methods

Methods available without validating a specific operation:
- `validateDebugger()` - Check for recent debugger alerts
- `validateServerlessFunctions()` - Parse function logs
- `validateRecording()` - Check recording completion
- `validateTranscript()` - Check transcript status
- `validateLanguageOperator()` - Validate Language Operator results
- `validateConversationRelay()` - Validate WebSocket connection
- `validateTwoWay()` - Validate two-way conversations
- `validatePrerequisites()` - Check services exist before operations
- `validateSyncDocument()` - Validate Sync Document structure
- `validateSyncList()` - Validate Sync List items
- `validateSyncMap()` - Validate Sync Map keys
- `validateTaskRouter()` - Rich task validation

**See [REFERENCE.md](./REFERENCE.md) for complete method signatures, TypeScript interfaces, integration patterns, and test helpers.**

## Design Decision

See [DESIGN_DECISIONS.md D13](/DESIGN_DECISIONS.md#decision-13-deep-validation-pattern-for-api-responses) for the architectural rationale.
