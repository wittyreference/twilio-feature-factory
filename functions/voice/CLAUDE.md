# Voice Functions Context

This directory contains Twilio Voice API functions for handling phone calls.

## TwiML Voice Verbs

### Common Verbs
- `<Say>` - Text-to-speech output
- `<Play>` - Play audio file
- `<Gather>` - Collect DTMF or speech input
- `<Dial>` - Connect to another party
- `<Record>` - Record caller audio
- `<Conference>` - Join a conference call
- `<Hangup>` - End the call
- `<Redirect>` - Transfer to another TwiML endpoint
- `<Pause>` - Add silence

### Say Verb Options
```javascript
twiml.say({
  voice: 'Polly.Amy',      // Amazon Polly voice
  language: 'en-GB',       // Language code
  loop: 1                  // Number of times to repeat
}, 'Your message here');
```

### Gather Verb Options
```javascript
twiml.gather({
  input: 'dtmf speech',    // Input types to accept
  timeout: 5,              // Seconds to wait for input
  numDigits: 4,            // Expected DTMF digits
  finishOnKey: '#',        // Key to finish input
  action: '/next-handler', // URL to POST results
  method: 'POST',          // HTTP method
  speechTimeout: 'auto',   // Auto-detect end of speech
  hints: 'yes, no, help'   // Speech recognition hints
});
```

### Dial Verb Options
```javascript
twiml.dial({
  callerId: '+1234567890', // Caller ID to display
  timeout: 30,             // Ring timeout in seconds
  action: '/dial-complete',// Callback URL
  record: 'record-from-answer' // Recording option
}).number('+1987654321');
```

## Voice Webhook Parameters

When Twilio makes a request to your voice webhook, these parameters are included:

| Parameter | Description |
|-----------|-------------|
| `CallSid` | Unique identifier for the call |
| `AccountSid` | Your Twilio Account SID |
| `From` | Caller's phone number (E.164) |
| `To` | Called phone number (E.164) |
| `CallStatus` | Current call status |
| `Direction` | `inbound` or `outbound-api` |
| `CallerName` | Caller name (if available) |
| `FromCity` | Caller's city |
| `FromState` | Caller's state |
| `FromCountry` | Caller's country |

### Gather Callback Parameters
| Parameter | Description |
|-----------|-------------|
| `Digits` | DTMF digits pressed |
| `SpeechResult` | Transcribed speech |
| `Confidence` | Speech recognition confidence (0-1) |

## Common Patterns

### IVR Menu
```javascript
const twiml = new Twilio.twiml.VoiceResponse();
twiml.say('Press 1 for sales, 2 for support.');
twiml.gather({
  numDigits: 1,
  action: '/ivr-handler'
});
twiml.redirect('/voice/incoming-call'); // No input, restart
```

### Call Forwarding
```javascript
const twiml = new Twilio.twiml.VoiceResponse();
twiml.dial({
  callerId: event.To,
  timeout: 20
}).number('+1234567890');
twiml.say('The person you called is unavailable.');
```

### Voicemail
```javascript
const twiml = new Twilio.twiml.VoiceResponse();
twiml.say('Please leave a message after the beep.');
twiml.record({
  maxLength: 60,
  action: '/recording-complete',
  transcribe: true,
  transcribeCallback: '/transcription-ready'
});
```

### Conference via REST API (Preferred)
Use the Conferences Participants API for programmatic control:

```javascript
// Create conference by adding first participant
const participant = await client.conferences('my-conference')
  .participants
  .create({
    from: context.TWILIO_PHONE_NUMBER,
    to: participantNumber,
    timeout: 30,           // Ring timeout
    timeLimit: 600,        // Max call duration (prevent runaway)
    startConferenceOnEnter: true,
    endConferenceOnExit: false,
    muted: false,
    beep: true
  });

// Add additional participants
await client.conferences('my-conference')
  .participants
  .create({
    from: context.TWILIO_PHONE_NUMBER,
    to: anotherParticipant,
    timeout: 30,
    timeLimit: 600
  });

// End conference
await client.conferences(conferenceSid)
  .update({ status: 'completed' });
```

### Conference Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `startConferenceOnEnter` | boolean | true | Start when participant joins |
| `endConferenceOnExit` | boolean | false | End when participant leaves (moderator) |
| `muted` | boolean | false | Join muted |
| `beep` | boolean | true | Play beep on join/leave |
| `timeout` | number | 30 | Ring timeout in seconds |
| `timeLimit` | number | 14400 | Max call duration in seconds |

### Finding Conferences by Name
```javascript
// List in-progress conferences by friendly name
const conferences = await client.conferences.list({
  friendlyName: 'my-conference',
  status: 'in-progress',
  limit: 1
});

if (conferences.length > 0) {
  const conference = conferences[0];
  console.log(`SID: ${conference.sid}`);
}
```

## TwiML Control Model

**Critical**: In almost all cases, only ONE TwiML document controls a call at any given time.

### Exception: Background Operations

Some TwiML verbs start background processes that continue running even after the call moves to subsequent TwiML documents:

- **`<Start><Stream>`** - Media streaming continues in the background
- **`<Start><Recording>`** - Recording continues until explicitly stopped
- **`<Start><Siprec>`** - SIPREC streaming continues in the background

These operations "fork off" and run concurrently with whatever TwiML executes next. The call can proceed through multiple TwiML documents while the stream/recording remains active.

```javascript
// Recording starts and continues through subsequent TwiML
const start = twiml.start();
start.recording({
  recordingStatusCallback: '/recording-complete',
  recordingStatusCallbackEvent: 'completed',
});
twiml.say('This is being recorded...');
twiml.redirect('/next-handler'); // Recording continues!
```

### Key Implications

1. **Updating participant TwiML exits current state**: If a participant is in a conference and you update their call with new TwiML, they immediately exit the conference and execute the new TwiML.

2. **Conference teardown risk**: If the exiting participant had `endConferenceOnExit=true`, the entire conference tears down - appearing as a "dropped call" to other participants.

3. **Call transfer in conference context**: "Transfer" means adding a new participant to the existing conference, NOT replacing TwiML. The original parties stay in the conference.

### Safe Conference Transfer Pattern

```javascript
// "Transfer" a call by adding a new party to the conference
// Original caller and agent stay in conference with the new party

// 1. Agent is on call with customer in conference "support-12345"
// 2. Agent wants to bring in specialist

// Add specialist to existing conference (they join, nobody leaves)
await client.conferences('support-12345')
  .participants
  .create({
    from: context.TWILIO_PHONE_NUMBER,
    to: specialistNumber,
    startConferenceOnEnter: true,  // Start immediately
    endConferenceOnExit: false     // Don't end when they leave
  });

// 3. All three parties now in conference
// 4. Agent can drop off by having their participant removed:
await client.conferences('support-12345')
  .participants(agentCallSid)
  .update({ status: 'completed' });
```

### Dangerous Pattern (Avoid)

```javascript
// DON'T: Update participant with new TwiML - exits them from conference
await client.calls(participantCallSid)
  .update({
    twiml: '<Response><Dial>+15551234567</Dial></Response>'
  });
// This removes them from conference and may tear it down!
```

## File Naming Conventions

- `*.js` - Public endpoints (no signature validation)
- `*.protected.js` - Protected endpoints (require valid Twilio signature)
- `*.private.js` - Private functions (not accessible via HTTP)

## Testing Voice Functions

Tests should use real Twilio APIs. Test TwiML generation by:
1. Calling the handler with test context/event
2. Verifying the TwiML string contains expected elements
3. For integration tests, use Twilio's API to make test calls
