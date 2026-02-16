# Callbacks Functions

This directory contains Twilio Functions that handle status callbacks from various Twilio services. All callbacks are logged to Twilio Sync for deep validation during testing.

## Purpose

These functions enable **deep validation** of Twilio API operations. Instead of just checking for a 200 OK from the API, we can verify:

1. The actual status callbacks Twilio sends
2. Whether errors occurred during processing
3. The progression of status changes over time

## Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `message-status.protected.js` | Message StatusCallback | Logs SMS/MMS delivery status |
| `call-status.protected.js` | Call StatusCallback | Logs voice call status changes |
| `task-status.protected.js` | TaskRouter EventCallback | Logs task and worker events |
| `verification-status.protected.js` | Verify webhook | Logs verification status |
| `fallback.protected.js` | Any FallbackUrl | Catches primary webhook failures |

## Sync Schema

All callbacks are logged to Sync Documents with the naming convention:

```
callbacks-{resourceType}-{resourceSid}
```

Example: `callbacks-message-SMxxxxxxxxxxxxxx`

Document structure:

```json
{
  "resourceSid": "SMxxxxxxxxxxxxxx",
  "resourceType": "message",
  "callbacks": [
    {
      "timestamp": "2026-01-22T10:30:00.000Z",
      "status": "queued",
      "errorCode": null,
      "errorMessage": null,
      "rawPayload": { ... }
    },
    {
      "timestamp": "2026-01-22T10:30:01.000Z",
      "status": "sent",
      "errorCode": null,
      "errorMessage": null,
      "rawPayload": { ... }
    },
    {
      "timestamp": "2026-01-22T10:30:05.000Z",
      "status": "delivered",
      "errorCode": null,
      "errorMessage": null,
      "rawPayload": { ... }
    }
  ],
  "latestStatus": "delivered",
  "latestTimestamp": "2026-01-22T10:30:05.000Z",
  "errorCount": 0,
  "callbackCount": 3
}
```

## Configuration

These functions require the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_SYNC_SERVICE_SID` | Yes | Sync Service for storing callback data |

## Deployment

These functions are auto-deployed during setup via:

```bash
npx twilio-agent-factory setup
```

Or manually:

```bash
twilio serverless:deploy --functions-folder functions/callbacks
```

## Deep Validation Usage

The deep validator fetches callback data from Sync to verify:

```typescript
// In deep-validator.ts
async function checkSyncCallbacks(resourceSid: string): Promise<CheckResult> {
  const doc = await getCallbackData(context, 'message', resourceSid);

  if (!doc) {
    return { passed: false, message: 'No callback data received' };
  }

  if (doc.errorCount > 0) {
    return { passed: false, message: `${doc.errorCount} errors in callbacks` };
  }

  return { passed: true, message: `Received ${doc.callbackCount} callbacks` };
}
```

## Fallback Handler

The fallback handler is special:

1. It catches failures from ANY primary webhook
2. Returns safe TwiML for voice calls (prevents hang-ups)
3. Logs prominently so failures are visible
4. Any fallback invocation is a test failure (primary should work)

## TTL

All Sync documents have a 24-hour TTL. Callback data is ephemeral and only needed during test validation. Old data automatically expires.

## Logging Rules (Twilio Functions Alert Behavior)

Twilio Functions generate debugger alerts based on log level:

| Log Level | Alert Code | Effect |
|-----------|------------|--------|
| `console.log` | None | Silent — use for all operational logging |
| `console.warn` | 82004 | Generates warning alert — avoid in callbacks |
| `console.error` | 82005 | Generates error alert — reserve for catch blocks only |

**Pattern**: Use `console.log` for all status reporting, including error conditions in callback data (e.g., message delivery failures with ErrorCode). Only use `console.error` in catch blocks for actual function failures. Never use `console.warn`.

**Response bodies**: Always pass a string to `Twilio.Response.setBody()`, not a plain object. Use `JSON.stringify()` and set `Content-Type: application/json`. Passing an object causes `Buffer.from(object)` TypeError in the runtime.

```javascript
// WRONG — triggers Buffer TypeError
response.setBody({ success: true });

// RIGHT — explicit JSON serialization
response.appendHeader('Content-Type', 'application/json');
response.setBody(JSON.stringify({ success: true }));
```

## Debugging Callbacks

**Two-bug masking**: Multiple independent root causes can produce the same debugger alert code. When an error persists after a fix, check whether a second cause is generating the same code. For example, 82005 alerts can come from both a `setBody(object)` crash AND `console.error()` logging — fixing one doesn't silence the other.

**Interpreting `responseBody` in debugger alerts**:
- `responseBody: null` → the function crashed before writing a response. Look for runtime errors (TypeError, missing modules, unhandled rejections).
- `responseBody` with valid data → the function completed successfully, but something else triggered the alert (e.g., `console.error` or `console.warn` calls). Look at log statements, not execution flow.

This distinction narrows root cause investigation significantly.

## Security

All functions use `.protected.js` suffix, requiring valid Twilio request signatures. This prevents:

- Spoofed callback data
- External access to callback endpoints
- Invalid test data pollution
