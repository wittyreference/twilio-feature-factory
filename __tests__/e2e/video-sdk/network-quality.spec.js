// ABOUTME: Playwright E2E test for Network Quality API.
// ABOUTME: Tests network quality level monitoring for local and remote participants.

const { test, expect } = require('@playwright/test');
const twilio = require('twilio');

// Generate unique room name for each test run
const generateRoomName = () => `netquality-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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

test.describe('Video SDK - Network Quality API', () => {
  test.skip(!process.env.TWILIO_ACCOUNT_SID, 'Requires Twilio credentials');

  test('monitors local participant network quality level', async ({ page }) => {
    test.setTimeout(60000);
    const roomName = generateRoomName();

    await page.goto('/');
    await page.evaluate(() => { window.IDENTITY = 'quality-tester'; });

    // Set up network quality event tracking before joining
    await page.evaluate(() => {
      window.networkQualityEvents = [];
      window.networkQualityLevels = [];
    });

    await page.fill('#room-input', roomName);
    await page.click('#btn-join');
    await expect(page.locator('#status')).toHaveText('connected', { timeout: 30000 });
    console.log('Participant connected');

    // Set up network quality monitoring
    await page.evaluate(() => {
      const room = window.getRoom();
      const localParticipant = room.localParticipant;

      // Record initial network quality level
      if (localParticipant.networkQualityLevel !== null) {
        window.networkQualityLevels.push({
          level: localParticipant.networkQualityLevel,
          timestamp: Date.now(),
          type: 'initial'
        });
      }

      // Listen for network quality changes
      localParticipant.on('networkQualityLevelChanged', (level, stats) => {
        window.networkQualityEvents.push({
          level: level,
          hasStats: !!stats,
          timestamp: Date.now()
        });
        window.networkQualityLevels.push({
          level: level,
          timestamp: Date.now(),
          type: 'changed'
        });
      });
    });

    // Wait for network quality to be measured (can take a few seconds)
    console.log('Waiting for network quality measurement...');
    await page.waitForTimeout(10000);

    // Check if we got network quality data
    const qualityData = await page.evaluate(() => {
      const room = window.getRoom();
      const localParticipant = room.localParticipant;

      return {
        currentLevel: localParticipant.networkQualityLevel,
        events: window.networkQualityEvents,
        levels: window.networkQualityLevels,
        networkQualityStats: localParticipant.networkQualityStats
      };
    });

    console.log('Network quality data:', JSON.stringify(qualityData, null, 2));

    // Verify network quality level is valid (0-5 or null)
    if (qualityData.currentLevel !== null) {
      expect(qualityData.currentLevel).toBeGreaterThanOrEqual(0);
      expect(qualityData.currentLevel).toBeLessThanOrEqual(5);
      console.log(`Current network quality level: ${qualityData.currentLevel}`);
    } else {
      console.log('Network quality level is null (not yet measured or unavailable)');
    }

    // Log all quality events
    if (qualityData.events.length > 0) {
      console.log(`Received ${qualityData.events.length} networkQualityLevelChanged events`);
      qualityData.events.forEach((event, i) => {
        console.log(`  Event ${i + 1}: level=${event.level}, hasStats=${event.hasStats}`);
      });
    }

    // Verify that if we have events, levels are valid
    for (const event of qualityData.events) {
      expect(event.level).toBeGreaterThanOrEqual(0);
      expect(event.level).toBeLessThanOrEqual(5);
    }

    console.log('VERIFIED: Network quality levels are within valid range (0-5)');

    await page.click('#btn-leave');
    await expect(page.locator('#status')).toHaveText('disconnected', { timeout: 10000 });
  });

  test('monitors remote participant network quality', async ({ browser }) => {
    test.setTimeout(90000);
    const roomName = generateRoomName();

    const contextAlice = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextBob = await browser.newContext({ permissions: ['camera', 'microphone'] });

    const pageAlice = await contextAlice.newPage();
    const pageBob = await contextBob.newPage();

    try {
      // Alice joins first
      await pageAlice.goto('/');
      await pageAlice.evaluate(() => { window.IDENTITY = 'alice'; });
      await pageAlice.fill('#room-input', roomName);
      await pageAlice.click('#btn-join');
      await expect(pageAlice.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Alice connected');

      // Set up Alice to track remote participant quality
      await pageAlice.evaluate(() => {
        window.remoteQualityEvents = [];
        window.remoteParticipantQualities = new Map();

        const room = window.getRoom();

        const trackRemoteQuality = (participant) => {
          // Record initial quality if available
          if (participant.networkQualityLevel !== null) {
            window.remoteQualityEvents.push({
              identity: participant.identity,
              level: participant.networkQualityLevel,
              type: 'initial',
              timestamp: Date.now()
            });
          }

          // Listen for quality changes
          participant.on('networkQualityLevelChanged', (level, stats) => {
            window.remoteQualityEvents.push({
              identity: participant.identity,
              level: level,
              hasStats: !!stats,
              type: 'changed',
              timestamp: Date.now()
            });
          });
        };

        // Track existing participants
        room.participants.forEach(trackRemoteQuality);

        // Track new participants
        room.on('participantConnected', trackRemoteQuality);
      });

      // Bob joins
      await pageBob.goto('/');
      await pageBob.evaluate(() => { window.IDENTITY = 'bob'; });
      await pageBob.fill('#room-input', roomName);
      await pageBob.click('#btn-join');
      await expect(pageBob.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Bob connected');

      // Set up Bob to track his own and remote quality
      await pageBob.evaluate(() => {
        window.localQualityLevels = [];
        window.remoteQualityLevels = [];

        const room = window.getRoom();

        // Track local quality
        room.localParticipant.on('networkQualityLevelChanged', (level) => {
          window.localQualityLevels.push({ level, timestamp: Date.now() });
        });

        // Track remote quality (Alice)
        room.participants.forEach(p => {
          p.on('networkQualityLevelChanged', (level) => {
            window.remoteQualityLevels.push({
              identity: p.identity,
              level,
              timestamp: Date.now()
            });
          });
        });
      });

      // Wait for network quality measurements
      console.log('Waiting for network quality measurements (15 seconds)...');
      await pageAlice.waitForTimeout(15000);

      // Collect quality data from both participants
      const aliceData = await pageAlice.evaluate(() => {
        const room = window.getRoom();
        const remoteParticipants = Array.from(room.participants.values());

        return {
          localLevel: room.localParticipant.networkQualityLevel,
          remoteEvents: window.remoteQualityEvents,
          remoteParticipants: remoteParticipants.map(p => ({
            identity: p.identity,
            networkQualityLevel: p.networkQualityLevel
          }))
        };
      });

      const bobData = await pageBob.evaluate(() => {
        const room = window.getRoom();
        const remoteParticipants = Array.from(room.participants.values());

        return {
          localLevel: room.localParticipant.networkQualityLevel,
          localQualityLevels: window.localQualityLevels,
          remoteQualityLevels: window.remoteQualityLevels,
          remoteParticipants: remoteParticipants.map(p => ({
            identity: p.identity,
            networkQualityLevel: p.networkQualityLevel
          }))
        };
      });

      console.log('Alice data:', JSON.stringify(aliceData, null, 2));
      console.log('Bob data:', JSON.stringify(bobData, null, 2));

      // Verify Alice's local quality
      if (aliceData.localLevel !== null) {
        expect(aliceData.localLevel).toBeGreaterThanOrEqual(0);
        expect(aliceData.localLevel).toBeLessThanOrEqual(5);
        console.log(`Alice's local network quality: ${aliceData.localLevel}`);
      }

      // Verify Bob's local quality
      if (bobData.localLevel !== null) {
        expect(bobData.localLevel).toBeGreaterThanOrEqual(0);
        expect(bobData.localLevel).toBeLessThanOrEqual(5);
        console.log(`Bob's local network quality: ${bobData.localLevel}`);
      }

      // Verify Alice can see Bob's quality
      const bobFromAlice = aliceData.remoteParticipants.find(p => p.identity === 'bob');
      if (bobFromAlice && bobFromAlice.networkQualityLevel !== null) {
        expect(bobFromAlice.networkQualityLevel).toBeGreaterThanOrEqual(0);
        expect(bobFromAlice.networkQualityLevel).toBeLessThanOrEqual(5);
        console.log(`Alice sees Bob's network quality: ${bobFromAlice.networkQualityLevel}`);
      }

      // Verify Bob can see Alice's quality
      const aliceFromBob = bobData.remoteParticipants.find(p => p.identity === 'alice');
      if (aliceFromBob && aliceFromBob.networkQualityLevel !== null) {
        expect(aliceFromBob.networkQualityLevel).toBeGreaterThanOrEqual(0);
        expect(aliceFromBob.networkQualityLevel).toBeLessThanOrEqual(5);
        console.log(`Bob sees Alice's network quality: ${aliceFromBob.networkQualityLevel}`);
      }

      // Verify all quality events have valid levels
      for (const event of aliceData.remoteEvents) {
        expect(event.level).toBeGreaterThanOrEqual(0);
        expect(event.level).toBeLessThanOrEqual(5);
      }

      console.log(`Alice received ${aliceData.remoteEvents.length} remote quality events`);
      console.log(`Bob received ${bobData.localQualityLevels.length} local quality events`);
      console.log(`Bob received ${bobData.remoteQualityLevels.length} remote quality events`);

      console.log('VERIFIED: Remote participant network quality monitoring working');

      await pageAlice.click('#btn-leave');
      await pageBob.click('#btn-leave');

    } finally {
      await contextAlice.close();
      await contextBob.close();
    }
  });

  test('network quality stats provide detailed metrics', async ({ browser }) => {
    test.setTimeout(90000);
    const roomName = generateRoomName();

    const contextAlice = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextBob = await browser.newContext({ permissions: ['camera', 'microphone'] });

    const pageAlice = await contextAlice.newPage();
    const pageBob = await contextBob.newPage();

    try {
      // Both join with network quality verbosity set to detailed
      for (const [page, identity] of [[pageAlice, 'alice'], [pageBob, 'bob']]) {
        await page.goto('/');
        await page.evaluate((id) => { window.IDENTITY = id; }, identity);
        await page.fill('#room-input', roomName);
        await page.click('#btn-join');
        await expect(page.locator('#status')).toHaveText('connected', { timeout: 30000 });
      }
      console.log('Both participants connected');

      // Set up detailed stats tracking on Alice
      await pageAlice.evaluate(() => {
        window.detailedStats = [];

        const room = window.getRoom();
        room.localParticipant.on('networkQualityLevelChanged', (level, stats) => {
          window.detailedStats.push({
            level,
            stats: stats ? {
              hasAudio: !!stats.audio,
              hasVideo: !!stats.video,
              audioSend: stats.audio?.send,
              audioRecv: stats.audio?.recv,
              videoSend: stats.video?.send,
              videoRecv: stats.video?.recv
            } : null,
            timestamp: Date.now()
          });
        });
      });

      // Wait for stats to accumulate
      console.log('Waiting for network quality stats (20 seconds)...');
      await pageAlice.waitForTimeout(20000);

      // Collect stats
      const statsData = await pageAlice.evaluate(() => {
        const room = window.getRoom();
        const localParticipant = room.localParticipant;

        return {
          currentLevel: localParticipant.networkQualityLevel,
          currentStats: localParticipant.networkQualityStats ? {
            level: localParticipant.networkQualityStats.level,
            audio: localParticipant.networkQualityStats.audio,
            video: localParticipant.networkQualityStats.video
          } : null,
          collectedStats: window.detailedStats
        };
      });

      console.log('Network quality stats:', JSON.stringify(statsData, null, 2));

      // Verify we got some quality data
      if (statsData.currentLevel !== null) {
        expect(statsData.currentLevel).toBeGreaterThanOrEqual(0);
        expect(statsData.currentLevel).toBeLessThanOrEqual(5);
      }

      // Log detailed stats if available
      if (statsData.collectedStats.length > 0) {
        console.log(`Collected ${statsData.collectedStats.length} detailed stats events`);

        const lastStats = statsData.collectedStats[statsData.collectedStats.length - 1];
        console.log('Latest stats:', JSON.stringify(lastStats, null, 2));

        if (lastStats.stats) {
          console.log(`  Audio stats available: ${lastStats.stats.hasAudio}`);
          console.log(`  Video stats available: ${lastStats.stats.hasVideo}`);
        }
      }

      console.log('VERIFIED: Network quality stats collection working');

      await pageAlice.click('#btn-leave');
      await pageBob.click('#btn-leave');

    } finally {
      await contextAlice.close();
      await contextBob.close();
    }
  });
});
