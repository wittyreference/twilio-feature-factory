# Transcription & PSTN Integration

## Transcriptions

### Starting Transcription
```javascript
const transcription = await client.video.v1
  .rooms(roomSid)
  .transcriptions
  .create({
    partialResults: true,  // Stream partial + final
    languageCode: 'en-US'
  });
```

### Result Types
- `partial` - Interim results, may change (display only, don't persist)
- `final` - Committed results, speaker attributed (safe to persist)

### Handling Results (via webhook)
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

### Supported Languages
- English (en-US, en-GB, en-AU)
- Spanish (es-ES, es-MX)
- French (fr-FR, fr-CA)
- German (de-DE)
- And more - check docs for current list

---

## PSTN Integration

### Dial-In
1. Configure SIP domain in Console
2. Get dial-in numbers
3. Participants call number, enter room code
4. Appear as audio-only participants

### Dial-Out
```javascript
// From your server - use participantIdentity for meaningful names
const call = await client.calls.create({
  to: '+1234567890',
  from: twilioNumber,
  twiml: `<Response><Connect><Room participantIdentity="phone-consultant">${roomName}</Room></Connect></Response>`
});
```

### Identifying PSTN Participants
- No video tracks (audio only)
- Use `participantIdentity` attribute to set a meaningful identity
- Without `participantIdentity`, identity is auto-generated (e.g., `+16509554780-634a594e`)
- Check participant source in events

**Gotcha:** PSTN participants cannot see video - they only hear audio. Plan your UX accordingly.

**Gotcha:** PSTN participants will NOT have audio track details in the Video Participant Summary. Their call information is available via the Voice Insights tool in the Twilio Console instead.

### PSTN Recording Math
```
Total recordings = (browser_participants x 2) + pstn_participants
Example: 2 browsers + 1 PSTN = (2 x 2) + 1 = 5 recordings
  - Expert: audio + video (2)
  - Patient: audio + video (2)
  - Phone Consultant: audio only (1)
```

### Verifying PSTN Participant Tracks
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

### Browser Remote Track Counts with PSTN
- `remote_video = browser_participants - 1` (no video from PSTN)
- `remote_audio = total_participants - 1` (audio from all)
- `remote_participant_count = total_participants - 1` (PSTN counts as participant)

### Composition with PSTN Audio
```javascript
const composition = await twilioClient.video.v1.compositions.create({
  roomSid,
  audioSources: ['*'], // Includes PSTN audio automatically
  videoLayout: { grid: { video_sources: ['*'] } }, // Browser video only
  // ...
});
```

### PSTN Join Timing
- After `calls.create()`, poll room participants until PSTN appears
- Allow 60 seconds for phone answer and room join
- Use `participantIdentity` TwiML attribute for predictable identity matching
