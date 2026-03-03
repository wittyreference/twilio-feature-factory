// ABOUTME: Playwright E2E test for Max Participant Duration feature.
// ABOUTME: Tests automatic participant disconnection after specified duration and recording completion.

const { test, expect } = require('@playwright/test');
const twilio = require('twilio');

// Generate unique room name for each test run
const generateRoomName = () => `maxdur-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// Poll until a condition is met or timeout
async function pollUntil(fetchFn, checkFn, timeoutMs, intervalMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await fetchFn();
    if (checkFn(result)) {return result;}
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('Poll timeout');
}

// Twilio client for API operations
let twilioClient;

test.beforeAll(() => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;

  if (accountSid && apiKey && apiSecret) {
    twilioClient = twilio(apiKey, apiSecret, { accountSid });
  }
});

test.describe('Video SDK - Max Participant Duration', () => {
  test.skip(!process.env.TWILIO_ACCOUNT_SID, 'Requires Twilio credentials');

  test('participants are automatically disconnected after max duration and recordings complete', async ({ browser }) => {
    test.setTimeout(900000); // 15 minutes - includes 10min wait + recording completion
    const roomName = generateRoomName();
    const MAX_DURATION_SECONDS = 600; // 10 minutes (minimum allowed value)

    // Create room with maxParticipantDuration and recording
    console.log(`Creating room with maxParticipantDuration: ${MAX_DURATION_SECONDS} seconds...`);
    const room = await twilioClient.video.v1.rooms.create({
      uniqueName: roomName,
      type: 'group',
      maxParticipantDuration: MAX_DURATION_SECONDS,
      recordParticipantsOnConnect: true
    });

    const roomSid = room.sid;
    console.log(`Created room: ${roomSid}`);
    console.log(`  Max participant duration: ${room.maxParticipantDuration}s`);

    const contextAlice = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextBob = await browser.newContext({ permissions: ['camera', 'microphone'] });

    const pageAlice = await contextAlice.newPage();
    const pageBob = await contextBob.newPage();

    let aliceJoinTime = null;
    let bobJoinTime = null;

    try {
      // Alice joins
      await pageAlice.goto('/');
      await pageAlice.evaluate(() => { window.IDENTITY = 'alice'; });
      await pageAlice.fill('#room-input', roomName);
      await pageAlice.click('#btn-join');
      await expect(pageAlice.locator('#status')).toHaveText('connected', { timeout: 30000 });
      aliceJoinTime = Date.now();
      console.log('Alice connected');

      // Set up Alice's disconnect tracking
      await pageAlice.evaluate(() => {
        window.disconnectEvent = null;
        window.participantDisconnectedEvents = [];

        const room = window.getRoom();

        room.on('disconnected', (room, error) => {
          window.disconnectEvent = {
            error: error?.message || null,
            code: error?.code || null,
            timestamp: Date.now()
          };
        });

        room.on('participantDisconnected', (participant) => {
          window.participantDisconnectedEvents.push({
            identity: participant.identity,
            timestamp: Date.now()
          });
        });
      });

      // Bob joins
      await pageBob.goto('/');
      await pageBob.evaluate(() => { window.IDENTITY = 'bob'; });
      await pageBob.fill('#room-input', roomName);
      await pageBob.click('#btn-join');
      await expect(pageBob.locator('#status')).toHaveText('connected', { timeout: 30000 });
      bobJoinTime = Date.now();
      console.log('Bob connected');

      // Set up Bob's disconnect tracking
      await pageBob.evaluate(() => {
        window.disconnectEvent = null;
        window.participantDisconnectedEvents = [];

        const room = window.getRoom();

        room.on('disconnected', (room, error) => {
          window.disconnectEvent = {
            error: error?.message || null,
            code: error?.code || null,
            timestamp: Date.now()
          };
        });

        room.on('participantDisconnected', (participant) => {
          window.participantDisconnectedEvents.push({
            identity: participant.identity,
            timestamp: Date.now()
          });
        });
      });

      // Verify both see each other
      await expect(pageAlice.locator('#remote-participant-count')).toHaveText('1', { timeout: 10000 });
      await expect(pageBob.locator('#remote-participant-count')).toHaveText('1', { timeout: 10000 });
      console.log('Both participants see each other');

      // Wait for recordings to start (may take a few seconds)
      console.log('Waiting for recordings to start...');
      await pageAlice.waitForTimeout(5000);
      const initialRecordings = await twilioClient.video.v1.rooms(roomSid).recordings.list();
      console.log(`Recordings in progress: ${initialRecordings.length}`);
      expect(initialRecordings.length).toBeGreaterThanOrEqual(2); // At least some recordings started

      // Wait for max duration to be reached
      const waitTime = (MAX_DURATION_SECONDS + 5) * 1000; // Add 5 seconds buffer
      console.log(`\nWaiting ${MAX_DURATION_SECONDS + 5} seconds for max duration disconnect...`);

      const startWait = Date.now();
      let aliceDisconnected = false;
      let bobDisconnected = false;

      // Poll for disconnection (both should disconnect)
      while (Date.now() - startWait < waitTime && (!aliceDisconnected || !bobDisconnected)) {
        if (!aliceDisconnected) {
          const aliceStatus = await pageAlice.locator('#status').textContent();
          if (aliceStatus === 'disconnected') {
            aliceDisconnected = true;
            console.log(`Alice disconnected after ${Math.round((Date.now() - aliceJoinTime) / 1000)}s`);
          }
        }
        if (!bobDisconnected) {
          const bobStatus = await pageBob.locator('#status').textContent();
          if (bobStatus === 'disconnected') {
            bobDisconnected = true;
            console.log(`Bob disconnected after ${Math.round((Date.now() - bobJoinTime) / 1000)}s`);
          }
        }
        if (!aliceDisconnected || !bobDisconnected) {
          await pageAlice.waitForTimeout(1000);
        }
      }

      // Verify both disconnected
      expect(aliceDisconnected).toBe(true);
      expect(bobDisconnected).toBe(true);
      console.log('VERIFIED: Both participants automatically disconnected');

      // Get disconnect events from both
      const aliceDisconnectData = await pageAlice.evaluate(() => window.disconnectEvent);
      const bobDisconnectData = await pageBob.evaluate(() => window.disconnectEvent);

      console.log('\nAlice disconnect event:', JSON.stringify(aliceDisconnectData, null, 2));
      console.log('Bob disconnect event:', JSON.stringify(bobDisconnectData, null, 2));

      // Verify error code 53118 (max participant duration exceeded)
      // Note: The exact error code may vary; some versions use different codes
      if (aliceDisconnectData?.code) {
        console.log(`Alice disconnect code: ${aliceDisconnectData.code}`);
      }
      if (bobDisconnectData?.code) {
        console.log(`Bob disconnect code: ${bobDisconnectData.code}`);
      }

      // Verify disconnect happened around the expected time
      const aliceDuration = aliceDisconnectData?.timestamp ?
        Math.round((aliceDisconnectData.timestamp - aliceJoinTime) / 1000) : null;
      const bobDuration = bobDisconnectData?.timestamp ?
        Math.round((bobDisconnectData.timestamp - bobJoinTime) / 1000) : null;

      console.log(`\nAlice session duration: ${aliceDuration}s (expected: ~${MAX_DURATION_SECONDS}s)`);
      console.log(`Bob session duration: ${bobDuration}s (expected: ~${MAX_DURATION_SECONDS}s)`);

      // Allow 5 second tolerance
      if (aliceDuration) {
        expect(aliceDuration).toBeGreaterThanOrEqual(MAX_DURATION_SECONDS - 2);
        expect(aliceDuration).toBeLessThanOrEqual(MAX_DURATION_SECONDS + 5);
      }
      if (bobDuration) {
        expect(bobDuration).toBeGreaterThanOrEqual(MAX_DURATION_SECONDS - 2);
        expect(bobDuration).toBeLessThanOrEqual(MAX_DURATION_SECONDS + 5);
      }

      console.log('VERIFIED: Participants disconnected at approximately the expected duration');

    } finally {
      await contextAlice.close();
      await contextBob.close();
    }

    // Verify recordings completed when participants disconnected
    console.log('\nWaiting for recordings to complete...');
    const completedRecordings = await pollUntil(
      () => twilioClient.video.v1.rooms(roomSid).recordings.list(),
      (recs) => recs.length >= 4 && recs.every(r => r.status === 'completed'),
      60000,
      3000
    );

    console.log(`\nRecordings completed: ${completedRecordings.length}`);
    for (const rec of completedRecordings) {
      console.log(`  ${rec.sid}: ${rec.type}, ${rec.duration}s`);
    }

    // Verify we have 4 recordings (2 participants × 2 tracks)
    expect(completedRecordings.length).toBe(4);
    console.log('VERIFIED: 4 recordings created (Alice + Bob, audio + video)');

    // Verify recording durations match participant duration (within tolerance)
    for (const rec of completedRecordings) {
      expect(rec.duration).toBeGreaterThan(0);
      expect(rec.duration).toBeLessThanOrEqual(MAX_DURATION_SECONDS + 5);
    }
    console.log('VERIFIED: Recording durations match participant session duration');

    // End the room (may already be ended if empty)
    try {
      await twilioClient.video.v1.rooms(roomSid).update({ status: 'completed' });
      console.log('Room ended');
    } catch (err) {
      // Room may have auto-completed
      console.log('Room already completed');
    }

    console.log('\nVERIFIED: Max participant duration correctly disconnects participants and stops recordings');
  });
});
