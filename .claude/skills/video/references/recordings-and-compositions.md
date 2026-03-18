# Recordings & Compositions

## Recordings

### Track Types
- `audio` - Participant microphone
- `video` - Participant camera
- `data` - Application data (not recorded)
- Screen share recorded as `video` track (source: screen)

### Automatic Recording
```javascript
// Room creation
const room = await client.video.v1.rooms.create({
  uniqueName: 'my-room',
  type: 'group',
  recordParticipantsOnConnect: true  // Auto-record everyone
});
```

### Recording Rules (Selective)

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

### Dynamic Recording Control

Recording Rules can be updated mid-session to start, stop, or change recording:
- **Start:** Apply `include` rules -> new recordings begin
- **Stop:** Apply `exclude all` -> current recordings complete immediately
- **Restart:** Re-apply `include` rules -> new recording segments created

Each start/stop cycle creates separate recording resources (not appended to previous).

### External Storage

Configure S3 for recordings > 24 hours:
- Console -> Video -> Recording Settings
- Provide S3 bucket, credentials, encryption key
- Encrypted storage available

### Recording Status

| Status | Meaning |
|--------|---------|
| `processing` | Recording in progress or processing |
| `completed` | Recording available for download |
| `deleted` | Recording has been deleted |
| `failed` | Recording failed |

### Recording File Validation

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

---

## Compositions

### Manual Composition
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

### Composition Hooks (Automatic)

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
composition-enqueued -> composition-started -> composition-progress -> composition-available
```

**Key Behaviors:**
- Hooks are account-level resources (persist across rooms)
- All rooms with recordings trigger the hook when they end
- Use `trim: true` to skip rooms without recordings
- Multiple hooks can exist; all matching hooks create compositions
- Composition settings (resolution, format, layout) come from hook config

### Layout Options
- `grid` - Equal-size tiles in grid
- `pip` - Picture-in-picture (main + small overlay)
- Custom layouts with regions

### Composition Status

| Status | Meaning |
|--------|---------|
| `enqueued` | Waiting to start processing |
| `processing` | Currently encoding |
| `completed` | Ready for download |
| `failed` | Composition failed |
| `deleted` | Composition has been deleted |

### HIPAA Compliance

Brief guidance:
- `group` rooms are HIPAA-eligible
- `peer-to-peer` and `go` are NOT HIPAA-eligible
- Requires signed BAA with Twilio
- Customer responsible for consent, access controls
- Link: https://www.twilio.com/docs/security/hipaa-eligible
