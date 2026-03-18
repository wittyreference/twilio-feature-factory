---
name: media-streams
description: Twilio Media Streams WebSocket guide. Use when building voice AI with custom STT/TTS, real-time audio processing, bidirectional audio, or <Connect><Stream> integration.
---

# Media Streams Skill

Guide for Twilio Media Streams (`<Connect><Stream>`) — raw audio WebSocket integration for bring-your-own STT/TTS. Load this skill when building voice AI with custom speech processing, real-time audio analysis, or third-party STT/TTS engines.

---

## When to Use Media Streams vs ConversationRelay

| Criteria | Media Streams | ConversationRelay |
|----------|:------------:|:-----------------:|
| Audio access | Raw mulaw 8kHz frames | No audio — text in/out |
| STT/TTS | Bring your own | Built-in (Google, Polly) |
| Protocol complexity | High (binary audio) | Low (JSON text) |
| Latency control | Full | Twilio-managed |
| DTMF detection | Bidirectional only | Built-in |
| Interruption handling | Manual | Built-in |
| Custom audio processing | Yes (analysis, effects) | No |
| Time to prototype | Longer | Shorter |

**Use Media Streams when:** you need raw audio access, custom STT/TTS engines, real-time audio analysis (sentiment from tone, speaker diarization), or integration with platforms that expect audio input (Google Cloud Speech, AWS Transcribe, Azure Speech).

**Use ConversationRelay when:** you want text-based LLM integration with minimal audio plumbing. ConversationRelay handles STT, TTS, interruptions, and barge-in automatically.

---

## TwiML Setup

### Bidirectional Stream (`<Connect><Stream>`)

Bidirectional streams allow both receiving and sending audio. The `<Connect>` verb blocks subsequent TwiML until the stream ends.

```javascript
const twiml = new Twilio.twiml.VoiceResponse();

// Optional: start background recording before stream
const start = twiml.start();
start.recording({
  recordingStatusCallback: `https://${context.DOMAIN_NAME}/callbacks/call-status`,
  recordingStatusCallbackEvent: 'completed',
});

twiml.say({ voice: 'Polly.Amy' }, 'Connecting you to our assistant.');

const connect = twiml.connect();
connect.stream({
  url: 'wss://your-server.com/audio-stream',
  // Optional: pass custom parameters to the WebSocket
  // name: 'my-stream',
});

return callback(null, twiml);
```

### Stream Attributes

| Attribute | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `url` | string | Yes | WebSocket URL (`wss://`) to connect to |
| `name` | string | No | Friendly name for the stream |
| `track` | string | No | `inbound_track`, `outbound_track`, `both_tracks` (unidirectional only) |
| `statusCallback` | string | No | URL for stream lifecycle events |
| `statusCallbackMethod` | string | No | HTTP method for status callback |

### Custom Parameters

Pass context to your WebSocket handler via `<Parameter>`:

```javascript
const connect = twiml.connect();
const stream = connect.stream({
  url: 'wss://your-server.com/audio-stream',
});
stream.parameter({ name: 'callerNumber', value: event.From });
stream.parameter({ name: 'language', value: 'en-US' });
```

Parameters arrive in the `start` message's `customParameters` object.

### Unidirectional Stream (`<Start><Stream>`)

Unidirectional streams run in the background — subsequent TwiML continues executing.

```javascript
const twiml = new Twilio.twiml.VoiceResponse();

// Stream runs in background while call continues
const start = twiml.start();
start.stream({
  url: 'wss://your-server.com/listen',
  track: 'both_tracks',
});

// Call continues with normal TwiML
twiml.say('Your call is being analyzed.');
twiml.dial('+15559876543');

return callback(null, twiml);
```

---

## WebSocket Protocol

### Incoming Messages (Twilio → Your Server)

#### `connected` — WebSocket established
```json
{
  "event": "connected",
  "protocol": "Call",
  "version": "1.0.0"
}
```

#### `start` — Stream metadata (sent once)
```json
{
  "event": "start",
  "sequenceNumber": "1",
  "start": {
    "accountSid": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "streamSid": "MZxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "callSid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "tracks": ["inbound"],
    "mediaFormat": {
      "encoding": "audio/x-mulaw",
      "sampleRate": 8000,
      "channels": 1
    },
    "customParameters": {
      "callerNumber": "+15551234567"
    }
  },
  "streamSid": "MZxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

#### `media` — Audio data
```json
{
  "event": "media",
  "sequenceNumber": "3",
  "media": {
    "track": "inbound",
    "chunk": "1",
    "timestamp": "5",
    "payload": "<base64-encoded-mulaw-audio>"
  },
  "streamSid": "MZxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

- `track`: `"inbound"` (caller audio) or `"outbound"` (TTS/played audio)
- `timestamp`: Milliseconds from stream start
- `payload`: Base64-encoded mulaw audio, 8kHz, mono, no file headers

#### `dtmf` — Keypress detected (bidirectional only)
```json
{
  "event": "dtmf",
  "sequenceNumber": "5",
  "dtmf": {
    "track": "inbound_track",
    "digit": "1"
  },
  "streamSid": "MZxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

#### `mark` — Playback milestone reached (bidirectional only)
```json
{
  "event": "mark",
  "sequenceNumber": "4",
  "mark": {
    "name": "my-label"
  },
  "streamSid": "MZxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

Sent when audio preceding a sent mark has finished playing.

#### `stop` — Stream ended
```json
{
  "event": "stop",
  "sequenceNumber": "5",
  "stop": {
    "accountSid": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "callSid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  },
  "streamSid": "MZxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

### Outgoing Messages (Your Server → Twilio)

#### Send audio
```json
{
  "event": "media",
  "streamSid": "MZxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "media": {
    "payload": "<base64-encoded-mulaw-audio>"
  }
}
```

Audio must be mulaw-encoded at 8000 Hz, mono, base64-encoded, with no WAV/file headers.

#### Send mark (track playback position)
```json
{
  "event": "mark",
  "streamSid": "MZxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "mark": {
    "name": "utterance-end"
  }
}
```

#### Clear audio buffer (interrupt)
```json
{
  "event": "clear",
  "streamSid": "MZxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

Empties the queued audio buffer. Use this for barge-in/interruption.

---

## WebSocket Server Template (Node.js)

```javascript
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  let streamSid = null;

  ws.on('message', (data) => {
    const msg = JSON.parse(data);

    switch (msg.event) {
      case 'connected':
        console.log('Stream connected');
        break;

      case 'start':
        streamSid = msg.start.streamSid;
        console.log(`Stream started: ${streamSid}`);
        console.log(`Call SID: ${msg.start.callSid}`);
        console.log(`Custom params:`, msg.start.customParameters);
        break;

      case 'media':
        // msg.media.payload is base64 mulaw audio
        // Send to your STT engine here
        handleAudio(msg.media.payload, msg.media.timestamp);
        break;

      case 'dtmf':
        console.log(`DTMF: ${msg.dtmf.digit}`);
        break;

      case 'mark':
        console.log(`Mark reached: ${msg.mark.name}`);
        break;

      case 'stop':
        console.log('Stream stopped');
        break;
    }
  });

  ws.on('close', () => {
    console.log('WebSocket closed');
  });

  // Send audio back to the caller (bidirectional)
  function sendAudio(base64Audio) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        event: 'media',
        streamSid,
        media: { payload: base64Audio },
      }));
    }
  }

  // Interrupt current playback
  function clearAudio() {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        event: 'clear',
        streamSid,
      }));
    }
  }
});

server.listen(8080, () => console.log('Stream server on :8080'));
```

---

## Audio Encoding

### Format Specification

| Property | Value |
|----------|-------|
| Encoding | G.711 mu-law (mulaw) |
| Sample rate | 8000 Hz |
| Channels | 1 (mono) |
| Bit depth | 8 bits per sample |
| Container | None (raw samples, base64-encoded) |

### Converting Audio for Playback

To send audio back via bidirectional stream, convert to mulaw 8kHz first:

```bash
# Using ffmpeg
ffmpeg -i input.mp3 -ar 8000 -ac 1 -f mulaw output.raw

# Using sox
sox input.wav -r 8000 -c 1 -e mu-law -t raw output.raw
```

Then base64-encode the raw bytes before sending.

### Decoding Received Audio

```javascript
// Decode base64 payload to raw mulaw bytes
const mulawBuffer = Buffer.from(msg.media.payload, 'base64');

// Convert mulaw to PCM 16-bit for STT engines that expect linear PCM
function mulawToPcm16(mulawByte) {
  // Standard mu-law expansion table lookup
  // Most STT SDKs accept mulaw directly — check your provider first
}
```

---

## STT/TTS Integration Patterns

### Google Cloud Speech-to-Text

```javascript
const speech = require('@google-cloud/speech');
const client = new speech.SpeechClient();

// Create streaming recognition
const recognizeStream = client.streamingRecognize({
  config: {
    encoding: 'MULAW',
    sampleRateHertz: 8000,
    languageCode: 'en-US',
    enableAutomaticPunctuation: true,
  },
  interimResults: true,
});

// In media handler:
recognizeStream.write(Buffer.from(msg.media.payload, 'base64'));

// On transcript result:
recognizeStream.on('data', (data) => {
  const transcript = data.results[0]?.alternatives[0]?.transcript;
  if (data.results[0]?.isFinal) {
    // Send to LLM, get response, convert to audio, send back
  }
});
```

### Amazon Transcribe Streaming

```javascript
const { TranscribeStreamingClient, StartStreamTranscriptionCommand } = require('@aws-sdk/client-transcribe-streaming');

const client = new TranscribeStreamingClient({ region: 'us-east-1' });

// Amazon Transcribe expects PCM — convert mulaw to PCM first
// Or use a library like 'alawmulaw' for conversion
```

---

## Constraints and Limitations

### Bidirectional Streams (`<Connect><Stream>`)

| Constraint | Detail |
|-----------|--------|
| Streams per call | 1 |
| TwiML execution | Blocks — no subsequent verbs execute |
| Ending the stream | Only by ending the call (hangup or REST API update) |
| DTMF | Supported (inbound only) |
| Audio direction | Receive inbound, send outbound |

### Unidirectional Streams (`<Start><Stream>`)

| Constraint | Detail |
|-----------|--------|
| Streams per call | Up to 4 tracks |
| TwiML execution | Non-blocking — subsequent verbs continue |
| Ending the stream | `<Stop><Stream>` TwiML or REST API |
| DTMF | Not supported |
| Audio direction | Receive only (inbound, outbound, or both) |

### General Constraints

- WebSocket URL must use `wss://` (secure WebSocket)
- Media packets arrive approximately every 20ms (160 bytes of mulaw = 20ms of audio)
- No built-in reconnection — if WebSocket drops, stream ends
- Cannot mix `<Connect><Stream>` with `<Connect><ConversationRelay>` on the same call
- Firewall: allow TCP 443 from Twilio IP ranges

---

## Gotchas

### Media Streams ≠ ConversationRelay

A ConversationRelay WebSocket handler **cannot** be used with `<Stream>`. ConversationRelay sends structured JSON (`{ type: "prompt" }`); Media Streams sends raw audio frames (`{ event: "media" }`). Connecting the wrong handler type causes immediate disconnection with no error.

### `<Connect><Stream>` Blocks TwiML

Once `<Connect><Stream>` starts, no subsequent TwiML executes. Place `<Say>`, `<Start><Recording>`, or other setup verbs **before** `<Connect>`.

### Cannot Stop a Bidirectional Stream Without Ending the Call

There is no `<Stop><Stream>` for bidirectional streams. The only way to end a `<Connect><Stream>` is to end the call via REST API (`client.calls(callSid).update({ status: 'completed' })`) or the caller hanging up.

### No File Headers in Outbound Audio

Audio sent back must be raw mulaw samples, base64-encoded. Do NOT include WAV headers, MP3 frames, or any container format. The audio will play as noise/static if headers are present.

### 20ms Packet Cadence

Media arrives in ~20ms chunks (160 mulaw samples per packet). STT engines that expect continuous streams need buffering. Engines that expect discrete utterances need silence detection.

### Unidirectional Streams Cannot Send Audio

`<Start><Stream>` is receive-only. If you need to play audio back to the caller, use `<Connect><Stream>` (bidirectional) instead.

### Stream URL Must Be Absolute

Relative WebSocket URLs are not supported. Always use a full `wss://` URL.

### Recording + Stream Independence

`<Start><Recording>` and `<Start><Stream>` are independent background operations. Recording captures the full call audio; the stream provides a real-time copy. Both can run simultaneously.

---

## Reference Implementation

See `functions/voice/stream-connect.js` for the TwiML setup pattern used in this project.
