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

## Security

All functions use `.protected.js` suffix, requiring valid Twilio request signatures. This prevents:

- Spoofed callback data
- External access to callback endpoints
- Invalid test data pollution
