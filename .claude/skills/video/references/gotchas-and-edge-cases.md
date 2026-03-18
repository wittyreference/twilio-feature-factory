# Gotchas & Edge Cases

## Room Status Lifecycle

Rooms transition: `in-progress` -> `completed` -> (never back)

**Gotcha:** Cannot reactivate a completed room. Must create new room.

## Composition Timing

**CRITICAL:** Compositions can only be created AFTER the room ends.

**Gotcha:** Starting a composition while room is `in-progress` will fail.

**Gotcha:** The composition service is batch-based. While most compositions complete in 3-5 minutes, the service can take up to 10 minutes or occasionally longer during periods of high load.

### Best Practice: Use Status Callbacks (Recommended)

Configure `statusCallback` URLs when creating rooms and compositions. Twilio will POST status updates to your endpoints, eliminating the need for polling.

```javascript
// 1. Create room with status callbacks
const room = await twilioClient.video.v1.rooms.create({
  uniqueName: roomName,
  type: 'group',
  recordParticipantsOnConnect: true,
  statusCallback: 'https://your-domain.com/video/callbacks/room-status',
  recordingStatusCallback: 'https://your-domain.com/video/callbacks/recording-status',
});

// 2. Room status callback receives 'room-ended' event
// Your callback handler triggers composition creation

// 3. Create composition with status callback
const composition = await twilioClient.video.v1.compositions.create({
  roomSid,
  audioSources: ['*'],
  videoLayout: { grid: { video_sources: ['*'] } },
  statusCallback: 'https://your-domain.com/video/callbacks/composition-status',
});

// 4. Composition status callback receives 'composition-available' event
// Your callback handler processes the completed composition
```

**Callback events:**
- Room: `room-created`, `participant-connected`, `participant-disconnected`, `room-ended`
- Recording: `recording-started`, `recording-completed`
- Composition: `composition-enqueued`, `composition-started`, `composition-available`, `composition-failed`

### Fallback: Polling (For Tests)

Polling is acceptable for E2E tests where callback infrastructure may not be available:

```javascript
// Poll with generous timeout - service is batch-based
const completed = await pollUntil(
  () => twilioClient.video.v1.compositions(composition.sid).fetch(),
  (c) => c.status === 'completed' || c.status === 'failed',
  600000, // 10 minutes
  10000   // check every 10 seconds
);
```

**Why callbacks are better:**
- No wasted API calls
- Immediate notification when status changes
- Handles variable processing times gracefully
- More scalable for production workloads

## Transcription Partial vs Final

**Gotcha:** Partial results are interim and WILL change. Don't persist them.

Pattern:
- Display `partial` for real-time UX
- Only persist `final` results
- Final results include speaker attribution

## PSTN Participants

**Gotcha:** PSTN participants show as connected but have NO video track.

Pattern:
- Check `participant.videoTracks.size === 0` for audio-only
- Don't assume all participants have video
- Handle gracefully in UI (show avatar or audio indicator)

## Empty Room Timeout

**Gotcha:** Rooms auto-close after `emptyRoomTimeout` (default: 5 min).

If room closes before participants join, you'll see:
- Room status = `completed`
- Duration = 0
- No participants

Solution: Set appropriate timeout or handle reconnection.

```javascript
const room = await client.video.v1.rooms.create({
  uniqueName: 'my-room',
  type: 'group',
  emptyRoomTimeout: 10  // 10 minutes
});
```

## Max Participant Duration

**Gotcha:** `maxParticipantDuration` kicks participants after N seconds.

Useful for: billing, preventing abandoned sessions
Risk: Unexpected disconnection if set too short

**Critical:** Minimum value is 600 seconds (10 minutes), despite docs saying 0-86400. Values below 600 fail with error 53123.

```javascript
const room = await client.video.v1.rooms.create({
  uniqueName: 'timed-session',
  type: 'group',
  maxParticipantDuration: 600  // Minimum: 600 seconds (10 minutes)
});
```

**Disconnect Error:**
- Code: `53216`
- Message: "Participant session length exceeded."
- Recordings auto-complete when participant is disconnected

## Recording Storage Retention

**Gotcha:** Without external storage, recordings deleted after 24 hours.

**Always configure S3** for production if recordings matter.

## Codec Compatibility

**Gotcha:** H.264 requires hardware support; VP8 is software-decoded.

Recommendation:
- Default to VP8 for broad compatibility
- Use H.264 only if native app has hardware encoder
- Safari prefers H.264

## Media Region Selection

**Gotcha:** Wrong media region = high latency.

Pattern:
- Auto-select based on first participant (default)
- Or explicitly set for known geography

Available regions: `us1`, `us2`, `ie1`, `de1`, `au1`, `br1`, `jp1`, `sg1`, `in1`

## Track Limits

**Gotcha:** Group rooms have track subscription limits.

- 16 video tracks max visible simultaneously
- Additional participants can publish, but not all visible
- Use Bandwidth Profile with `clientTrackSwitchOffControl: 'auto'` and `contentPreferencesMode: 'auto'` to automatically manage which tracks receive bandwidth based on render dimensions

## Reconnection Handling

The SDK automatically attempts to reconnect when network disruptions occur. Monitor state transitions to provide appropriate UX.

**Room State Transitions:**
```
connected -> reconnecting -> connected (success)
connected -> reconnecting -> disconnected (timeout after ~30 seconds)
```

**Local Participant Pattern:**
```javascript
const room = await connect(token, { name: roomName, tracks: localTracks });

room.on('reconnecting', (error) => {
  console.log(`Reconnecting... (${error?.code}: ${error?.message})`);
  // Show "reconnecting" UI indicator
  // Error code 53001 = signaling connection disconnected
});

room.on('reconnected', () => {
  console.log('Reconnected successfully');
  // Restore normal UI
});

room.on('disconnected', (room, error) => {
  if (error?.code === 53001) {
    console.log('Disconnected due to network timeout');
    // Offer manual reconnect option
  }
});
```

**Remote Participant Pattern:**
Remote participants also emit reconnecting/reconnected events:
```javascript
room.on('participantConnected', participant => {
  participant.on('reconnecting', () => {
    console.log(`${participant.identity} is reconnecting...`);
    // Show indicator on their video tile
  });

  participant.on('reconnected', () => {
    console.log(`${participant.identity} reconnected`);
    // Restore normal display
  });
});
```

**Key Behaviors:**
- SDK auto-reconnects for ~30 seconds before giving up
- Error code 53001 indicates signaling connection lost
- Tracks are preserved across reconnection (no need to republish)
- Remote participants see `participant-reconnecting` / `participant-reconnected` events
- Room state is accessible via `room.state` (`connected`, `reconnecting`, `disconnected`)

**Testing with CDP:**
Use Chrome DevTools Protocol to simulate network disruption in tests:
```javascript
const cdpSession = await context.newCDPSession(page);

// Simulate offline
await cdpSession.send('Network.emulateNetworkConditions', {
  offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0
});

// Restore network
await cdpSession.send('Network.emulateNetworkConditions', {
  offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1
});
```

## Disconnect Error Codes

When a room emits `disconnected`, the error parameter indicates why the disconnect occurred. Use this for appropriate UX messaging.

**Error Code Reference:**

| Code | Meaning | UX Recommendation |
|------|---------|-------------------|
| `null` | Normal disconnect (voluntary leave) | "You left the room" |
| `null` | Participant removed via API | Same as normal - cannot distinguish! |
| 53001 | Signaling connection lost (network) | "Connection lost - try rejoining" |
| 53118 | Room completed by host/API | "The host ended the meeting" |
| 53216 | Max participant duration reached | "Session time limit reached" |
| 20104 | Access token expired | "Session expired - please rejoin" |
| 20101 | Invalid access token | "Authentication error" |

**Handling Disconnects:**
```javascript
room.on('disconnected', (room, error) => {
  if (!error) {
    // Normal disconnect - user left voluntarily OR was kicked via API
    // Cannot distinguish these two cases from the disconnect event!
    showMessage('You have left the room');
    return;
  }

  switch (error.code) {
    case 53001:
      showMessage('Connection lost. Please check your network and try again.');
      offerRejoinOption();
      break;
    case 53118:
      showMessage('The meeting has ended.');
      break;
    case 53216:
      showMessage('Your session time has expired.');
      break;
    case 20104:
      showMessage('Your session has expired. Please sign in again.');
      redirectToLogin();
      break;
    default:
      showMessage(`Disconnected: ${error.message}`);
      console.error('Disconnect error:', error.code, error.message);
  }
});
```

**Important Limitation:**
Participant removal via API (`participants(sid).update({ status: 'disconnected' })`) produces NO error code. The disconnected participant cannot distinguish between:
- Being kicked by an admin
- Voluntarily leaving

If kick detection is required, implement custom signaling (e.g., DataTrack message before removal).
