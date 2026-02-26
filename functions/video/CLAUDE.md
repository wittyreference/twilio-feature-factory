# Video Functions Context

This directory contains Twilio Video API functions for video rooms, token generation, and status callbacks.

## Functions

| Function | Access | Purpose |
|----------|--------|---------|
| `token.js` | Public | Generate Video SDK access tokens |
| `callbacks/room-status.protected.js` | Protected | Room and participant status callbacks |
| `callbacks/recording-status.protected.js` | Protected | Track recording callbacks |
| `callbacks/composition-status.protected.js` | Protected | Composition callbacks |

## Room Types

**ALWAYS use `group` rooms.** Other types lack features and HIPAA eligibility.

| Room Type | Recommendation | Why |
|-----------|----------------|-----|
| `group` | ✅ ALWAYS | HIPAA-eligible, full features, scalable |
| `group-small` | ❌ AVOID | Legacy alias, use `group` instead |
| `peer-to-peer` | ❌ NEVER | Not HIPAA-eligible, limited features |
| `go` | ❌ NEVER | Not HIPAA-eligible, legacy WebRTC |

## Token Generation

The `token.js` endpoint generates JWT access tokens for the Video SDK.

**Parameters:**
- `identity` (optional): Participant identity, defaults to `video-user-{timestamp}`
- `room` (optional): Room name to restrict access to specific room

**Required environment variables:**
- `TWILIO_ACCOUNT_SID`
- `TWILIO_API_KEY`
- `TWILIO_API_SECRET`

**Example request:**
```bash
curl "https://your-domain.twil.io/video/token?identity=alice&room=my-room"
```

**Example response:**
```json
{
  "token": "eyJ...",
  "identity": "alice",
  "room": "my-room"
}
```

## Status Callbacks

### Room Status Callback

Configure on room creation:
```javascript
const room = await client.video.v1.rooms.create({
  uniqueName: 'my-room',
  type: 'group',
  statusCallback: 'https://your-domain.twil.io/video/callbacks/room-status',
  statusCallbackMethod: 'POST'
});
```

**Events received:**
- `room-created` - Room was created
- `room-ended` - Room ended
- `participant-connected` - Participant joined
- `participant-disconnected` - Participant left
- `recording-started` - Recording began
- `recording-completed` - Recording finished
- `track-added` - Track published
- `track-removed` - Track unpublished

### Recording Status Callback

Configure on room creation:
```javascript
const room = await client.video.v1.rooms.create({
  uniqueName: 'my-room',
  type: 'group',
  recordParticipantsOnConnect: true,
  recordingStatusCallback: 'https://your-domain.twil.io/video/callbacks/recording-status',
  recordingStatusCallbackMethod: 'POST'
});
```

### Composition Status Callback

Configure on composition creation or via hooks:
```javascript
// Manual composition
const composition = await client.video.v1.compositions.create({
  roomSid: 'RM...',
  audioSources: ['*'],
  videoLayout: { grid: { video_sources: ['*'] } },
  statusCallback: 'https://your-domain.twil.io/video/callbacks/composition-status'
});

// Auto-composition via hook
await client.video.v1.compositionHooks.create({
  friendlyName: 'auto-compose',
  enabled: true,
  audioSources: ['*'],
  videoLayout: { grid: { video_sources: ['*'] } },
  statusCallback: 'https://your-domain.twil.io/video/callbacks/composition-status'
});
```

**Events received:**
- `composition-enqueued` - Queued for processing
- `composition-started` - Processing started
- `composition-progress` - Progress update (includes `PercentageDone`)
- `composition-available` - Completed successfully
- `composition-failed` - Failed (includes `ErrorCode`, `ErrorMessage`)

## Deep Validation

Callbacks log to Sync for deep validation:
- `callbacks-video-room-{RoomSid}` - Room/participant events
- `callbacks-video-recording-{RecordingSid}` - Recording events
- `callbacks-video-composition-{CompositionSid}` - Composition events

Use MCP tool `validate_video_room` after room creation to verify:
- Room status and type
- Participant connections
- Published tracks
- Recording/composition status

## Gotchas

### Composition Timing

**CRITICAL:** Compositions can only be created AFTER the room ends.

```javascript
// WRONG - fails if room is in-progress
await client.video.v1.compositions.create({ roomSid: 'RM...' });

// RIGHT - wait for room to end first
const room = await client.video.v1.rooms(roomSid).fetch();
if (room.status === 'completed') {
  await client.video.v1.compositions.create({ roomSid });
}
```

### Recording vs Composition

| Feature | Track Recordings | Compositions |
|---------|-----------------|--------------|
| Format | Raw per-track files | Single combined file |
| Timing | Created during room | Created after room ends |
| Use case | ML training, proctoring | Sharing, playback |

### Storage Retention

Without external S3 storage, recordings are deleted after 24 hours. Configure S3 in Console → Video → Recording Settings for production.

## Logging Rules

Use `console.log()` for ALL logging, including errors. Never use `console.error()` or `console.warn()` - they generate debugger alerts (82005/82004).

## Response Bodies

Always use `JSON.stringify()` for response bodies:

```javascript
// WRONG - causes Buffer TypeError
response.setBody({ success: true });

// RIGHT
response.appendHeader('Content-Type', 'application/json');
response.setBody(JSON.stringify({ success: true }));
```

## E2E Testing

A complete E2E test suite exists at `__tests__/e2e/video-sdk/`:

```bash
# Run video SDK tests
npm run test:video-sdk

# Run with visible browser
npm run test:video-sdk:headed
```

Tests verify:
- Token generation and room connection
- Two-party video calls
- Video stream rendering (dimensions > 0)
- Audio stream detection (Web Audio API)
- Room API state (type, participants)
- Disconnect handling

See `.claude/skills/video.md` for detailed testing patterns.
