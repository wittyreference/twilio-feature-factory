---
name: video
description: Twilio Video development guide. Use when building video applications, telehealth platforms, remote collaboration tools, or working with rooms, participants, recordings, and compositions.
---

# Video Development Skill

Comprehensive decision-making guide for Twilio Video development. Load this skill when building video applications, telehealth platforms, or remote collaboration tools.

---

## The Use Case Ladder

Video development follows a progression pattern. Customers typically start simple and add capabilities.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Supervised Communication                         │
│  Proctoring, compliance recording, audit trails                     │
├─────────────────────────────────────────────────────────────────────┤
│                    Professional Consultation                        │
│  Recorded sessions, compositions, PSTN integration                  │
├─────────────────────────────────────────────────────────────────────┤
│                    Healthcare Consultation                          │
│  HIPAA-eligible, real-time transcription, accessibility             │
├─────────────────────────────────────────────────────────────────────┤
│                    Basic Video Calling                              │
│  Simple 1:1 video calling - the starting point                      │
└─────────────────────────────────────────────────────────────────────┘
              ↑ Most common starting point

PSTN Integration can be added at any level for phone dial-in/dial-out.
```

**Key insight:** Customers can enter at any point. A customer with basic video might add recording for compliance. A telehealth customer might add PSTN for patients without video capability.

---

## Room Type Decision (CRITICAL)

**ALWAYS use `group` rooms.**

| Room Type | Recommendation | Why |
|-----------|----------------|-----|
| `group` | ✅ ALWAYS | HIPAA-eligible, full features, scalable |
| `group-small` | ❌ AVOID | Legacy alias, use `group` instead |
| `peer-to-peer` | ❌ NEVER | Not HIPAA-eligible, limited features |
| `go` | ❌ NEVER | Not HIPAA-eligible, legacy WebRTC |

**Why this matters:** Peer-to-peer and WebRTC Go rooms are legacy room types that lack HIPAA eligibility, recording, transcription, and other features. Always default to `group` regardless of participant count.

---

## Quick Decision Reference

| Need | Use | Why |
|------|-----|-----|
| Any video session | `group` room | Only HIPAA-eligible type |
| Recording for compliance | `recordParticipantsOnConnect: true` | Automatic, per-track |
| Recording selective participants | Recording Rules | Fine-grained include/exclude |
| Combined video file | Compositions | Post-room MP4/WebM generation |
| Auto-compose every room | Composition Hooks | Automatic composition on room end |
| Real-time captions/notes | Transcriptions | Live speech-to-text with speaker attribution |
| Phone participants | PSTN dial-in/out | Bridges voice to video room |
| Long-term storage | External Storage (S3) | Twilio default is 24-hour retention |

---

## Decision Frameworks

### Recording: ON vs OFF

**Turn Recording ON when:**
- Compliance requirements (legal, financial)
- Training/playback needed later
- Quality assurance review
- Proctoring/monitoring use case

**Keep Recording OFF when:**
- Privacy-sensitive (therapy, legal consultation where recording prohibited)
- No retention requirements


### Composition vs Raw Track Recordings

**Use Compositions when:**
- Need single MP4/WebM file for playback
- Sharing a recording of the Video Room with end users
- Archival/compliance with standard format
- Grid/speaker layout needed

**Use Raw Track Recordings when:**
- Need per-participant audio/video separation
- Post-processing/editing required
- ML training data extraction
- Proctoring (need individual student video)

### Transcription: Real-time vs None

**Use Real-time Transcription when:**
- Accessibility requirements (deaf/hard-of-hearing)
- Note-taking assistance
- AI agent integration (summarization, action items)
- Healthcare documentation

**Skip Transcription when:**
- Privacy concerns with speech-to-text
- Cost optimization needed
- Non-verbal content (screen share only)

### PSTN Integration: Yes vs No

**Add PSTN when:**
- Participants may not have video-capable devices
- Backup access method needed
- Dial-out to experts/consultants

**Skip PSTN when:**
- All participants guaranteed to have app/browser
- Video is required (not optional)
- Simplicity preferred

---

## Use Case Details

### 1. Healthcare Consultation

**Goal:** HIPAA-compliant video visits between patients and providers with accessibility support.

**Configuration:**

| Setting | Value | Why |
|---------|-------|-----|
| Room type | `group` | HIPAA-eligible |
| Max participants | 2-5 | Provider + patient + interpreters/family |
| Recording | OFF (default) | HIPAA - enable only with BAA + consent |
| Transcription | ON | Accessibility, AI-assisted notes |
| PSTN | Optional | Backup for connectivity issues |
| Screen share | Rare | Reviewing test results, images |

**Transcription Pattern:**
1. Create room with transcription enabled
2. Transcription starts automatically when participants join
3. Sentences stream in real-time with speaker attribution
4. Handle both `partial` and `final` sentence types
5. Transcription ends when room ends

**HIPAA Note:** All Twilio Video features HIPAA-eligible except P2P and Go rooms. Requires BAA with Twilio. Link: https://www.twilio.com/docs/security

### 2. Professional Consultation

**Goal:** Recorded business consultations with shareable video output.

**Configuration:**

| Setting | Value | Why |
|---------|-------|-----|
| Room type | `group` | Full features |
| Max participants | 2-10 | Consultant + client team |
| Recording | ON | Compliance, reference |
| Composition | Auto via Hook | Single MP4 for sharing |
| Transcription | OFF | Recording suffices |
| PSTN | Typical | Phone access for executives |
| Screen share | Common | Presentations, documents |

**Composition Pattern:**
1. Create Composition Hook (one-time setup)
2. Rooms auto-compose when they end
3. Poll composition status until `completed`
4. Retrieve media URL for download/sharing
5. Configure external storage (S3) for long-term retention

### 3. Online Exam Proctoring

**Goal:** Monitor exam-takers with individual recordings per student.

**Configuration:**

| Setting | Value | Why |
|---------|-------|-----|
| Room type | `group` | One student per room |
| Max participants | 2 | Student + optional proctor |
| Recording | ON | Audit trail |
| Composition | OFF | Need raw per-student video |
| Transcription | OFF | Not relevant |
| PSTN | OFF | Video required for identity |
| Screen share | Required | Monitor exam application |

**Proctor Participation Modes:**

Proctors can join a student's room in two modes:

| Mode | Audio/Video | Use Case |
|------|-------------|----------|
| **Observer** | None published | Silent monitoring - student unaware of live observation |
| **Active** | Published | Intervention - proctor can speak to student (e.g., warnings, instructions) |

**Observer Pattern:**
- Proctor connects with `audio: false, video: false`
- Subscribes to student's tracks (camera, screen share)
- Student sees participant count but proctor publishes nothing
- Useful for scalable monitoring (one proctor cycling through many rooms)

**Active Intervention Pattern:**
- Proctor connects with audio enabled
- Can unmute to speak to student
- Student sees and hears proctor
- Use for warnings, clarifications, or ending exam early

**Proctoring Pattern:**
1. Create room per student with unique name (exam-{studentId}-{timestamp})
2. Enable recording at room creation
3. Require screen share track publication
4. Monitor for track unpublish events (cheating indicator)
5. Proctor joins as observer or active participant as needed
6. Download raw track recordings after room ends

---

## Supervised Communication

Supervised communication is a category of video applications where an observer or supervisor can join a room **without the other participants being aware**. This goes beyond simply not publishing tracks—the observer is truly invisible to other participants.

**Use Cases:**
- **Exam proctoring** - Proctor monitors student without student knowing when they're being watched
- **Prison/correctional visitation** - Guard monitors inmate-visitor conversation invisibly
- **Call center supervision** - Manager listens to agent-customer video calls
- **Training observation** - Trainer watches trainee sessions without affecting behavior

### Track Subscriptions API

The Track Subscriptions API enables true observer patterns by controlling which tracks each participant subscribes to. By default, rooms use "subscribe-to-all" where every participant receives every published track. This API allows custom communication topologies.

**API Endpoint:**
```
POST /v1/Rooms/{RoomSid}/Participants/{ParticipantSid}/SubscribeRules
```

**Rule Structure:**
```json
{
  "type": "include|exclude",
  "all": true,
  "publisher": "participant_identity",
  "kind": "audio|video|data"
}
```

### True Observer Pattern (Invisible to Others)

To make an observer truly invisible, configure **other participants'** subscribe rules to exclude the observer's tracks:

```javascript
// When observer joins, update each existing participant's subscribe rules
async function makeObserverInvisible(roomSid, observerIdentity, participantSids) {
  for (const participantSid of participantSids) {
    await client.video.v1
      .rooms(roomSid)
      .participants(participantSid)
      .subscribeRules
      .update({
        rules: [
          { type: 'include', all: true },
          { type: 'exclude', publisher: observerIdentity }
        ]
      });
  }
}

// Observer subscribes to all tracks (sees everyone)
async function observerSubscribesToAll(roomSid, observerSid) {
  await client.video.v1
    .rooms(roomSid)
    .participants(observerSid)
    .subscribeRules
    .update({
      rules: [{ type: 'include', all: true }]
    });
}
```

**Result:**
- Observer sees and hears all participants
- Participants do NOT receive observer's tracks (even if observer publishes)
- Participant count still increments (unavoidable)

### Observer Visibility Levels

| Level | Implementation | Participant Sees | Recorded |
|-------|----------------|------------------|----------|
| **Visible** | Default subscribe-to-all | Observer's identity, audio, video | Yes |
| **Silent** | Observer publishes no tracks | Participant count increases, no media | No |
| **Invisible** | Track Subscriptions API exclusion | Participant count increases, no media, no track events | No (if no tracks) |

**Observer Recording Pattern:**
To ensure observers are NOT recorded, connect without publishing tracks:
```javascript
// Client-side: Connect as observer without tracks
const room = await Twilio.Video.connect(token, {
  name: roomName,
  tracks: [] // No tracks = no recordings
});
```

**Key difference between Silent and Invisible:**
- **Silent**: Participants receive `participantConnected` and `trackSubscribed` events for observer (even if no tracks)
- **Invisible**: Participants receive `participantConnected` but observer's tracks are filtered out at the SFU level

### Prison Visitation Example

```javascript
// Room setup: inmate + visitor + guard (invisible)
const room = await client.video.v1.rooms.create({
  uniqueName: `visitation-${inmateId}-${Date.now()}`,
  type: 'group',
  maxParticipants: 3,
  recordParticipantsOnConnect: true  // Compliance recording
});

// When guard joins, make them invisible to inmate and visitor
async function onGuardJoined(roomSid, guardIdentity) {
  const participants = await client.video.v1.rooms(roomSid).participants.list();

  for (const p of participants) {
    if (p.identity !== guardIdentity) {
      await client.video.v1
        .rooms(roomSid)
        .participants(p.sid)
        .subscribeRules
        .update({
          rules: [
            { type: 'include', all: true },
            { type: 'exclude', publisher: guardIdentity }
          ]
        });
    }
  }
}
```

### Gotchas for Supervised Communication

**Participant count is visible:** The Track Subscriptions API hides media tracks, not participant presence. If your UI shows "2 participants" and it suddenly shows "3", users may notice. Options:
- Use server-side participant list filtering in your app
- Accept that count reveals observation (may be acceptable for compliance)

**New participants need rules updated:** When a new participant joins after the observer, you must update their subscribe rules too. Use `participantConnected` webhook to trigger rule updates.

**Observer can still publish (if they want to intervene):** The exclusion rules don't prevent observer from publishing—they just prevent others from receiving. Observer can "decloak" by removing the exclusion rules when intervention is needed.

---

## SDK Integration (Client-Side)

Video is heavily client-side. Each platform has an SDK for room connections.

### JavaScript SDK

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

**Screen Share:**

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

### DataTrack API

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

### iOS SDK

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

### Android SDK

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

### Access Tokens

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

---

## Network Quality & Bandwidth

### Simulcast (Enable First)

**CRITICAL:** Enable VP8 Simulcast for any room with 3+ participants. Simulcast creates multiple encoded versions of each video stream at different resolutions/bitrates, allowing subscribers to receive the version matching their display needs and bandwidth.

```javascript
const room = await connect(token, {
  preferredVideoCodecs: [{ codec: 'VP8', simulcast: true }]
});
```

**When to use Simulcast:**

| Room Type | Simulcast | Why |
|-----------|-----------|-----|
| 1-to-1 | ❌ Disable | Unnecessary overhead |
| 3+ participants | ✅ Enable | Essential for quality at scale |
| 5+ participants | ✅ Required | Quality degrades significantly without it |

**How Simulcast Works:**
- Publisher sends 3 quality layers simultaneously (high, medium, low)
- SFU (Selective Forwarding Unit) selects appropriate layer per subscriber
- Subscribers automatically receive best layer for their bandwidth and render dimensions
- Reduces need for manual quality adaptation

**Codec limitation:** H.264 does NOT support simulcast. Use VP8 for multiparty rooms. Only use H.264 for 1-to-1 calls or when Safari compatibility requires it.

### Bandwidth Profiles

Bandwidth profiles optimize video delivery based on your UI layout. **Simulcast must be enabled for collaboration and presentation modes to work effectively.**

**Mode Selection Decision:**
1. Is it multiparty (3+ participants)? → If no, bandwidth profiles less critical
2. Is there a main video track (one emphasized)? → If no, use `grid`
3. Can VP8 Simulcast be used? → If no, use `grid`
4. Is main track quality critical? → If yes, use `presentation`; if no, use `collaboration`

| Mode | Best For | Simulcast Required? | Behavior |
|------|----------|---------------------|----------|
| `grid` | Equal-size tiles, or when simulcast unavailable | No (but recommended for 5+) | Balanced quality across all participants |
| `collaboration` | Dominant speaker layouts | Yes | Higher quality for active speaker, others reduced |
| `presentation` | Screen share / presenter focus | Yes | Maximizes primary track; may disable secondary tracks |

**Configuration:**
```javascript
const room = await connect(token, {
  preferredVideoCodecs: [{ codec: 'VP8', simulcast: true }],
  bandwidthProfile: {
    video: {
      mode: 'collaboration',  // or 'grid' or 'presentation'
      trackSwitchOffMode: 'predicted',
      clientTrackSwitchOffControl: 'auto',  // Auto-manage track visibility
      contentPreferencesMode: 'auto'        // Allocate bandwidth by render size
    }
  }
});
```

**Presentation Mode for Screen Share:**
```javascript
const room = await connect(token, {
  preferredVideoCodecs: [{ codec: 'VP8', simulcast: true }],
  bandwidthProfile: {
    video: {
      mode: 'presentation',  // Prioritizes screen share over cameras
      trackSwitchOffMode: 'predicted',
      clientTrackSwitchOffControl: 'auto',
      contentPreferencesMode: 'auto'
    }
  }
});
```

**Note:** The Track Priority API is deprecated. Use `clientTrackSwitchOffControl` and `contentPreferencesMode` (both default to `'auto'`) to manage bandwidth allocation based on rendered video tile sizes.

**Track Switch Off Modes:**

| Mode | Behavior | Use When |
|------|----------|----------|
| `predicted` (default) | Proactively disables tracks predicted to consume unnecessary bandwidth | Most cases |
| `detected` | Disables tracks only after bandwidth constraints detected | Need all tracks until problems occur |
| `disabled` | All subscribed tracks remain active regardless | Debugging, or must show all tracks |

**Max Subscription Bandwidth:**
- Desktop: Unlimited (default)
- Mobile: 2,500,000 bps (default)

### Network Quality API

Monitor connection quality per participant. Enable via connect options:

```javascript
const room = await connect(token, {
  name: roomName,
  tracks: localTracks,
  networkQuality: {
    local: 3,  // Verbosity for local participant (1-3)
    remote: 1  // Verbosity for remote participants (1-3)
  }
});
```

**Verbosity Levels:**
| Level | Data Provided |
|-------|---------------|
| 1 | `networkQualityLevel` only (0-5) |
| 2 | Level + audio/video send/recv quality |
| 3 | Level + detailed stats per track |

**Monitoring Quality:**
```javascript
// Track local participant quality
room.localParticipant.on('networkQualityLevelChanged', (level, stats) => {
  console.log(`Local quality: ${level}`);
  if (stats) {
    console.log(`Audio send: ${stats.audio?.send}, recv: ${stats.audio?.recv}`);
    console.log(`Video send: ${stats.video?.send}, recv: ${stats.video?.recv}`);
  }
});

// Track remote participant quality
room.on('participantConnected', participant => {
  participant.on('networkQualityLevelChanged', (level, stats) => {
    console.log(`${participant.identity}: quality ${level}`);
  });
});

// Access current quality synchronously
const currentLevel = room.localParticipant.networkQualityLevel;
const currentStats = room.localParticipant.networkQualityStats;
```

**Quality Levels:**
| Level | Meaning | Action |
|-------|---------|--------|
| 5 | Excellent | No action needed |
| 4 | Good | No action needed |
| 3 | Moderate | Monitor for degradation |
| 2 | Poor | Consider reducing video quality |
| 1 | Very poor | May need to disable video |
| 0/null | Unknown | Network quality not yet measured |

**Key Behaviors:**
- Quality level is `null` until first measurement (typically 2-5 seconds after connect)
- Events fire when quality changes, not continuously
- Both local and remote quality visible to all participants
- Quality can fluctuate during a call (5 → 4 → 3 is normal under varying conditions)

**UI Pattern:**
```javascript
function getQualityIndicator(level) {
  if (level === null) return '⏳'; // Measuring
  if (level >= 4) return '🟢';     // Good
  if (level >= 2) return '🟡';     // Fair
  return '🔴';                      // Poor
}
```

### Dominant Speaker Detection

Identify who is currently speaking in multi-participant rooms. Essential for spotlight views and speaker-focused layouts.

**Enable via connect options:**
```javascript
const room = await connect(token, {
  name: roomName,
  tracks: localTracks,
  dominantSpeaker: true  // Required to enable detection
});
```

**Tracking the dominant speaker:**
```javascript
// Listen for speaker changes
room.on('dominantSpeakerChanged', (participant) => {
  if (participant) {
    console.log(`Dominant speaker: ${participant.identity}`);
    // Highlight this participant's video tile
  } else {
    console.log('No dominant speaker (silence or only local audio)');
  }
});

// Access current dominant speaker synchronously
const currentSpeaker = room.dominantSpeaker;
if (currentSpeaker) {
  console.log(`Currently speaking: ${currentSpeaker.identity}`);
}
```

**Key Behaviors:**
- `dominantSpeakerChanged` fires when the active speaker changes
- Event participant is `null` when no remote participant has audio (silence or local-only)
- Detection is based on audio energy analysis - works with any audio source
- Events can fire frequently (every 1-2 seconds) during active conversation
- Only remote participants can be dominant speaker - local participant is never dominant

**Use Cases:**
- Spotlight/active speaker view - enlarge dominant speaker's video
- Recording focus - composition can prioritize dominant speaker
- Accessibility - announce speaker changes for screen readers
- Analytics - track speaking time per participant

**Combining with Bandwidth Profiles:**
```javascript
const room = await connect(token, {
  dominantSpeaker: true,
  bandwidthProfile: {
    video: {
      mode: 'collaboration',           // Prioritize dominant speaker
      dominantSpeakerPriority: 'high'  // Higher quality for active speaker
    }
  }
});
```

### Preflight API

Test network connectivity and WebRTC capabilities BEFORE joining a room. Essential for diagnosing connection issues and setting user expectations.

**Run preflight test:**
```javascript
const preflightTest = Twilio.Video.runPreflight(accessToken);

// Track progress through connection stages
preflightTest.on('progress', (progress) => {
  console.log(`Preflight stage: ${progress}`);
  // Stages: mediaAcquired → connected → iceConnected →
  //         dtlsConnected → mediaSubscribed → peerConnectionConnected → mediaStarted
});

// Handle completion with diagnostic report
preflightTest.on('completed', (report) => {
  console.log('Test duration:', report.testTiming.duration, 'ms');
  console.log('RTT average:', report.stats.rtt.average, 'ms');
  console.log('Packet loss:', report.stats.packetLoss.average, '%');
  console.log('ICE candidate type:', report.selectedIceCandidatePairStats.localCandidate.candidateType);
});

// Handle failure
preflightTest.on('failed', (error) => {
  console.error('Preflight failed:', error.code, error.message);
});
```

**Progress Events (in order):**
1. `mediaAcquired` - Local camera/microphone captured (~120ms)
2. `connected` - Connected to Twilio signaling (~800ms)
3. `iceConnected` - ICE connectivity established (~1.7s)
4. `dtlsConnected` - DTLS encryption handshake complete (~2s)
5. `mediaSubscribed` - Test media track subscribed (~2s)
6. `peerConnectionConnected` - WebRTC connection established (~2s)
7. `mediaStarted` - Media flowing through connection (~2.2s)

**Report Fields:**
- `testTiming.duration` - Total test duration in milliseconds
- `networkTiming.connect.duration` - Time to connect to Twilio servers
- `networkTiming.media.duration` - Time to establish media path
- `stats.jitter` - Jitter statistics (min/max/average) in milliseconds
- `stats.rtt` - Round-trip time statistics (min/max/average) in milliseconds
- `stats.packetLoss` - Packet loss percentage (min/max/average)
- `selectedIceCandidatePairStats` - Winning ICE candidate pair details
- `iceCandidateStats` - All gathered ICE candidates

**ICE Candidate Types:**
- `host` - Direct connection via local network address
- `srflx` - Server reflexive (NAT traversal via STUN)
- `relay` - Relayed through TURN server (fallback, higher latency)

**Use Cases:**
- Pre-call diagnostics - Show user network quality before joining
- Troubleshooting - Identify firewall/NAT issues blocking WebRTC
- Quality warnings - Alert users if RTT or packet loss are high
- Connection type - Determine if using direct or relayed connection

**Best Practices:**
- Run preflight before first call in a session
- Cache results for 5-10 minutes (network conditions are stable short-term)
- Show user-friendly status: "Checking connection..." → "Connection quality: Good"
- If preflight fails, suggest network troubleshooting before attempting call

### Video Capture Constraints

**Key principle:** Match capture resolution to display size. Capturing HD for a thumbnail wastes CPU and bandwidth.

**Platform Recommendations (from Twilio docs):**

| Platform | Webcam Capture | Screen Capture |
|----------|----------------|----------------|
| Desktop | 1280x720 @ 24fps | 1920x1080 @ 15fps |
| Mobile Browser | 640x480 @ 24fps | 1280x720 @ 15fps |
| Mobile SDK | 640x480 @ 24fps | 1280x720 @ 15fps |

**Configuration Example:**
```javascript
// Desktop webcam
const localTracks = await createLocalTracks({
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 24 }
  }
});

// Mobile webcam
const mobileTracks = await createLocalTracks({
  video: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 24 }
  }
});
```

**Minimum Bitrates (at 30fps):**

| Codec | Resolution | Min Bitrate |
|-------|------------|-------------|
| VP8 | 1280x720 | 650 kbps |
| VP8 Simulcast | 1280x720 | 1,400 kbps |
| H.264 | 1280x720 | 600 kbps |
| Opus (audio) | — | 32 kbps |

**Best Practices:**
- Display only necessary video tracks (don't render all 20 participants)
- Provide mute controls to reduce traffic
- Trust adaptive bitrate algorithms; avoid manually setting `maxVideoBitrate` unless severe CPU/battery constraints
- Use render dimensions hints so SFU can select appropriate simulcast layer

---

## Cross-Cutting Concerns

### HIPAA Compliance

Brief guidance:
- ✅ `group` rooms are HIPAA-eligible
- ❌ `peer-to-peer` and `go` are NOT HIPAA-eligible
- Requires signed BAA with Twilio
- Customer responsible for consent, access controls
- Link: https://www.twilio.com/docs/security/hipaa-eligible

### Deep Validation (MANDATORY)

**A 200 OK is NOT sufficient.** Video rooms can "appear to work" while silently failing.

```
ALWAYS CHECK (every room):
□ Room Resource - status = 'in-progress', type = 'group'
□ Participant count - expected participants connected
□ Published tracks - participants publishing audio/video
□ Subscribed tracks - participants receiving each other

WHEN USING TRANSCRIPTION (add these):
□ Transcription resource exists
□ Transcription status = 'started'
□ Sentences appearing (not stuck)
□ Speaker attribution working

WHEN USING RECORDING (add these):
□ Recording resources exist for participants
□ Recording status progresses to 'completed' after room ends
□ Track recordings accessible

WHEN USING COMPOSITION (add these):
□ Composition created after room ends
□ Composition status = 'completed'
□ Media URL accessible (returns 200)
```

**Feature Factory Enforcement:** Use `validate_video_room` MCP tool for automated validation.

### Recordings

**Track Types:**
- `audio` - Participant microphone
- `video` - Participant camera
- `data` - Application data (not recorded)
- Screen share recorded as `video` track (source: screen)

**Automatic Recording:**
```javascript
// Room creation
const room = await client.video.v1.rooms.create({
  uniqueName: 'my-room',
  type: 'group',
  recordParticipantsOnConnect: true  // Auto-record everyone
});
```

**Recording Rules (selective):**

Recording Rules provide fine-grained control over what gets recorded. Rules are evaluated in order - first match wins.

```javascript
// Include specific participant only
await client.video.v1.rooms(roomSid)
  .recordingRules
  .update({
    rules: [
      { type: 'include', publisher: 'doctor-123' },
      { type: 'exclude', all: true }  // Exclude everyone else
    ]
  });

// Record audio only (no video)
await client.video.v1.rooms(roomSid)
  .recordingRules
  .update({
    rules: [
      { type: 'include', all: true },
      { type: 'exclude', kind: 'video' }
    ]
  });

// Stop all recording mid-session
await client.video.v1.rooms(roomSid)
  .recordingRules
  .update({
    rules: [{ type: 'exclude', all: true }]
  });
```

**Rule Filter Options:**
| Filter | Values | Description |
|--------|--------|-------------|
| `all` | `true` | Match all participants/tracks |
| `publisher` | identity string | Match specific participant |
| `kind` | `audio`, `video` | Match track type |
| `track` | track name | Match specific track |

**Critical Constraint:** The `all` filter cannot be combined with other filters in the same rule. Use separate rules instead:
```javascript
// WRONG - will fail with "Invalid Recording Rule(s)"
{ type: 'include', all: true, kind: 'audio' }

// CORRECT - use two rules
[
  { type: 'include', all: true },
  { type: 'exclude', kind: 'video' }
]
```

**Dynamic Recording Control:**
Recording Rules can be updated mid-session to start, stop, or change recording:
- **Start:** Apply `include` rules → new recordings begin
- **Stop:** Apply `exclude all` → current recordings complete immediately
- **Restart:** Re-apply `include` rules → new recording segments created

Each start/stop cycle creates separate recording resources (not appended to previous).

**External Storage:**
Configure S3 for recordings > 24 hours:
- Console → Video → Recording Settings
- Provide S3 bucket, credentials, encryption key
- Encrypted storage available

**Recording Status:**
| Status | Meaning |
|--------|---------|
| `processing` | Recording in progress or processing |
| `completed` | Recording available for download |
| `deleted` | Recording has been deleted |
| `failed` | Recording failed |

**Recording File Validation:**

For strong validation, download and verify actual recording files:

```javascript
const { execSync } = require('child_process');
const fs = require('fs');

// Download recording via authenticated Media URL
const mediaUrl = `https://video.twilio.com/v1/Recordings/${recording.sid}/Media`;
const outputPath = `recording-${recording.sid}.mka`;  // .mka for audio, .mkv for video

execSync(`curl -s -L -u "${apiKey}:${apiSecret}" "${mediaUrl}" -o "${outputPath}"`);

// Validate with ffprobe
const ffprobeOutput = execSync(
  `ffprobe -v quiet -print_format json -show_format -show_streams "${outputPath}"`,
  { encoding: 'utf-8' }
);
const metadata = JSON.parse(ffprobeOutput);

// Verify stream type
const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
const videoStream = metadata.streams.find(s => s.codec_type === 'video');

// Verify duration matches API (within tolerance)
const fileDuration = parseFloat(metadata.format.duration);
expect(fileDuration).toBeCloseTo(recording.duration, 0);  // Within 1 second

// Cleanup
fs.unlinkSync(outputPath);
```

**File Extensions:**
| Track Type | Container | Extension |
|------------|-----------|-----------|
| Audio | Matroska | `.mka` |
| Video | Matroska | `.mkv` |
| Composition | MP4/WebM | `.mp4` / `.webm` |

### Compositions

**Manual Composition:**
```javascript
const composition = await client.video.v1.compositions.create({
  roomSid: 'RM...',
  audioSources: ['*'],  // All audio tracks
  videoLayout: {
    grid: { video_sources: ['*'] }  // Grid layout
  },
  resolution: '1280x720',
  format: 'mp4'
});

// Poll until complete
let status = composition.status;
while (status !== 'completed' && status !== 'failed') {
  await sleep(5000);
  const updated = await client.video.v1.compositions(composition.sid).fetch();
  status = updated.status;
}
```

**Composition Hooks (automatic):**

Hooks automatically create compositions when rooms end - no manual API call needed.

```javascript
const hook = await client.video.v1.compositionHooks.create({
  friendlyName: 'auto-compose-all',
  enabled: true,
  audioSources: ['*'],
  videoLayout: { grid: { video_sources: ['*'] } },
  resolution: '1280x720',
  format: 'mp4',
  trim: true,  // Only compose rooms with recordings
  statusCallback: 'https://example.com/composition-status',
  statusCallbackMethod: 'POST'
});

// Hook SID starts with 'HK'
console.log(hook.sid);  // HK...

// Delete hook when no longer needed
await client.video.v1.compositionHooks(hook.sid).remove();
```

**Hook Callback Events:**
Status callbacks fire in this order:
```
composition-enqueued → composition-started → composition-progress → composition-available
```

**Key Behaviors:**
- Hooks are account-level resources (persist across rooms)
- All rooms with recordings trigger the hook when they end
- Use `trim: true` to skip rooms without recordings
- Multiple hooks can exist; all matching hooks create compositions
- Composition settings (resolution, format, layout) come from hook config

**Layout Options:**
- `grid` - Equal-size tiles in grid
- `pip` - Picture-in-picture (main + small overlay)
- Custom layouts with regions

**Composition Status:**
| Status | Meaning |
|--------|---------|
| `enqueued` | Waiting to start processing |
| `processing` | Currently encoding |
| `completed` | Ready for download |
| `failed` | Composition failed |
| `deleted` | Composition has been deleted |

### Transcriptions

**Starting Transcription:**
```javascript
const transcription = await client.video.v1
  .rooms(roomSid)
  .transcriptions
  .create({
    partialResults: true,  // Stream partial + final
    languageCode: 'en-US'
  });
```

**Result Types:**
- `partial` - Interim results, may change (display only, don't persist)
- `final` - Committed results, speaker attributed (safe to persist)

**Handling Results (via webhook):**
```javascript
app.post('/transcription-callback', (req, res) => {
  const { TranscriptionText, TranscriptionType, ParticipantSid } = req.body;

  if (TranscriptionType === 'final') {
    // Store/display final transcript
    saveTranscript(ParticipantSid, TranscriptionText);
  }

  res.sendStatus(200);
});
```

**Supported Languages:**
- English (en-US, en-GB, en-AU)
- Spanish (es-ES, es-MX)
- French (fr-FR, fr-CA)
- German (de-DE)
- And more - check docs for current list

### PSTN Integration

**Dial-In:**
1. Configure SIP domain in Console
2. Get dial-in numbers
3. Participants call number, enter room code
4. Appear as audio-only participants

**Dial-Out:**
```javascript
// From your server - use participantIdentity for meaningful names
const call = await client.calls.create({
  to: '+1234567890',
  from: twilioNumber,
  twiml: `<Response><Connect><Room participantIdentity="phone-consultant">${roomName}</Room></Connect></Response>`
});
```

**Identifying PSTN Participants:**
- No video tracks (audio only)
- Use `participantIdentity` attribute to set a meaningful identity
- Without `participantIdentity`, identity is auto-generated (e.g., `+16509554780-634a594e`)
- Check participant source in events

**Gotcha:** PSTN participants cannot see video - they only hear audio. Plan your UX accordingly.

**Gotcha:** PSTN participants will NOT have audio track details in the Video Participant Summary. Their call information is available via the Voice Insights tool in the Twilio Console instead.

**PSTN Recording Math:**
```
Total recordings = (browser_participants × 2) + pstn_participants
Example: 2 browsers + 1 PSTN = (2 × 2) + 1 = 5 recordings
  - Expert: audio + video (2)
  - Patient: audio + video (2)
  - Phone Consultant: audio only (1)
```

**Verifying PSTN Participant Tracks:**
```javascript
const pstnTracks = await twilioClient.video.v1
  .rooms(roomSid)
  .participants(pstnParticipant.sid)
  .publishedTracks.list();

const videoTracks = pstnTracks.filter(t => t.kind === 'video');
const audioTracks = pstnTracks.filter(t => t.kind === 'audio');

expect(videoTracks.length).toBe(0); // PSTN has no video
expect(audioTracks.length).toBe(1); // PSTN has audio
```

**Browser Remote Track Counts with PSTN:**
- `remote_video = browser_participants - 1` (no video from PSTN)
- `remote_audio = total_participants - 1` (audio from all)
- `remote_participant_count = total_participants - 1` (PSTN counts as participant)

**Composition with PSTN Audio:**
```javascript
const composition = await twilioClient.video.v1.compositions.create({
  roomSid,
  audioSources: ['*'], // Includes PSTN audio automatically
  videoLayout: { grid: { video_sources: ['*'] } }, // Browser video only
  // ...
});
```

**PSTN Join Timing:**
- After `calls.create()`, poll room participants until PSTN appears
- Allow 60 seconds for phone answer and room join
- Use `participantIdentity` TwiML attribute for predictable identity matching

---

## Gotchas & Edge Cases

### Room Status Lifecycle

Rooms transition: `in-progress` → `completed` → (never back)

**Gotcha:** Cannot reactivate a completed room. Must create new room.

### Composition Timing

**CRITICAL:** Compositions can only be created AFTER the room ends.

**Gotcha:** Starting a composition while room is `in-progress` will fail.

**Gotcha:** The composition service is batch-based. While most compositions complete in 3-5 minutes, the service can take up to 10 minutes or occasionally longer during periods of high load.

#### Best Practice: Use Status Callbacks (Recommended)

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

#### Fallback: Polling (For Tests)

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

### Transcription Partial vs Final

**Gotcha:** Partial results are interim and WILL change. Don't persist them.

Pattern:
- Display `partial` for real-time UX
- Only persist `final` results
- Final results include speaker attribution

### PSTN Participants

**Gotcha:** PSTN participants show as connected but have NO video track.

Pattern:
- Check `participant.videoTracks.size === 0` for audio-only
- Don't assume all participants have video
- Handle gracefully in UI (show avatar or audio indicator)

### Empty Room Timeout

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

### Max Participant Duration

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

### Recording Storage Retention

**Gotcha:** Without external storage, recordings deleted after 24 hours.

**Always configure S3** for production if recordings matter.

### Codec Compatibility

**Gotcha:** H.264 requires hardware support; VP8 is software-decoded.

Recommendation:
- Default to VP8 for broad compatibility
- Use H.264 only if native app has hardware encoder
- Safari prefers H.264

### Media Region Selection

**Gotcha:** Wrong media region = high latency.

Pattern:
- Auto-select based on first participant (default)
- Or explicitly set for known geography

Available regions: `us1`, `us2`, `ie1`, `de1`, `au1`, `br1`, `jp1`, `sg1`, `in1`

### Track Limits

**Gotcha:** Group rooms have track subscription limits.

- 16 video tracks max visible simultaneously
- Additional participants can publish, but not all visible
- Use Bandwidth Profile with `clientTrackSwitchOffControl: 'auto'` and `contentPreferencesMode: 'auto'` to automatically manage which tracks receive bandwidth based on render dimensions

### Reconnection Handling

The SDK automatically attempts to reconnect when network disruptions occur. Monitor state transitions to provide appropriate UX.

**Room State Transitions:**
```
connected → reconnecting → connected (success)
connected → reconnecting → disconnected (timeout after ~30 seconds)
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

### Disconnect Error Codes

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

---

## 2026 Customer Problem Themes

### Theme 1: Telehealth Accessibility
"Patients can't access video visits"
→ PSTN dial-in, transcription for deaf/HoH, browser-based (no app install)

### Theme 2: Compliance Recording
"We need records of every consultation"
→ Automatic recording, compositions, external S3 storage, retention policies

### Theme 3: Remote Proctoring Scale
"We have 10,000 exams to monitor"
→ Per-student rooms, raw recordings, screen share detection, efficient storage

### Theme 4: Professional Meeting Quality
"Our video calls look terrible"
→ Bandwidth profiles, simulcast, network quality monitoring, adaptive streaming

### Theme 5: Integration Simplicity
"We just want video in our app"
→ Access tokens, SDK quickstarts, composition hooks (automatic)

---

## E2E Testing with Playwright

The repository includes a complete E2E test suite for Video SDK integration.

### Running Video SDK Tests

```bash
# Headless (CI-friendly)
npm run test:video-sdk

# Headed (visible browser for debugging)
npm run test:video-sdk:headed
```

### Test Harness

Location: `__tests__/e2e/video-sdk/`

- `harness.html` - Browser video app with test-friendly DOM IDs
- `server.js` - Express server serving harness + token endpoint
- `video.spec.js` - Playwright test suite

### What the Tests Verify

| Test | Verification |
|------|-------------|
| Single participant connects | Room join, local tracks published, room SID populated |
| Two participants connect | Both see remote tracks, identities correct |
| Video stream verification | `videoWidth > 0`, `videoHeight > 0`, `readyState >= 2` |
| Audio stream verification | Web Audio API analyser detects level > -60 dB |
| **WebRTC stats verification** | `packetsSent > 0`, `packetsReceived > 0` for both participants |
| Room API verification | Twilio API confirms `type: group`, participant count |
| Disconnect handling | Remote track counts go to 0, remaining participant stays connected |
| Webhook callbacks | Sync document contains room-created, track-added, participant-disconnected, room-ended |
| **3 participants + recording + composition** | 6 recordings created, composition completes with MP4, duration > 0 |
| **Screen sharing** | Screen track published with `name: 'screen'`, remote sees 2 video tracks |
| **Real-time transcription** | Room created with `transcribeParticipantsOnConnect: true`, callbacks logged |
| **PSTN consultation** | 2 browser + 1 PSTN participant, 5 recordings, composition with mixed audio |
| **Exam proctoring** | Student recorded, proctor invisible via Track Subscriptions API, 0 proctor recordings |
| **DataTrack collaboration** | Bidirectional message exchange, 20 rapid messages received in order |
| **Network Quality monitoring** | Local/remote quality levels (0-5), `networkQualityLevelChanged` events fire |
| **Reconnection - successful** | Brief disruption triggers `reconnecting` → `reconnected` with tracks preserved |
| **Reconnection - timeout** | Prolonged disruption (30s) triggers `disconnected` with error 53001 |
| **Reconnection - remote observer** | Bob sees Alice's `participant-reconnecting` and `participant-reconnected` events |
| **Dominant speaker - basic** | 3 participants, `dominantSpeakerChanged` fires, `room.dominantSpeaker` accessible |
| **Dominant speaker - transitions** | Muting participants changes dominant speaker, multiple unique speakers detected |
| **Recording Rules - audio only** | `include all` + `exclude kind=video` = only audio recorded (0 video) |
| **Recording Rules - dynamic** | Start/stop/restart recording mid-session via rule updates, creates separate recording segments |
| **Composition Hooks** | Hook auto-creates composition on room end, callbacks fire (enqueued→started→progress→available) |
| **Bandwidth Profile - presentation** | Presentation mode with adaptive simulcast, screen share + camera tracks flow correctly |
| **Max Participant Duration** | 2 participants auto-disconnected at 600s with error 53216, recordings completed |

### Stream Verification Patterns

**Video rendering check:**
```javascript
await page.waitForFunction(() => {
  const video = document.querySelector('#remote-video video');
  return video && video.videoWidth > 0 && video.videoHeight > 0;
}, { timeout: 15000 });
```

**Audio level detection (Web Audio API):**
```javascript
// In harness - expose getAudioLevel() for tests
window.getAudioLevel = function() {
  audioAnalyser.getByteFrequencyData(audioDataArray);
  const avg = audioDataArray.reduce((a, b) => a + b, 0) / audioDataArray.length;
  return avg > 0 ? 20 * Math.log10(avg / 255) : -Infinity;
};

// In test - verify audio is flowing
const audioLevel = await page.evaluate(() => window.getAudioLevel());
expect(audioLevel).toBeGreaterThan(-60); // dB threshold
```

### WebRTC Stats Verification

The SDK provides `room.getStats()` for definitive proof of packet flow:

```javascript
// In harness - expose stats for Playwright
window.getTrackStats = async function() {
  if (!room) return null;
  const reports = await room.getStats();

  const stats = { local: { video: [], audio: [] }, remote: { video: [], audio: [] } };

  reports.forEach(report => {
    // Publisher (local) stats
    report.localVideoTrackStats.forEach(s => {
      stats.local.video.push({
        packetsSent: s.packetsSent,
        bytesSent: s.bytesSent,
        frameRate: s.frameRate,
        dimensions: s.dimensions,           // Encoding resolution
        captureDimensions: s.captureDimensions, // Camera resolution
        roundTripTime: s.roundTripTime
      });
    });

    // Subscriber (remote) stats
    report.remoteVideoTrackStats.forEach(s => {
      stats.remote.video.push({
        packetsReceived: s.packetsReceived,
        bytesReceived: s.bytesReceived,
        frameRate: s.frameRate,
        dimensions: s.dimensions
      });
    });
  });
  return stats;
};
```

**Available Stats:**

| Direction | Stat | Description |
|-----------|------|-------------|
| Local (publishing) | `packetsSent` | Total packets transmitted |
| Local | `bytesSent` | Total bytes transmitted |
| Local | `frameRate` | Encoding frame rate |
| Local | `dimensions` | Encoding resolution (may be downscaled) |
| Local | `captureDimensions` | Camera capture resolution |
| Local | `roundTripTime` | RTT in milliseconds |
| Local audio | `audioLevel` | Microphone input level |
| Local audio | `jitter` | Audio jitter in ms |
| Remote (subscribing) | `packetsReceived` | Total packets received |
| Remote | `bytesReceived` | Total bytes received |
| Remote | `frameRate` | Received frame rate |
| Remote | `dimensions` | Received resolution |

**Test Pattern:**
```javascript
const stats = await page.evaluate(() => window.getTrackStats());

// Verify publisher is sending
expect(stats.local.video[0].packetsSent).toBeGreaterThan(0);
expect(stats.local.audio[0].packetsSent).toBeGreaterThan(0);

// Verify subscriber is receiving
expect(stats.remote.video[0].packetsReceived).toBeGreaterThan(0);
expect(stats.remote.audio[0].packetsReceived).toBeGreaterThan(0);
```

### Playwright Configuration

The video-sdk project in `playwright.config.js` uses:
- `--use-fake-device-for-media-stream` - Chrome generates synthetic video/audio
- `--use-fake-ui-for-media-stream` - Auto-accept permission prompts
- `permissions: ['camera', 'microphone']` - Grant media permissions

### Key Learnings

1. **Chrome fake audio produces ~440Hz tone** - Detectable at around -21 dB with Web Audio API analyser
2. **Two browser contexts for two-party tests** - Use `browser.newContext()` to simulate separate participants
3. **Video dimensions verify rendering** - `videoWidth/videoHeight > 0` confirms video is actually displaying, not just connected
4. **Room auto-creation** - Rooms are created automatically when first participant joins with a token scoped to that room name
5. **Track subscription is automatic** - No need to manually subscribe; tracks appear via `trackSubscribed` event
6. **Capture vs encoding resolution** - `captureDimensions` shows camera resolution (e.g., 1280x720), while `dimensions` shows actual encoding resolution (may be lower due to adaptive bitrate)
7. **Adaptive bitrate downscales automatically** - SDK may encode at lower resolution than capture based on network conditions. This is expected behavior, not a bug.
8. **WebRTC stats prove packet flow** - `packetsSent > 0` and `packetsReceived > 0` definitively prove media is flowing, unlike DOM checks which only show track attachment
9. **1:1 calls don't need simulcast** - For two-party calls, skip `preferredVideoCodecs: [{ codec: 'VP8', simulcast: true }]` - simulcast is for 3+ participants
10. **3+ participants need simulcast** - Enable VP8 simulcast and bandwidth profiles for rooms with 3 or more participants
11. **Recording math: N participants = 2N recordings** - Each participant produces 1 audio + 1 video track recording. For 3 participants, expect 6 track recordings.
12. **Composition requires room completion first** - Compositions can only be created AFTER the room ends. Poll recordings until all complete, then create composition.
13. **Composition can take up to 10 minutes** - The composition service is batch-based. While most compositions complete in 3-5 minutes, the service can take up to 10 minutes or occasionally longer during high load.
14. **Simulcast creates multiple resolutions** - With simulcast enabled, WebRTC stats show 3 video entries per local track (e.g., 320x180, 640x360, 1280x720).
15. **Transcription with synthetic audio** - Chrome's fake audio capture (even with a speech WAV file) may not produce transcription output. The transcription service may not recognize synthetic audio as speech. Test verifies API integration, not transcription accuracy.
16. **Screen share canvas capture** - Canvas-based screen simulation for tests doesn't report exact dimensions in WebRTC stats (shows null), but track is published and received correctly.
17. **DataTracks are NOT recorded** - Only audio and video tracks are captured. DataTracks for chat/collaboration are excluded from recordings.
18. **DataTrack messages are ordered** - SCTP guarantees reliable, ordered delivery. 20 rapid messages arrive in exact send order.
19. **Network quality starts as null** - `networkQualityLevel` is `null` until first measurement (2-5 seconds after connect). Don't assume immediate availability.
20. **Quality levels fluctuate normally** - Seeing quality change from 5 → 4 → 3 during a call is normal behavior, not an error. Network conditions vary.
21. **Both local and remote quality visible** - Each participant can monitor both their own quality AND remote participants' quality levels.
22. **Network quality requires connect option** - Must enable `networkQuality: { local: 1, remote: 1 }` in connect options to receive events.
23. **Reconnection timeout is ~30 seconds** - SDK auto-reconnects for approximately 30 seconds before emitting `disconnected` with error 53001.
24. **Tracks survive reconnection** - Published tracks are preserved across reconnect; no need to republish after `reconnected` event.
25. **Remote participants see reconnection state** - Use `participant.on('reconnecting')` and `participant.on('reconnected')` to track remote peer network issues.
26. **CDP network simulation works for WebSocket** - `Network.emulateNetworkConditions` with `offline: true` reliably triggers SDK reconnection logic.
27. **Dominant speaker requires connect option** - Must set `dominantSpeaker: true` in connect options; disabled by default.
28. **Local participant is never dominant** - Only remote participants can be dominant speaker; when only local has audio, dominant is `null`.
29. **Muting affects dominant speaker** - Disabling audio tracks removes participant from dominant speaker consideration.
30. **Dominant speaker events fire frequently** - In active conversations, `dominantSpeakerChanged` can fire every 1-2 seconds.
31. **Recording Rules `all` filter is exclusive** - Cannot combine `all: true` with `kind` or `publisher` in same rule; use separate rules.
32. **No rules = no recording** - Rooms without `recordParticipantsOnConnect` and no Recording Rules produce zero recordings.
33. **Recording Rules stop immediately** - Applying `exclude all` completes in-progress recordings instantly; no delay.
34. **Restart creates new recordings** - Re-applying include rules after exclude creates separate recording resources, not appended segments.
35. **Recording files are Matroska format** - Audio recordings are `.mka`, video recordings are `.mkv` (not MP4).
36. **Recording Media URL requires auth** - Use `curl -u "apiKey:apiSecret"` with `-L` to follow redirects.
37. **ffprobe validates recording content** - Use `show_format` and `show_streams` to verify duration and stream types match API metadata.
38. **Composition Hooks are account-level** - Hooks persist across rooms; delete test hooks in `finally` block to avoid affecting other rooms.
39. **Composition Hook callback events** - Lifecycle: `composition-enqueued` → `composition-started` → `composition-progress` → `composition-available`.
40. **Use `trim: true` for hooks** - Ensures only rooms with actual recordings trigger composition (empty rooms are skipped).
41. **Simulcast creates 3 layers per track** - With adaptive simulcast, WebRTC stats show 6 entries for 2 video tracks (3 layers × 2 tracks).
42. **Not all simulcast layers send data** - Unused layers show `packetsSent: 0`; SFU only requests layers subscribers need.
43. **Remote track stats may be null initially** - `packetsReceived: null` indicates track exists but hasn't started receiving; handle gracefully.
44. **`dominantSpeakerPriority` is deprecated** - Use `clientTrackSwitchOffControl: 'auto'` and `contentPreferencesMode: 'auto'` instead.
45. **`maxParticipantDuration` minimum is 600 seconds** - Despite docs saying 0-86400, values below 600 fail with error 53123.
46. **Max duration disconnect code is 53216** - Error message: "Participant session length exceeded." (not 53118 as some docs suggest).
47. **Recordings auto-complete on max duration disconnect** - When participants are disconnected, their recordings complete with duration matching session length.
48. **Preflight doesn't require room name** - Token for preflight only needs identity; no room grant needed.
49. **Preflight test duration ~10-15 seconds** - Full diagnostic cycle including 10s media sampling takes 10-15 seconds.
50. **Preflight reports 7 progress events** - mediaAcquired → connected → iceConnected → dtlsConnected → mediaSubscribed → peerConnectionConnected → mediaStarted.
51. **ICE candidates include multiple types** - Typical preflight gathers 10+ host, 1+ srflx, 3+ relay candidates for connectivity options.
52. **TURN relay is common fallback** - Selected ICE pair often shows `relay` type when behind restrictive firewalls; this is expected, not an error.
53. **Normal disconnect has no error code** - `room.on('disconnected', (room, error))` receives `error: null` for voluntary leave.
54. **Room completion gives error 53118** - When room is ended via API, participants receive error code 53118 "Room completed".
55. **Participant removal has NO error code** - Kicking a participant via API (`participant.update({ status: 'disconnected' })`) produces no error code - indistinguishable from normal leave!
56. **Token expiry error is 20104** - Access token expired. Token invalid is 20101.
57. **Cannot distinguish kicked vs left** - The SDK treats participant removal identically to voluntary disconnect; implement custom signaling if kick detection needed.

### Testing 3+ Participant Calls

Use multiple browser contexts to simulate multi-party calls:

```javascript
const contextAlice = await browser.newContext({ permissions: ['camera', 'microphone'] });
const contextBob = await browser.newContext({ permissions: ['camera', 'microphone'] });
const contextCharlie = await browser.newContext({ permissions: ['camera', 'microphone'] });
```

**Enable simulcast for 3+ participants:**
```javascript
// Set flag before joining
await page.evaluate(() => { window.SIMULCAST_ENABLED = true; });
```

**Expected track counts for N participants:**
- Local: 1 audio + 1 video (2 total)
- Remote per participant: (N-1) audio + (N-1) video
- Total recordings after room ends: N audio + N video (2N total)

**Recording and Composition Test Pattern:**
```javascript
// 1. Create room with recording enabled
const room = await twilioClient.video.v1.rooms.create({
  uniqueName: roomName,
  type: 'group',
  recordParticipantsOnConnect: true,
  statusCallback: `${CALLBACK_URL}/video/callbacks/room-status`,
  recordingStatusCallback: `${CALLBACK_URL}/video/callbacks/recording-status`,
});

// 2. All participants join and interact...

// 3. All participants disconnect

// 4. End room
await twilioClient.video.v1.rooms(roomSid).update({ status: 'completed' });

// 5. Wait for all recordings to complete
const recordings = await pollUntil(
  () => twilioClient.video.v1.rooms(roomSid).recordings.list(),
  (recs) => recs.length === 6 && recs.every(r => r.status === 'completed'),
  60000
);

// 6. Create composition
const composition = await twilioClient.video.v1.compositions.create({
  roomSid,
  audioSources: ['*'],
  videoLayout: { grid: { video_sources: ['*'] } },
  resolution: '1280x720',
  format: 'mp4',
  trim: true,
});

// 7. Wait for composition to complete
// Best practice: Use statusCallback webhooks instead of polling in production.
// Polling shown here for test simplicity - composition service is batch-based.
const completed = await pollUntil(
  () => twilioClient.video.v1.compositions(composition.sid).fetch(),
  (c) => c.status === 'completed' || c.status === 'failed',
  600000, // 10 minutes - batch-based service
  10000   // check every 10 seconds
);

expect(completed.status).toBe('completed');
expect(completed.duration).toBeGreaterThan(0);

// 8. Download and validate MP4 file
const { execSync } = require('child_process');
const mediaUrl = `https://video.twilio.com/v1/Compositions/${completed.sid}/Media`;
execSync(`curl -s -L -u "${apiKey}:${apiSecret}" "${mediaUrl}" -o "${outputPath}"`);

// Verify with ffprobe
const metadata = JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_streams "${outputPath}"`));
const videoStream = metadata.streams.find(s => s.codec_type === 'video');
expect(videoStream.codec_name).toBe('h264');
expect(videoStream.width).toBe(1280);
expect(videoStream.height).toBe(720);
```

### Composition File Validation

After composition completes, download and validate the actual MP4:

```javascript
const fs = require('fs');
const { execSync } = require('child_process');

// Download using authenticated curl
const apiKey = process.env.TWILIO_API_KEY;
const apiSecret = process.env.TWILIO_API_SECRET;
const mediaUrl = `https://video.twilio.com/v1/Compositions/${composition.sid}/Media`;
execSync(`curl -s -L -u "${apiKey}:${apiSecret}" "${mediaUrl}" -o "${outputPath}"`);

// Verify file size matches API response
const stats = fs.statSync(outputPath);
expect(stats.size).toBe(composition.size);

// Validate with ffprobe (if available)
const ffprobeOutput = execSync(
  `ffprobe -v quiet -print_format json -show_format -show_streams "${outputPath}"`,
  { encoding: 'utf-8' }
);
const metadata = JSON.parse(ffprobeOutput);

// Video: H.264 at expected resolution
const videoStream = metadata.streams.find(s => s.codec_type === 'video');
expect(videoStream.codec_name).toBe('h264');
expect(videoStream.width).toBe(1280);
expect(videoStream.height).toBe(720);

// Audio: AAC
const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
expect(audioStream.codec_name).toBe('aac');

// Duration within tolerance
const fileDuration = parseFloat(metadata.format.duration);
expect(fileDuration).toBeCloseTo(composition.duration, 0);

// Clean up
fs.unlinkSync(outputPath);
```

---

## Related Resources

- [Video MCP Tools](/agents/mcp-servers/twilio/src/tools/video.ts) - 10 tools:
  - Room management: `create_video_room`, `list_video_rooms`, `get_room`, `update_room`
  - Participants: `list_room_participants`, `get_participant`, `update_participant`
  - Recordings: `list_room_recordings`
  - Tracks: `list_subscribed_tracks`, `list_published_tracks`
- [Media MCP Tools](/agents/mcp-servers/twilio/src/tools/media.ts) - 10 tools:
  - Recordings: `list_video_recordings`, `get_video_recording`, `delete_video_recording`
  - Compositions: `list_compositions`, `get_composition`, `create_composition`, `delete_composition`
  - Hooks: `list_composition_hooks`, `create_composition_hook`, `delete_composition_hook`
- [Validation Tools](/agents/mcp-servers/twilio/src/tools/validation.ts) - `validate_video_room` MCP tool
- [Deep Validation Skill](/.claude/skills/deep-validation.md) - Video validation patterns
- [Twilio Video Docs](https://www.twilio.com/docs/video) - Official reference
- [Video JavaScript SDK](https://www.twilio.com/docs/video/javascript) - Browser integration
- [Video iOS SDK](https://www.twilio.com/docs/video/ios) - Native iOS
- [Video Android SDK](https://www.twilio.com/docs/video/android) - Native Android
