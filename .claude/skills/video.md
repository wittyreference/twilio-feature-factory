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

| Level | Implementation | Participant Sees |
|-------|----------------|------------------|
| **Visible** | Default subscribe-to-all | Observer's identity, audio, video |
| **Silent** | Observer publishes no tracks | Participant count increases, no media |
| **Invisible** | Track Subscriptions API exclusion | Participant count increases, no media, no track events |

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
```javascript
const screenTrack = await navigator.mediaDevices.getDisplayMedia({
  video: true
});
const track = new LocalVideoTrack(screenTrack.getVideoTracks()[0], {
  name: 'screen'
});
await room.localParticipant.publishTrack(track);
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
      mode: 'collaboration',
      dominantSpeakerPriority: 'high',
      trackSwitchOffMode: 'predicted',
      clientTrackSwitchOffControl: 'auto',  // Auto-manage track visibility
      contentPreferencesMode: 'auto'         // Allocate bandwidth by render size
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

Monitor connection quality per participant:
```javascript
room.on('participantConnected', participant => {
  participant.on('networkQualityLevelChanged', (level, stats) => {
    // level: 0-5 (0 = unknown, 1 = poor, 5 = excellent)
    console.log(`${participant.identity}: quality ${level}`);
  });
});
```

**Quality Levels:**
| Level | Meaning | Action |
|-------|---------|--------|
| 5 | Excellent | No action needed |
| 4 | Good | No action needed |
| 3 | Moderate | Monitor for degradation |
| 2 | Poor | Consider reducing video quality |
| 1 | Very poor | May need to disable video |
| 0 | Unknown | Network quality not available |

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
```javascript
// Include specific participants
await client.video.v1.rooms(roomSid)
  .recordingRules
  .update({
    rules: [
      { type: 'include', publisher: 'doctor-123' },
      { type: 'exclude', all: true }  // Exclude everyone else
    ]
  });
```

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
```javascript
await client.video.v1.compositionHooks.create({
  friendlyName: 'auto-compose-all',
  enabled: true,
  audioSources: ['*'],
  videoLayout: { grid: { video_sources: ['*'] } },
  resolution: '1280x720',
  format: 'mp4',
  statusCallback: 'https://example.com/composition-status'
});
```

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
// From your server
const call = await client.calls.create({
  to: '+1234567890',
  from: twilioNumber,
  twiml: `<Response><Connect><Room>${roomName}</Room></Connect></Response>`
});
```

**Identifying PSTN Participants:**
- No video tracks (audio only)
- Identity often includes phone number
- Check participant source in events

**Gotcha:** PSTN participants cannot see video - they only hear audio. Plan your UX accordingly.

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

**Gotcha:** Network blips disconnect participants without warning.

Pattern:
```javascript
room.on('disconnected', (room, error) => {
  if (error?.code === 53001) {
    // Signaling disconnected - attempt reconnect
    reconnectToRoom();
  }
});
```

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
