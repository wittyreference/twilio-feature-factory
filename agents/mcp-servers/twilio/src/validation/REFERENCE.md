// ABOUTME: Complete API documentation and integration patterns for the validation system.
// ABOUTME: Method signatures, TypeScript interfaces, options, test helpers, and advanced patterns.

# Deep Validation — Complete Reference

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

### Sync Document (validateSyncDocument)

Validate a Sync Document's data structure:

```typescript
const result = await validator.validateSyncDocument('IS123', 'my-doc', {
  expectedKeys: ['status', 'count'],   // Keys that must exist
  strictKeys: true,                     // Fail on unexpected keys
  expectedTypes: { status: 'string', count: 'number' },
  checkDebugger: false,
});

// Result:
// - success: true if all checks passed
// - documentSid, uniqueName, serviceSid, revision
// - data: the document data object
// - dataKeys: array of keys in data
// - dateExpires: ISO string if TTL set
// - debuggerCheck: optional CheckResult
```

| Option | Default | Description |
|--------|---------|-------------|
| expectedKeys | - | Keys expected in document data |
| strictKeys | false | Fail if unexpected keys exist |
| expectedTypes | - | Expected type per key (string/number/boolean/object/array) |
| checkDebugger | false | Check debugger for related alerts |
| alertLookbackSeconds | 120 | Debugger lookback window |

### Sync List (validateSyncList)

Validate a Sync List's items:

```typescript
const result = await validator.validateSyncList('IS123', 'my-list', {
  minItems: 1,                          // At least 1 item
  maxItems: 100,                        // At most 100 items
  exactItems: 5,                        // Exactly 5 (overrides min/max)
  expectedItemKeys: ['name', 'email'],  // Keys in each item's data
  checkDebugger: false,
});

// Result:
// - success: true if count constraints met
// - listSid, uniqueName, serviceSid, revision
// - itemCount, items[]: { index, data }
// - itemsWithMissingKeys[]: { index, missingKeys[] } (warnings)
```

| Option | Default | Description |
|--------|---------|-------------|
| minItems | - | Minimum item count |
| maxItems | - | Maximum item count |
| exactItems | - | Exact count (overrides min/max) |
| itemLimit | 100 | Max items to fetch |
| expectedItemKeys | - | Keys expected in each item's data |
| checkDebugger | false | Check debugger for related alerts |

### Sync Map (validateSyncMap)

Validate a Sync Map's keys and values:

```typescript
const result = await validator.validateSyncMap('IS123', 'my-map', {
  expectedKeys: ['config', 'settings'], // Map keys that must exist
  expectedValueKeys: ['name', 'value'], // Keys in each item's data
  checkDebugger: false,
});

// Result:
// - success: true if expected keys found
// - mapSid, uniqueName, serviceSid, revision
// - itemCount, keys[], items[]: { key, data }
// - expectedKeysFound[], expectedKeysMissing[]
// - itemsWithMissingValueKeys[]: { key, missingKeys[] } (warnings)
```

| Option | Default | Description |
|--------|---------|-------------|
| expectedKeys | - | Map item keys that must exist |
| itemLimit | 100 | Max items to fetch |
| expectedValueKeys | - | Keys expected in each item's value data |
| checkDebugger | false | Check debugger for related alerts |

**Note**: Missing value keys are warnings (not errors) because Sync Maps can intentionally have heterogeneous item schemas.

### TaskRouter (validateTaskRouter)

Rich validation for TaskRouter tasks:

```typescript
const result = await validator.validateTaskRouter('WS123', 'WT456', {
  expectedStatus: 'completed',
  expectedAttributeKeys: ['language', 'skill'],
  includeReservations: true,
  includeEvents: true,
  eventLimit: 50,
  checkDebugger: true,
});

// Result:
// - success: true if all checks passed
// - taskSid, workspaceSid, assignmentStatus, age, priority
// - reason, taskQueueSid, workflowSid
// - attributes: parsed JSON object
// - reservations[]: { sid, workerSid, workerName, reservationStatus }
// - events[]: { sid, eventType, description, eventDate }
// - debuggerCheck: optional CheckResult
```

| Option | Default | Description |
|--------|---------|-------------|
| expectedStatus | - | Expected assignment status |
| checkAttributes | true | Parse attributes JSON |
| expectedAttributeKeys | - | Keys expected in attributes |
| includeReservations | false | Fetch reservation history |
| includeEvents | false | Fetch event history |
| eventLimit | 50 | Max events to fetch |
| checkDebugger | false | Check debugger for related alerts |

**Note**: This method returns `TaskRouterValidationResult` (richer than the existing `validateTask()` which returns `ValidationResult`). Both coexist — use `validateTaskRouter()` for detailed task inspection.

## TypeScript Interfaces

### ValidationResult

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

### ValidationOptions

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

### CheckResult

```typescript
interface CheckResult {
  passed: boolean;
  message: string;
  details?: unknown;
  duration?: number;
}
```

### ValidationFailureEvent

```typescript
interface ValidationFailureEvent {
  type: ValidationEventType; // 'message' | 'call' | etc.
  result: ValidationResult;  // The validation result
  diagnosis?: Diagnosis;     // From DiagnosticBridge (if available)
  timestamp: Date;
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

### Test Helper Methods

- `getTestValidator(config)` - Create validator instance for tests
- `validateMessageInTest(validator, sid, options)` - Validate message with test-friendly error handling
- `validateCallInTest(validator, sid, options)` - Validate call with test-friendly error handling

### TestValidationError

Thrown when validation fails in tests. Provides:
- `result: ValidationResult` - Full validation result object
- `message: string` - Human-readable error description
- `failures: string[]` - Array of failure messages for each failed check

## Additional Integration Patterns

### Combining Multiple Validators

```typescript
// Run multiple validators in parallel
const [messageResult, callResult] = await Promise.all([
  validator.validateMessage(messageSid),
  validator.validateCall(callSid),
]);

// Check both succeeded
if (!messageResult.success || !callResult.success) {
  throw new Error('One or more validations failed');
}
```

### Custom Validation Logic

```typescript
// Extend validation with domain-specific checks
const result = await validator.validateCall(callSid);

// Add custom checks on top of deep validation
if (result.success) {
  // Perform business logic validation
  const customCheck = await myCustomLogic(result);
  if (!customCheck) {
    result.errors.push('Custom business rule failed');
    result.success = false;
  }
}

return result;
```

### Validation with Retries

```typescript
// Retry validation with exponential backoff
let result;
let retries = 0;
const maxRetries = 3;

while (retries < maxRetries) {
  try {
    result = await validator.validateMessage(messageSid, {
      waitForTerminal: true,
      timeout: 30000,
    });

    if (result.success) break;

    retries++;
    await new Promise(r => setTimeout(r, Math.pow(2, retries) * 1000));
  } catch (error) {
    retries++;
    if (retries >= maxRetries) throw error;
  }
}

return result;
```

## Design Decision

See [DESIGN_DECISIONS.md D13](/DESIGN_DECISIONS.md#decision-13-deep-validation-pattern-for-api-responses) for the architectural rationale.
