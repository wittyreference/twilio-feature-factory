# SDK Integration (Client-Side)

Video is heavily client-side. Each platform has an SDK for room connections.

## JavaScript SDK

**Installation:**
```bash
npm install twilio-video
```

**Connection Pattern:**
```javascript
import { connect, createLocalTracks } from 'twilio-video';

// Get access token from your server
const token = await fetchToken(identity, roomName);

// Create local tracks
const localTracks = await createLocalTracks({
  audio: true,
  video: { width: 1280, height: 720 }
});

// Connect to room
const room = await connect(token, {
  name: roomName,
  tracks: localTracks,
  dominantSpeaker: true,
  networkQuality: { local: 3, remote: 1 }
});

// Handle participants
room.participants.forEach(handleParticipant);
room.on('participantConnected', handleParticipant);
room.on('participantDisconnected', handleDisconnect);
```

**Track Management:**
- `localParticipant.publishTrack(track)` - Share audio/video/screen
- `localParticipant.unpublishTrack(track)` - Stop sharing
- `remoteParticipant.on('trackSubscribed', handleTrack)` - Receive tracks

## Screen Share

Best practice: Cap resolution at 1920x1080 and use low frame rate (5fps) for static content. Higher resolutions cause excessive lag on subscribers with low downstream bandwidth.

```javascript
// Production screen share with recommended constraints
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: {
    width: { max: 1920 },
    height: { max: 1080 },
    frameRate: { max: 5 }  // Use 15-30 for video content only
  }
});

const screenTrack = new Twilio.Video.LocalVideoTrack(stream.getVideoTracks()[0], {
  name: 'screen'  // Name convention for identifying screen share
});

await room.localParticipant.publishTrack(screenTrack);

// Stop screen share
await room.localParticipant.unpublishTrack(screenTrack);
screenTrack.stop();
```

**Screen Share Guidelines:**
- Use `name: 'screen'` to identify screen share tracks on remote side
- 5 fps sufficient for documents, slides, code
- 15-30 fps only for video playback content
- Consider `contentHint: 'detail'` for text, `'motion'` for video
- Handle `ended` event when user stops via browser UI

## DataTrack API

DataTracks enable real-time data exchange between participants without using audio/video bandwidth. Essential for collaborative features.

**Use Cases:**
- In-call chat messages
- Cursor position sharing (whiteboard, annotation)
- Participant status indicators (typing, hand raised)
- Custom signaling (mute notifications, reactions)
- Game state synchronization

**Creating and Publishing:**
```javascript
const { LocalDataTrack } = Twilio.Video;

// Create a named data track
const dataTrack = new LocalDataTrack({ name: 'chat' });

// Publish to room
await room.localParticipant.publishTrack(dataTrack);

// Send string messages
dataTrack.send('Hello from Alice!');

// Send JSON (stringify first)
dataTrack.send(JSON.stringify({ type: 'cursor', x: 100, y: 200 }));

// Send binary data (ArrayBuffer)
const buffer = new ArrayBuffer(8);
dataTrack.send(buffer);
```

**Receiving Messages:**
```javascript
// Handle new participants
room.on('participantConnected', participant => {
  participant.on('trackSubscribed', track => {
    if (track.kind === 'data') {
      track.on('message', (data) => {
        if (typeof data === 'string') {
          console.log('String message:', data);
          // Parse JSON if needed
          const parsed = JSON.parse(data);
        } else {
          console.log('Binary data:', data); // ArrayBuffer
        }
      });
    }
  });
});

// Handle existing participants (already in room when you join)
room.participants.forEach(participant => {
  participant.tracks.forEach(publication => {
    if (publication.track?.kind === 'data') {
      publication.track.on('message', handleMessage);
    }
  });
  participant.on('trackSubscribed', handleTrackSubscribed);
});
```

**Bidirectional Chat Pattern:**
```javascript
// Alice creates chat track
const aliceChat = new LocalDataTrack({ name: 'chat' });
await room.localParticipant.publishTrack(aliceChat);

// Bob creates response track
const bobChat = new LocalDataTrack({ name: 'chat-response' });
await room.localParticipant.publishTrack(bobChat);

// Both listen for each other's messages
// Result: True bidirectional messaging
```

**Key Constraints:**
| Constraint | Limit |
|------------|-------|
| Max message size | 64 KB |
| Delivery | Ordered, reliable (SCTP) |
| Latency | Low (WebRTC data channel) |
| Recording | NOT recorded (data tracks excluded) |

**Gotchas:**
- DataTracks are NOT recorded - only audio/video tracks are captured
- Must handle both existing and new participants when setting up listeners
- Binary data arrives as ArrayBuffer, not typed arrays
- Track name helps identify purpose (e.g., `chat`, `cursor`, `state`)

**Message Order Guarantee:**
DataTracks use SCTP (reliable, ordered delivery). Messages arrive in the order sent:

```javascript
// Sender
for (let i = 0; i < 20; i++) {
  dataTrack.send(`message-${i}`);
}

// Receiver - messages arrive in order: message-0, message-1, ... message-19
```

## iOS SDK

**Key Differences:**
- Swift/Objective-C APIs
- AVFoundation integration for camera/mic
- Background mode handling required
- CallKit integration for incoming calls

**Connection Pattern (Swift):**
```swift
let connectOptions = ConnectOptions(token: token) { builder in
    builder.roomName = roomName
    builder.audioTracks = [localAudioTrack]
    builder.videoTracks = [localVideoTrack]
}

room = TwilioVideoSDK.connect(options: connectOptions, delegate: self)
```

## Android SDK

**Key Differences:**
- Kotlin/Java APIs
- CameraCapturer for video capture
- AudioSwitch for audio routing
- Foreground service for background operation

**Connection Pattern (Kotlin):**
```kotlin
val connectOptions = ConnectOptions.Builder(token)
    .roomName(roomName)
    .audioTracks(listOf(localAudioTrack))
    .videoTracks(listOf(localVideoTrack))
    .build()

room = Video.connect(context, connectOptions, roomListener)
```

## Access Tokens

Server-side token generation required:
```javascript
const AccessToken = require('twilio').jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
  identity: participantIdentity
});

const videoGrant = new VideoGrant({ room: roomName });
token.addGrant(videoGrant);

return token.toJwt();
```

**Token Security:**
- Tokens expire (default 1 hour, max 24 hours)
- Grant specific room or use wildcard
- Never expose API key secret client-side
- Generate fresh token for each connection
