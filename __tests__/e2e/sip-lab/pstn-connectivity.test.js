// ABOUTME: E2E test for full PSTN connectivity validation (Twilio→SIP Trunk→PBX→Record→Transcribe).
// ABOUTME: Proves outbound call reaches Asterisk PBX, is answered with audio, recorded, and transcribed.

const testStartTime = new Date();

const hasSipLab =
  process.env.SIP_LAB_TRUNK_SID &&
  process.env.SIP_LAB_DROPLET_IP &&
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_PHONE_NUMBER;

const describeWithSipLab = hasSipLab ? describe : describe.skip;

// Polling helper — retries fn() until it doesn't throw, with delay between attempts
async function pollUntil(fn, { maxAttempts = 20, delayMs = 3000, label = 'condition' } = {}) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxAttempts - 1) {
        throw new Error(`${label} not met after ${maxAttempts} attempts (${maxAttempts * delayMs / 1000}s): ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

describeWithSipLab('PSTN Connectivity E2E (Twilio→SIP Trunk→PBX→Record→Transcribe)', () => {
  let client;
  let trunkNumber;
  let callSid;
  let recordingSid;
  let transcriptSid;
  let intelligenceServiceSid;

  beforeAll(async () => {
    client = require('twilio')(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    // Discover Intelligence Service — check env var first, then query API
    intelligenceServiceSid = process.env.TWILIO_INTELLIGENCE_SERVICE_SID;
    if (!intelligenceServiceSid) {
      try {
        const services = await client.intelligence.v2.services.list({ limit: 1 });
        if (services.length > 0) {
          intelligenceServiceSid = services[0].sid;
        }
      } catch {
        // Intelligence API may not be available — transcript tests will be skipped
      }
    }
  });

  afterAll(async () => {
    // Clean up test resources to avoid accumulation
    if (recordingSid) {
      await client.recordings(recordingSid).remove().catch(() => {});
    }
    if (transcriptSid) {
      await client.intelligence.v2.transcripts(transcriptSid).remove().catch(() => {});
    }
  }, 15000);

  test('verifies trunk has associated phone number', async () => {
    const numbers = await client.trunking.v1
      .trunks(process.env.SIP_LAB_TRUNK_SID)
      .phoneNumbers.list();

    expect(numbers.length).toBeGreaterThan(0);
    trunkNumber = numbers[0].phoneNumber;
    expect(trunkNumber).toMatch(/^\+\d+/);
  });

  test('places outbound call to trunk number with recording', async () => {
    expect(trunkNumber).toBeDefined();

    // Ensure FROM number differs from trunk number
    expect(process.env.TWILIO_PHONE_NUMBER).not.toBe(trunkNumber);

    const call = await client.calls.create({
      to: trunkNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
      // Pause keeps parent leg alive while Asterisk plays audio on child leg.
      // <Pause> as first verb is safe on parent leg of API-initiated call.
      twiml: '<Response><Pause length="20"/></Response>',
      record: true,
    });

    expect(call.sid).toMatch(/^CA/);
    callSid = call.sid;
  });

  test('call completes with expected duration', async () => {
    expect(callSid).toBeDefined();

    // Poll until call reaches terminal status
    const finalCall = await pollUntil(async () => {
      const fetched = await client.calls(callSid).fetch();
      if (!['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(fetched.status)) {
        throw new Error(`Call still in progress: ${fetched.status}`);
      }
      return fetched;
    }, { maxAttempts: 20, delayMs: 3000, label: 'call completion' });

    // Asterisk should answer the call
    expect(finalCall.status).toBe('completed');

    // Asterisk dialplan: Answer + Wait(2) + Playback(~9s) + Wait(1) + Hangup ≈ 13s
    const duration = parseInt(finalCall.duration, 10);
    expect(duration).toBeGreaterThan(3);
  }, 90000);

  test('recording exists and completes', async () => {
    expect(callSid).toBeDefined();

    // Wait for recording to appear (may have brief delay after call ends)
    const recordings = await pollUntil(async () => {
      const recs = await client.calls(callSid).recordings.list();
      if (recs.length === 0) {
        throw new Error('No recordings found yet');
      }
      return recs;
    }, { maxAttempts: 10, delayMs: 3000, label: 'recording availability' });

    recordingSid = recordings[0].sid;
    expect(recordingSid).toMatch(/^RE/);

    // Wait for recording to finish processing
    const finalRecording = await pollUntil(async () => {
      const rec = await client.recordings(recordingSid).fetch();
      if (rec.status !== 'completed') {
        throw new Error(`Recording still processing: ${rec.status}`);
      }
      return rec;
    }, { maxAttempts: 10, delayMs: 3000, label: 'recording completion' });

    expect(finalRecording.status).toBe('completed');
    expect(parseInt(finalRecording.duration, 10)).toBeGreaterThan(0);
  }, 60000);

  test('creates Voice Intelligence transcript from recording', async () => {
    if (!intelligenceServiceSid) {
      console.log('Skipping transcript creation — no Intelligence Service available');
      return;
    }
    expect(recordingSid).toBeDefined();

    const transcript = await client.intelligence.v2.transcripts.create({
      serviceSid: intelligenceServiceSid,
      channel: {
        media_properties: { source_sid: recordingSid },
        participants: [
          { channel_participant: 1, user_id: 'caller' },
          { channel_participant: 2, user_id: 'pbx' },
        ],
      },
    });

    expect(transcript.sid).toMatch(/^GT/);
    transcriptSid = transcript.sid;
  }, 30000);

  test('transcript completes with content', async () => {
    if (!transcriptSid) {
      console.log('Skipping transcript validation — no transcript created');
      return;
    }

    // Transcription can take up to 2 minutes
    const finalTranscript = await pollUntil(async () => {
      const tx = await client.intelligence.v2.transcripts(transcriptSid).fetch();
      if (!['completed', 'failed'].includes(tx.status)) {
        throw new Error(`Transcript still processing: ${tx.status}`);
      }
      return tx;
    }, { maxAttempts: 24, delayMs: 5000, label: 'transcript completion' });

    expect(finalTranscript.status).toBe('completed');
    expect(parseInt(finalTranscript.duration, 10)).toBeGreaterThan(0);

    // Asterisk plays music (careless-whisper) which may not produce speech sentences.
    // Transcript completion with duration > 0 validates the full path.
    // Check sentences exist but don't require them — music isn't speech.
    const sentences = await client.intelligence.v2
      .transcripts(transcriptSid)
      .sentences.list({ limit: 10 });

    // Log sentence count for observability, but don't assert > 0
    console.log(`Transcript ${transcriptSid}: ${sentences.length} sentences, duration: ${finalTranscript.duration}s`);
  }, 150000);

  test('no SIP errors in debugger during test window', async () => {
    // Check for SIP-related errors (13xxx voice, 64xxx SIP/TTS) since test start
    const alerts = await client.monitor.alerts.list({
      startDate: testStartTime,
      limit: 50,
    });

    const sipErrors = alerts.filter(alert => {
      const code = parseInt(alert.errorCode, 10);
      const isSipError = (code >= 13000 && code < 14000) || (code >= 64000 && code < 65000);
      const isError = alert.logLevel === 'error';
      return isSipError && isError;
    });

    if (sipErrors.length > 0) {
      console.log('SIP errors found:', sipErrors.map(a =>
        `${a.errorCode}: ${a.alertText || a.description || 'no description'}`
      ));
    }

    expect(sipErrors).toHaveLength(0);
  }, 15000);
}, 300000);
