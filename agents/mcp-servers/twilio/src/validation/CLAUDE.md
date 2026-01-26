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
| `index.ts` | Exports public API |

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
| callEvents | `insights.v1.calls(sid).events.list()` | No HTTP errors in webhook requests |
| voiceInsights | `insights.v1.calls(sid).summary().fetch()` | No error tags in call summary |
| syncCallbacks | Sync Document | Callback data received (if Sync configured) |

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

**⚠️ Conference Insights Timing:**
- Summaries are NOT available immediately after conference end
- Partial data: ~2 minutes after conference end (no SLA)
- Final data: Locked and immutable 30 minutes after end
- The validator gracefully handles 404 responses when data isn't ready yet
- Check `processingState` field in response for data completeness

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
    callEvents?: CheckResult;                    // Calls only
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
}
```

## Integration with Callback Functions

The deep validator works with the callback Functions in `functions/callbacks/`:

1. **Functions write to Sync**: When Twilio sends status callbacks, the Functions log them to Sync Documents
2. **Validator reads from Sync**: The `checkSyncCallbacks` method fetches the callback data
3. **Data format**: Sync Documents are named `callbacks-{type}-{sid}` with 24hr TTL

This allows validation to check not just the API status but the actual callbacks Twilio sent.

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
