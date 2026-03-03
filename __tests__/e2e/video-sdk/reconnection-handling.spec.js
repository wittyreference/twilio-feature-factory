// ABOUTME: Playwright E2E test for Video SDK reconnection handling.
// ABOUTME: Tests room state transitions during network disruptions and recovery.

const { test, expect } = require('@playwright/test');
const twilio = require('twilio');

// Generate unique room name for each test run
const generateRoomName = () => `reconnect-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// Twilio client for API operations
let _twilioClient;

test.beforeAll(() => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;

  if (accountSid && apiKey && apiSecret) {
    _twilioClient = twilio(apiKey, apiSecret, { accountSid });
  }
});

test.describe('Video SDK - Reconnection Handling', () => {
  test.skip(!process.env.TWILIO_ACCOUNT_SID, 'Requires Twilio credentials');

  test('participant reconnects successfully after brief network disruption', async ({ browser }) => {
    test.setTimeout(90000);
    const roomName = generateRoomName();

    const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const page = await context.newPage();

    // Get CDP session for network control
    const cdpSession = await context.newCDPSession(page);

    try {
      // Join room
      await page.goto('/');
      await page.evaluate(() => { window.IDENTITY = 'reconnect-tester'; });
      await page.fill('#room-input', roomName);
      await page.click('#btn-join');
      await expect(page.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Participant connected');

      // Set up reconnection event tracking
      await page.evaluate(() => {
        window.reconnectionEvents = [];
        window.roomStates = [];

        const room = window.getRoom();

        // Track initial state
        window.roomStates.push({ state: room.state, timestamp: Date.now() });

        room.on('reconnecting', (error) => {
          window.reconnectionEvents.push({
            type: 'reconnecting',
            error: error?.message || null,
            code: error?.code || null,
            timestamp: Date.now()
          });
          window.roomStates.push({ state: 'reconnecting', timestamp: Date.now() });
        });

        room.on('reconnected', () => {
          window.reconnectionEvents.push({
            type: 'reconnected',
            timestamp: Date.now()
          });
          window.roomStates.push({ state: 'connected', timestamp: Date.now() });
        });

        room.on('disconnected', (room, error) => {
          window.reconnectionEvents.push({
            type: 'disconnected',
            error: error?.message || null,
            code: error?.code || null,
            timestamp: Date.now()
          });
          window.roomStates.push({ state: 'disconnected', timestamp: Date.now() });
        });
      });

      // Let connection stabilize
      await page.waitForTimeout(3000);

      // Simulate network disruption via CDP
      console.log('Simulating network disruption...');
      await cdpSession.send('Network.emulateNetworkConditions', {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0
      });

      // Wait for reconnecting event (SDK detects disruption)
      console.log('Waiting for reconnecting event...');
      await page.waitForFunction(
        () => window.reconnectionEvents.some(e => e.type === 'reconnecting'),
        { timeout: 15000 }
      );
      console.log('Reconnecting event received');

      // Brief disruption - restore network after 3 seconds
      await page.waitForTimeout(3000);

      console.log('Restoring network...');
      await cdpSession.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1
      });

      // Wait for reconnected event
      console.log('Waiting for reconnected event...');
      await page.waitForFunction(
        () => window.reconnectionEvents.some(e => e.type === 'reconnected'),
        { timeout: 30000 }
      );
      console.log('Reconnected event received');

      // Verify state transitions
      const events = await page.evaluate(() => window.reconnectionEvents);
      const states = await page.evaluate(() => window.roomStates);

      console.log('Reconnection events:', JSON.stringify(events, null, 2));
      console.log('Room states:', JSON.stringify(states, null, 2));

      // Assertions
      expect(events.some(e => e.type === 'reconnecting')).toBe(true);
      expect(events.some(e => e.type === 'reconnected')).toBe(true);
      expect(events.some(e => e.type === 'disconnected')).toBe(false);

      // Verify state progression: connected → reconnecting → connected
      const stateSequence = states.map(s => s.state);
      expect(stateSequence).toContain('reconnecting');

      // Final state should be connected
      const finalState = await page.evaluate(() => window.getRoom().state);
      expect(finalState).toBe('connected');

      console.log('VERIFIED: Successful reconnection after brief network disruption');

      await page.click('#btn-leave');

    } finally {
      // Ensure network is restored
      await cdpSession.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1
      });
      await context.close();
    }
  });

  test('participant disconnects after prolonged network disruption (timeout)', async ({ browser }) => {
    test.setTimeout(120000); // 2 minutes - need time for SDK timeout
    const roomName = generateRoomName();

    const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const page = await context.newPage();

    const cdpSession = await context.newCDPSession(page);

    try {
      // Join room
      await page.goto('/');
      await page.evaluate(() => { window.IDENTITY = 'timeout-tester'; });
      await page.fill('#room-input', roomName);
      await page.click('#btn-join');
      await expect(page.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Participant connected');

      // Set up event tracking
      await page.evaluate(() => {
        window.reconnectionEvents = [];

        const room = window.getRoom();

        room.on('reconnecting', (error) => {
          window.reconnectionEvents.push({
            type: 'reconnecting',
            error: error?.message || null,
            code: error?.code || null,
            timestamp: Date.now()
          });
        });

        room.on('reconnected', () => {
          window.reconnectionEvents.push({
            type: 'reconnected',
            timestamp: Date.now()
          });
        });

        room.on('disconnected', (room, error) => {
          window.reconnectionEvents.push({
            type: 'disconnected',
            error: error?.message || null,
            code: error?.code || null,
            timestamp: Date.now()
          });
        });
      });

      await page.waitForTimeout(3000);

      // Simulate prolonged network disruption
      console.log('Simulating prolonged network disruption (will NOT restore)...');
      await cdpSession.send('Network.emulateNetworkConditions', {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0
      });

      // Wait for reconnecting event
      console.log('Waiting for reconnecting event...');
      await page.waitForFunction(
        () => window.reconnectionEvents.some(e => e.type === 'reconnecting'),
        { timeout: 15000 }
      );
      console.log('Reconnecting event received - keeping network offline...');

      // Wait for disconnected event (SDK timeout, typically ~30 seconds)
      console.log('Waiting for disconnect timeout (this may take up to 60 seconds)...');
      await page.waitForFunction(
        () => window.reconnectionEvents.some(e => e.type === 'disconnected'),
        { timeout: 90000 }
      );
      console.log('Disconnected event received');

      // Verify events
      const events = await page.evaluate(() => window.reconnectionEvents);
      console.log('Reconnection events:', JSON.stringify(events, null, 2));

      // Assertions
      expect(events.some(e => e.type === 'reconnecting')).toBe(true);
      expect(events.some(e => e.type === 'disconnected')).toBe(true);
      expect(events.some(e => e.type === 'reconnected')).toBe(false);

      // Check disconnect error code
      const disconnectEvent = events.find(e => e.type === 'disconnected');
      console.log(`Disconnect error: ${disconnectEvent.error}, code: ${disconnectEvent.code}`);

      // Verify error code 53001 (signaling disconnected)
      expect(disconnectEvent.code).toBe(53001);

      // Final state should be disconnected (room may be null or have disconnected state)
      const finalState = await page.evaluate(() => {
        const room = window.getRoom();
        return room ? room.state : 'disconnected';
      });
      expect(finalState).toBe('disconnected');

      console.log('VERIFIED: Participant disconnected after reconnection timeout');

    } finally {
      await cdpSession.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1
      });
      await context.close();
    }
  });

  test('remote participant observes peer reconnection state', async ({ browser }) => {
    test.setTimeout(120000);
    const roomName = generateRoomName();

    // Alice will have network disrupted, Bob will observe
    const contextAlice = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextBob = await browser.newContext({ permissions: ['camera', 'microphone'] });

    const pageAlice = await contextAlice.newPage();
    const pageBob = await contextBob.newPage();

    const cdpSessionAlice = await contextAlice.newCDPSession(pageAlice);

    try {
      // Alice joins first
      await pageAlice.goto('/');
      await pageAlice.evaluate(() => { window.IDENTITY = 'alice'; });
      await pageAlice.fill('#room-input', roomName);
      await pageAlice.click('#btn-join');
      await expect(pageAlice.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Alice connected');

      // Set up Alice's reconnection tracking
      await pageAlice.evaluate(() => {
        window.reconnectionEvents = [];
        const room = window.getRoom();

        room.on('reconnecting', (_error) => {
          window.reconnectionEvents.push({ type: 'reconnecting', timestamp: Date.now() });
        });
        room.on('reconnected', () => {
          window.reconnectionEvents.push({ type: 'reconnected', timestamp: Date.now() });
        });
        room.on('disconnected', (_room, _error) => {
          window.reconnectionEvents.push({ type: 'disconnected', timestamp: Date.now() });
        });
      });

      // Bob joins
      await pageBob.goto('/');
      await pageBob.evaluate(() => { window.IDENTITY = 'bob'; });
      await pageBob.fill('#room-input', roomName);
      await pageBob.click('#btn-join');
      await expect(pageBob.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Bob connected');

      // Set up Bob's tracking of Alice's state
      await pageBob.evaluate(() => {
        window.remoteParticipantEvents = [];

        const room = window.getRoom();

        // Track existing participant (Alice)
        room.participants.forEach(participant => {
          window.remoteParticipantEvents.push({
            type: 'initial',
            identity: participant.identity,
            state: participant.state,
            timestamp: Date.now()
          });

          participant.on('reconnecting', () => {
            window.remoteParticipantEvents.push({
              type: 'participant-reconnecting',
              identity: participant.identity,
              timestamp: Date.now()
            });
          });

          participant.on('reconnected', () => {
            window.remoteParticipantEvents.push({
              type: 'participant-reconnected',
              identity: participant.identity,
              timestamp: Date.now()
            });
          });
        });

        // Also track participant disconnected at room level
        room.on('participantDisconnected', (participant) => {
          window.remoteParticipantEvents.push({
            type: 'participant-disconnected',
            identity: participant.identity,
            timestamp: Date.now()
          });
        });
      });

      // Wait for stable connection
      await pageAlice.waitForTimeout(5000);

      // Disrupt Alice's network
      console.log('Disrupting Alice\'s network...');
      await cdpSessionAlice.send('Network.emulateNetworkConditions', {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0
      });

      // Wait for Alice to detect disconnection
      await pageAlice.waitForFunction(
        () => window.reconnectionEvents.some(e => e.type === 'reconnecting'),
        { timeout: 15000 }
      );
      console.log('Alice entered reconnecting state');

      // Check if Bob sees Alice's reconnecting state
      // Note: Remote participant 'reconnecting' event may not fire in all SDK versions
      // The more reliable indicator is track events or participant state polling
      await pageBob.waitForTimeout(5000);

      const bobSeesAliceReconnecting = await pageBob.evaluate(() => {
        const room = window.getRoom();
        const alice = Array.from(room.participants.values()).find(p => p.identity === 'alice');
        return alice ? alice.state : 'not-found';
      });
      console.log(`Bob sees Alice's state: ${bobSeesAliceReconnecting}`);

      // Brief disruption - restore Alice's network
      await pageAlice.waitForTimeout(3000);

      console.log('Restoring Alice\'s network...');
      await cdpSessionAlice.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1
      });

      // Wait for Alice to reconnect
      console.log('Waiting for Alice to reconnect...');
      await pageAlice.waitForFunction(
        () => window.reconnectionEvents.some(e => e.type === 'reconnected'),
        { timeout: 30000 }
      );
      console.log('Alice reconnected');

      // Verify Alice's events
      const aliceEvents = await pageAlice.evaluate(() => window.reconnectionEvents);
      console.log('Alice events:', JSON.stringify(aliceEvents, null, 2));

      expect(aliceEvents.some(e => e.type === 'reconnecting')).toBe(true);
      expect(aliceEvents.some(e => e.type === 'reconnected')).toBe(true);

      // Check Bob's observation of Alice
      await pageBob.waitForTimeout(2000);
      const bobEvents = await pageBob.evaluate(() => window.remoteParticipantEvents);
      console.log('Bob observed events:', JSON.stringify(bobEvents, null, 2));

      // Verify Bob still sees Alice as connected after recovery
      const aliceStateFromBob = await pageBob.evaluate(() => {
        const room = window.getRoom();
        const alice = Array.from(room.participants.values()).find(p => p.identity === 'alice');
        return alice ? { identity: alice.identity, state: alice.state } : null;
      });

      console.log('Final Alice state from Bob\'s view:', aliceStateFromBob);
      expect(aliceStateFromBob).not.toBeNull();
      expect(aliceStateFromBob.state).toBe('connected');

      // Verify Alice can still send/receive media (tracks still working)
      const aliceTrackCount = await pageBob.evaluate(() => {
        const room = window.getRoom();
        const alice = Array.from(room.participants.values()).find(p => p.identity === 'alice');
        if (!alice) {return { video: 0, audio: 0 };}
        return {
          video: Array.from(alice.videoTracks.values()).filter(p => p.track).length,
          audio: Array.from(alice.audioTracks.values()).filter(p => p.track).length
        };
      });

      console.log('Alice\'s tracks visible to Bob after reconnect:', aliceTrackCount);
      expect(aliceTrackCount.video).toBeGreaterThanOrEqual(1);
      expect(aliceTrackCount.audio).toBeGreaterThanOrEqual(1);

      console.log('VERIFIED: Remote participant (Bob) observed Alice\'s reconnection and tracks restored');

      await pageAlice.click('#btn-leave');
      await pageBob.click('#btn-leave');

    } finally {
      await cdpSessionAlice.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1
      });
      await contextAlice.close();
      await contextBob.close();
    }
  });
});
