# Network Quality & Bandwidth

## Simulcast (Enable First)

**CRITICAL:** Enable VP8 Simulcast for any room with 3+ participants. Simulcast creates multiple encoded versions of each video stream at different resolutions/bitrates, allowing subscribers to receive the version matching their display needs and bandwidth.

```javascript
const room = await connect(token, {
  preferredVideoCodecs: [{ codec: 'VP8', simulcast: true }]
});
```

**When to use Simulcast:**

| Room Type | Simulcast | Why |
|-----------|-----------|-----|
| 1-to-1 | Disable | Unnecessary overhead |
| 3+ participants | Enable | Essential for quality at scale |
| 5+ participants | Required | Quality degrades significantly without it |

**How Simulcast Works:**
- Publisher sends 3 quality layers simultaneously (high, medium, low)
- SFU (Selective Forwarding Unit) selects appropriate layer per subscriber
- Subscribers automatically receive best layer for their bandwidth and render dimensions
- Reduces need for manual quality adaptation

**Codec limitation:** H.264 does NOT support simulcast. Use VP8 for multiparty rooms. Only use H.264 for 1-to-1 calls or when Safari compatibility requires it.

## Bandwidth Profiles

Bandwidth profiles optimize video delivery based on your UI layout. **Simulcast must be enabled for collaboration and presentation modes to work effectively.**

**Mode Selection Decision:**
1. Is it multiparty (3+ participants)? -> If no, bandwidth profiles less critical
2. Is there a main video track (one emphasized)? -> If no, use `grid`
3. Can VP8 Simulcast be used? -> If no, use `grid`
4. Is main track quality critical? -> If yes, use `presentation`; if no, use `collaboration`

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

## Network Quality API

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
- Quality can fluctuate during a call (5 -> 4 -> 3 is normal under varying conditions)

**UI Pattern:**
```javascript
function getQualityIndicator(level) {
  if (level === null) return '...'; // Measuring
  if (level >= 4) return 'Good';
  if (level >= 2) return 'Fair';
  return 'Poor';
}
```

## Dominant Speaker Detection

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

## Preflight API

Test network connectivity and WebRTC capabilities BEFORE joining a room. Essential for diagnosing connection issues and setting user expectations.

**Run preflight test:**
```javascript
const preflightTest = Twilio.Video.runPreflight(accessToken);

// Track progress through connection stages
preflightTest.on('progress', (progress) => {
  console.log(`Preflight stage: ${progress}`);
  // Stages: mediaAcquired -> connected -> iceConnected ->
  //         dtlsConnected -> mediaSubscribed -> peerConnectionConnected -> mediaStarted
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
- Show user-friendly status: "Checking connection..." -> "Connection quality: Good"
- If preflight fails, suggest network troubleshooting before attempting call

## Video Capture Constraints

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
| Opus (audio) | -- | 32 kbps |

**Best Practices:**
- Display only necessary video tracks (don't render all 20 participants)
- Provide mute controls to reduce traffic
- Trust adaptive bitrate algorithms; avoid manually setting `maxVideoBitrate` unless severe CPU/battery constraints
- Use render dimensions hints so SFU can select appropriate simulcast layer
