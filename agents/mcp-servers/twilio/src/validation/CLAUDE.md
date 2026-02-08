# Deep Validation

This directory contains helpers for validating Twilio API operations beyond simple 200 OK responses.

## Purpose

A 200 OK from Twilio API doesn't guarantee success. The message may be queued but:
- TwiML validation could fail later
- Carrier could reject the message
- Webhook could return errors
- Call could fail to connect

The deep validator checks multiple signals to verify actual operation success.

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

### Example

```typescript
// Error 64101 is classified as:
// - Category: 'code' (64xxx range)
// - Domain: 'Voice/TTS/ConversationRelay'
// - Description: Uses Twilio's actual error message

// The diagnosis will look like:
{
  rootCause: {
    category: 'code',
    description: 'Error 64101 (Voice/TTS/ConversationRelay): Invalid voice attribute',
    confidence: 0.9
  }
}
```

### Why This Approach

- **Scales automatically** to all Twilio error codes
- **Uses authoritative source** (Twilio's error messages)
- **No maintenance** when Twilio adds new errors
- **Correct categorization** based on Twilio's own organization

## Usage

```typescript
import { DeepValidator, createDeepValidator } from './validation';

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

### Call Content Validation (New)

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
  // e.g., "Forbidden pattern found in transcript: application error"
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

## Standalone Validation Methods

These methods validate specific Twilio resources independently (not tied to a specific SID being validated):

### Debugger (validateDebugger)

Check for any debugger alerts in a time window:

```typescript
const result = await validator.validateDebugger({
  lookbackSeconds: 300,     // Last 5 minutes (default)
  logLevel: 'error',        // Filter by level
  resourceSid: 'CA123',     // Optional: filter to specific resource
});

// Result:
// - success: true if no error-level alerts
// - totalAlerts, errorAlerts, warningAlerts: counts
// - alerts[]: detailed alert data
// - timeRange: { start, end }
```

| Option | Default | Description |
|--------|---------|-------------|
| lookbackSeconds | 300 | How far back to search |
| logLevel | all | Filter: 'error', 'warning', 'notice', 'debug' |
| limit | 100 | Max alerts to fetch |
| resourceSid | - | Filter to specific resource |
| serviceSid | - | Filter to specific service |

### Serverless Logs (validateServerlessFunctions)

Parse console.log output from Twilio Functions:

```typescript
const result = await validator.validateServerlessFunctions({
  serverlessServiceSid: 'ZS123',  // Required
  environment: 'production',       // Default
  lookbackSeconds: 300,
  functionSid: 'ZH456',           // Optional filter
  searchText: 'error',            // Optional text search
});

// Result:
// - success: true if no error-level logs
// - totalLogs, errorLogs, warnLogs: counts
// - logs[]: detailed log entries
// - byFunction: grouped stats per function
```

| Option | Default | Description |
|--------|---------|-------------|
| serverlessServiceSid | required | Service to check |
| environment | 'production' | Environment name |
| lookbackSeconds | 300 | How far back to search |
| functionSid | - | Filter to specific function |
| level | all | Filter: 'error', 'warn', 'info' |
| searchText | - | Filter by message content |

### Recordings (validateRecording)

Validate call/conference recording completion:

```typescript
const result = await validator.validateRecording('RE123', {
  waitForCompleted: true,   // Poll until done
  timeout: 60000,           // 1 minute max
  pollInterval: 2000,       // Check every 2s
});

// Result:
// - success: true if status is 'completed'
// - recordingSid, callSid, conferenceSid
// - status: 'in-progress', 'completed', 'failed', etc.
// - duration: recording length in seconds
// - mediaUrl: download URL (.mp3)
// - errorCode: if failed
```

**Short Recording Warning**: Very short recordings (under ~10 seconds) may fail transcription with status "error" even if the recording itself completed successfully. The Voice Intelligence API requires sufficient audio content for reliable transcription. If your test calls are short, expect transcript failures - this is a known limitation, not a bug.

| Option | Default | Description |
|--------|---------|-------------|
| waitForCompleted | true | Poll until terminal status |
| timeout | 60000 | Max wait time (ms) |
| pollInterval | 2000 | Poll interval (ms) |

### Transcripts (validateTranscript)

Validate Conversational Intelligence transcript:

```typescript
const result = await validator.validateTranscript('GT123', {
  waitForCompleted: true,   // Poll until done
  timeout: 120000,          // 2 minutes for transcription
  checkSentences: true,     // Verify sentences exist
});

// Result:
// - success: true if status is 'completed' with sentences
// - transcriptSid, serviceSid
// - status: 'queued', 'in-progress', 'completed', 'failed'
// - languageCode, duration, sentenceCount
// - redactionEnabled: whether PII was redacted
```

| Option | Default | Description |
|--------|---------|-------------|
| waitForCompleted | true | Poll until terminal status |
| timeout | 120000 | Max wait time (ms) |
| pollInterval | 5000 | Poll interval (ms) |
| checkSentences | true | Verify transcript has content |

### Language Operators (validateLanguageOperator)

Validate Language Operator results (summarization, classification, extraction):

```typescript
const result = await validator.validateLanguageOperator('GT123', {
  operatorType: 'text-generation',  // Filter by type
  operatorName: 'Call Summary',     // Filter by name
  requireResults: true,             // Fail if no results
});

// Result:
// - success: true if operators ran successfully
// - transcriptSid
// - operatorResults[]: array of operator outputs
//   - operatorSid, operatorType, name
//   - textGenerationResults (for summarization)
//   - predictedLabel, predictedProbability (for classification)
//   - extractMatch, extractResults (for extraction)
```

| Option | Default | Description |
|--------|---------|-------------|
| operatorType | - | Filter: 'text-generation', 'classification', 'extraction' |
| operatorName | - | Filter by operator name |
| requireResults | true | Fail if no results found |

### ConversationRelay (validateConversationRelay)

Validate a ConversationRelay WebSocket endpoint:

```typescript
const result = await validator.validateConversationRelay({
  url: 'wss://your-server.com/relay',
  timeout: 10000,              // Connection timeout
  validateGreeting: true,       // Expect greeting on connect
  testMessage: 'Hello',         // Optional: send test prompt
  validateLLMResponse: true,    // Expect response to test message
}, WebSocketImplementation);    // Optional: provide WebSocket class

// Result:
// - success: true if validation passed
// - connectionEstablished, setupReceived, greetingReceived
// - greetingText: the greeting received
// - responseReceived, responseText (if testMessage sent)
// - protocolErrors[]: invalid JSON or protocol issues
```

| Option | Default | Description |
|--------|---------|-------------|
| url | required | WebSocket URL (wss://...) |
| timeout | 10000 | Connection timeout (ms) |
| validateGreeting | true | Expect greeting on connect |
| testMessage | - | Send test prompt after greeting |
| validateLLMResponse | false | Expect LLM response |

**Note**: Uses correct `last` field (not `isFinal`) per ConversationRelay protocol.

### Two-Way Conversation (validateTwoWay)

Validate a two-way conversation between two calls (AI agent + customer):

```typescript
const result = await validator.validateTwoWay({
  callSidA: 'CA123',              // AI agent leg
  callSidB: 'CA456',              // Customer leg
  intelligenceServiceSid: 'GA789', // Intelligence Service
  expectedTurns: 4,                // Minimum conversation turns
  topicKeywords: ['appointment', 'confirm'],
  successPhrases: ['thank you', 'confirmed'],
  waitForTranscripts: true,        // Wait for completion
  timeout: 120000,                 // 2 minutes
});

// Result:
// - success: true if conversation is valid
// - callA: { callSid, transcriptSid, transcriptStatus, sentenceCount, speakerTurns }
// - callB: { callSid, transcriptSid, transcriptStatus, sentenceCount, speakerTurns }
// - conversation: { totalTurns, topicKeywordsFound, topicKeywordsMissing, successPhrasesFound, hasNaturalFlow }
// - errors[], warnings[]
```

| Option | Default | Description |
|--------|---------|-------------|
| callSidA | required | First call leg SID |
| callSidB | required | Second call leg SID |
| intelligenceServiceSid | required | Intelligence Service for transcripts |
| expectedTurns | 2 | Minimum speaker turns expected |
| topicKeywords | [] | Keywords that should appear |
| successPhrases | [] | Phrases indicating success |
| waitForTranscripts | true | Wait for transcripts to complete |
| timeout | 120000 | Max wait time (ms) |

### Prerequisites (validatePrerequisites)

Check that required services exist before operations:

```typescript
const result = await validator.validatePrerequisites({
  checks: [
    DeepValidator.prerequisiteChecks.intelligenceService(client, serviceSid),
    DeepValidator.prerequisiteChecks.phoneNumber(client, phoneNumber),
    DeepValidator.prerequisiteChecks.envVar('API_KEY', process.env.API_KEY),
  ],
  stopOnFirstFailure: false,
});

// Result:
// - success: true if all required checks passed
// - results[]: { name, ok, message, required }
// - errors[]: failed required checks
```

Available factory methods:
- `intelligenceService(client, serviceSid)` - Conversational Intelligence
- `syncService(client, serviceSid)` - Twilio Sync
- `verifyService(client, serviceSid)` - Twilio Verify
- `phoneNumber(client, phoneNumber)` - Phone number ownership
- `serverlessService(client, serviceSid)` - Serverless Functions
- `taskRouterWorkspace(client, workspaceSid)` - TaskRouter
- `messagingService(client, serviceSid)` - Messaging Service
- `envVar(name, value, required)` - Environment variable

## ValidationResult Structure

```typescript
interface ValidationResult {
  success: boolean;          // Overall pass/fail
  resourceSid: string;       // SID being validated
  resourceType: string;      // 'message' | 'call' | 'verification' | 'task' | 'conference'
  primaryStatus: string;     // Current status from API
  checks: {
    resourceStatus: CheckResult;
    debuggerAlerts: CheckResult;
    callNotifications?: CheckResult;             // Calls only
    callEvents?: CheckResult;                    // Calls only
    callContent?: CheckResult;                   // Calls only, if validateContent enabled
    voiceInsights?: CheckResult;                 // Calls only
    conferenceInsights?: CheckResult;            // Conferences only
    conferenceParticipantInsights?: CheckResult; // Conferences only
    syncCallbacks?: CheckResult;                 // If Sync configured
    functionLogs?: CheckResult;                  // If Serverless configured
    studioLogs?: CheckResult;                    // If Studio configured
  };
  errors: string[];          // Hard failures
  warnings: string[];        // Soft issues
  duration: number;          // Validation time in ms
}
```

## ValidationOptions

```typescript
interface ValidationOptions {
  waitForTerminal?: boolean;      // Wait for final status (delivered, completed)
  timeout?: number;               // Max wait time (default: 30000ms)
  pollInterval?: number;          // Status check interval (default: 2000ms)
  alertLookbackSeconds?: number;  // How far back to check debugger (default: 120s)
  syncServiceSid?: string;        // For callback data validation
  serverlessServiceSid?: string;  // For Function log checking
  studioFlowSid?: string;         // For Studio execution checking
  // Content validation options (calls only)
  validateContent?: boolean;      // Enable content validation (default: false)
  minDuration?: number;           // Minimum call duration in seconds (default: 15)
  forbiddenPatterns?: string[];   // Patterns that should NOT appear in transcripts
  intelligenceServiceSid?: string; // Voice Intelligence Service for transcript analysis
  requireRecording?: boolean;     // Require recording to exist (default: false)
}
```

## Integration with Callback Functions

The deep validator works with the callback Functions in `functions/callbacks/`:

1. **Functions write to Sync**: When Twilio sends status callbacks, the Functions log them to Sync Documents
2. **Validator reads from Sync**: The `checkSyncCallbacks` method fetches the callback data
3. **Data format**: Sync Documents are named `callbacks-{type}-{sid}` with 24hr TTL

This allows validation to check not just the API status but the actual callbacks Twilio sent.

## Event Emission for Autonomous Workflows

DeepValidator extends EventEmitter to enable autonomous work discovery. Validation failures are emitted as events that can trigger automated fix workflows.

### Events

| Event | Payload | When Emitted |
|-------|---------|--------------|
| `validation-failure` | `ValidationFailureEvent` | On any validation failure |
| `validation-success` | `{ type, result, timestamp }` | On successful validation |

### Usage

```typescript
import { DeepValidator } from './validation';
import { WorkPoller } from '../../feature-factory/src/discovery';

const validator = new DeepValidator(twilioClient);
const workPoller = new WorkPoller();

// Register validator for work discovery
workPoller.registerValidator(validator);

// Listen for discovered work
workPoller.on('work-discovered', (work) => {
  console.log('New work item:', work.summary);
  console.log('Priority:', work.priority);
  console.log('Tier:', work.tier); // 1-2 can be auto-handled
});

// Validation failures now trigger work discovery
const result = await validator.validateMessage('SMxxx', { waitForTerminal: true });
```

### ValidationFailureEvent Structure

```typescript
interface ValidationFailureEvent {
  type: ValidationEventType; // 'message' | 'call' | etc.
  result: ValidationResult;  // The validation result
  diagnosis?: Diagnosis;     // From DiagnosticBridge (if available)
  timestamp: Date;
}
```

## Test Helper

For Jest integration tests, use the test helper:

```typescript
import {
  getTestValidator,
  validateMessageInTest,
  TestValidationError
} from '../__tests__/helpers/deep-validation';

const validator = getTestValidator({
  accountSid: process.env.TWILIO_ACCOUNT_SID!,
  authToken: process.env.TWILIO_AUTH_TOKEN!,
  syncServiceSid: process.env.TWILIO_SYNC_SERVICE_SID,
});

// This throws TestValidationError on failure with detailed error info
const result = await validateMessageInTest(validator, messageSid, {
  timeout: 15000,
});
```

## Design Decision

See [DESIGN_DECISIONS.md D13](/DESIGN_DECISIONS.md#decision-13-deep-validation-pattern-for-api-responses) for the architectural rationale.
