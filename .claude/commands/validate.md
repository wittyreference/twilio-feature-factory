# Deep Validation

Deep validation of Twilio operations beyond HTTP 200 OK responses.

## Purpose

A 200 OK from Twilio API doesn't guarantee success. A call can be "completed" from Twilio's perspective but still fail from the user's perspective (e.g., hearing "application error has occurred" instead of AI conversation).

This command invokes the MCP validation tools to verify:
- Resource status is truly successful
- Debugger has no related alerts
- Call notifications show no errors
- Voice Insights has no error tags
- Content quality (recordings, transcripts) shows no error messages

## Usage

$ARGUMENTS

## MCP Tools Available

Use these tools via the MCP server:

### validate_call
Deep validate a call - checks status, notifications, events, Voice Insights, and optionally content quality.

```
Call SID: $CALL_SID
Options:
- validateContent: true (check recordings/transcripts for error patterns)
- minDuration: 15 (seconds - shorter calls may indicate errors)
- forbiddenPatterns: ["application error", "please try again"]
- intelligenceServiceSid: "GAxxxx" (for transcript analysis)
```

### validate_message
Deep validate a message - checks delivery status and debugger alerts.

```
Message SID: $MESSAGE_SID
Options:
- waitForTerminal: true (wait for delivered/undelivered/failed)
- timeout: 30000 (ms)
```

### validate_debugger
Check Twilio debugger for errors in a time window.

```
Options:
- lookbackSeconds: 300 (5 minutes)
- resourceSid: "CAxxxx" (filter to specific resource)
- logLevel: "error" | "warning" | "notice" | "debug"
```

### validate_voice_ai_flow
Comprehensive validation for Voice AI flows - validates call, recording, transcript, message, and sync state.

```
Required:
- callSid: "CAxxxx"

Optional:
- recordingSid: "RExxxx"
- transcriptSid: "GTxxxx"
- smsSid: "SMxxxx"
- syncDocumentName: "conversation-xxx"
- forbiddenPatterns: ["error", "sorry"]
- intelligenceServiceSid: "GAxxxx"
```

### validate_two_way
Validate a two-way conversation between two calls (AI agent + customer).

```
Required:
- callSidA: "CAxxxx" (AI agent leg)
- callSidB: "CAyyyy" (customer leg)
- intelligenceServiceSid: "GAxxxx"

Optional:
- expectedTurns: 4 (minimum speaker turns)
- topicKeywords: ["appointment", "confirm"]
- successPhrases: ["thank you"]
- forbiddenPatterns: ["error"]
```

### validate_recording
Validate a recording completed successfully.

```
Recording SID: $RECORDING_SID
Options:
- waitForCompleted: true
- timeout: 60000 (ms)
```

### validate_transcript
Validate a Voice Intelligence transcript completed successfully.

```
Transcript SID: $TRANSCRIPT_SID
Options:
- waitForCompleted: true
- timeout: 120000 (ms)
- checkSentences: true
```

## Examples

### Validate a call with content checking

```
/validate call CA1234567890abcdef --content --min-duration 30
```

This will:
1. Check call status is "completed"
2. Check debugger for related alerts
3. Check call notifications for errors
4. Check Voice Insights for error tags
5. Check recordings/transcripts for forbidden patterns

### Validate after Voice AI session

```
/validate voice-ai CA1234567890abcdef --recording RE5678 --intelligence GAabcd
```

This validates the entire flow:
1. Call completed successfully
2. Recording is available
3. Transcript has no error messages
4. Debugger shows no alerts

### Check debugger for recent errors

```
/validate debugger --lookback 600
```

Checks for any errors in the last 10 minutes.

## What Gets Checked

### For Calls
| Check | Source | What It Validates |
|-------|--------|-------------------|
| resourceStatus | calls(sid).fetch() | Status is completed (not failed/busy/no-answer) |
| debuggerAlerts | monitor.alerts.list() | No alerts related to this SID |
| callNotifications | calls(sid).notifications.list() | No error-level notifications |
| callEvents | insights.v1.calls(sid).events.list() | No HTTP errors in webhook requests |
| voiceInsights | insights.v1.calls(sid).summary().fetch() | No error tags in call summary |
| callContent | recordings + transcripts | No forbidden patterns, adequate duration |

### For Messages
| Check | Source | What It Validates |
|-------|--------|-------------------|
| resourceStatus | messages(sid).fetch() | Status is delivered (not failed/undelivered) |
| debuggerAlerts | monitor.alerts.list() | No alerts related to this SID |

## False Positive Detection

The key insight: A call can be "completed" but the user heard an error message.

Content validation catches this by:
1. Checking call duration (short calls often indicate errors)
2. Checking recordings exist (if required)
3. Checking transcript text for error patterns like:
   - "application error"
   - "we're sorry"
   - "cannot be completed"
   - "please try again later"

## When to Use Validation

- **After making calls**: Verify the call truly worked
- **After sending SMS**: Verify delivery, not just acceptance
- **After Voice AI sessions**: Verify full flow success
- **Debugging issues**: Find what went wrong beyond HTTP 200
- **In CI/CD**: Automated validation of Twilio operations
