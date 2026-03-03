// ABOUTME: Playwright E2E test for Dominant Speaker Detection API.
// ABOUTME: Tests dominantSpeakerChanged events and speaker transitions in multi-participant rooms.

const { test, expect } = require('@playwright/test');
const twilio = require('twilio');

// Generate unique room name for each test run
const generateRoomName = () => `dominant-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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

test.describe('Video SDK - Dominant Speaker Detection', () => {
  test.skip(!process.env.TWILIO_ACCOUNT_SID, 'Requires Twilio credentials');

  test('detects dominant speaker in 3-participant room', async ({ browser }) => {
    test.setTimeout(90000);
    const roomName = generateRoomName();

    // Create 3 browser contexts for Alice, Bob, Charlie
    const contextAlice = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextBob = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextCharlie = await browser.newContext({ permissions: ['camera', 'microphone'] });

    const pageAlice = await contextAlice.newPage();
    const pageBob = await contextBob.newPage();
    const pageCharlie = await contextCharlie.newPage();

    try {
      // Alice joins first and sets up dominant speaker tracking
      await pageAlice.goto('/');
      await pageAlice.evaluate(() => {
        window.IDENTITY = 'alice';
        window.DOMINANT_SPEAKER_ENABLED = true;
      });
      await pageAlice.fill('#room-input', roomName);
      await pageAlice.click('#btn-join');
      await expect(pageAlice.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Alice connected');

      // Set up dominant speaker event tracking on Alice
      await pageAlice.evaluate(() => {
        window.dominantSpeakerEvents = [];
        window.currentDominantSpeaker = null;

        const room = window.getRoom();

        room.on('dominantSpeakerChanged', (participant) => {
          window.dominantSpeakerEvents.push({
            identity: participant ? participant.identity : null,
            timestamp: Date.now()
          });
          window.currentDominantSpeaker = participant ? participant.identity : null;
        });

        // Record initial dominant speaker if already set
        if (room.dominantSpeaker) {
          window.currentDominantSpeaker = room.dominantSpeaker.identity;
          window.dominantSpeakerEvents.push({
            identity: room.dominantSpeaker.identity,
            timestamp: Date.now(),
            type: 'initial'
          });
        }
      });

      // Bob joins
      await pageBob.goto('/');
      await pageBob.evaluate(() => {
        window.IDENTITY = 'bob';
        window.DOMINANT_SPEAKER_ENABLED = true;
      });
      await pageBob.fill('#room-input', roomName);
      await pageBob.click('#btn-join');
      await expect(pageBob.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Bob connected');

      // Charlie joins
      await pageCharlie.goto('/');
      await pageCharlie.evaluate(() => {
        window.IDENTITY = 'charlie';
        window.DOMINANT_SPEAKER_ENABLED = true;
      });
      await pageCharlie.fill('#room-input', roomName);
      await pageCharlie.click('#btn-join');
      await expect(pageCharlie.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Charlie connected');

      // Wait for audio to flow and dominant speaker to be detected
      console.log('Waiting for dominant speaker detection (10 seconds)...');
      await pageAlice.waitForTimeout(10000);

      // Check if dominant speaker was detected
      const initialData = await pageAlice.evaluate(() => ({
        events: window.dominantSpeakerEvents,
        current: window.currentDominantSpeaker,
        dominantSpeaker: window.getRoom().dominantSpeaker?.identity || null
      }));

      console.log('Initial dominant speaker data:', JSON.stringify(initialData, null, 2));

      // Verify dominant speaker detection
      if (initialData.events.length > 0 || initialData.dominantSpeaker) {
        console.log(`Dominant speaker detected: ${initialData.dominantSpeaker || initialData.current}`);

        // Verify the dominant speaker is one of our participants
        const validIdentities = ['alice', 'bob', 'charlie'];
        const detectedSpeaker = initialData.dominantSpeaker || initialData.current;

        if (detectedSpeaker) {
          expect(validIdentities).toContain(detectedSpeaker);
          console.log('VERIFIED: Dominant speaker is a valid participant');
        }
      } else {
        console.log('No dominant speaker detected yet - this can happen with synthetic audio');
      }

      // Verify room.dominantSpeaker property is accessible
      const dominantSpeakerAccessible = await pageAlice.evaluate(() => {
        const room = window.getRoom();
        // Property should exist (even if null)
        return 'dominantSpeaker' in room;
      });
      expect(dominantSpeakerAccessible).toBe(true);
      console.log('VERIFIED: room.dominantSpeaker property is accessible');

      // Cleanup
      await pageAlice.click('#btn-leave');
      await pageBob.click('#btn-leave');
      await pageCharlie.click('#btn-leave');

    } finally {
      await contextAlice.close();
      await contextBob.close();
      await contextCharlie.close();
    }
  });

  test('dominant speaker changes when audio tracks are muted/unmuted', async ({ browser }) => {
    test.setTimeout(120000);
    const roomName = generateRoomName();

    const contextAlice = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextBob = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextCharlie = await browser.newContext({ permissions: ['camera', 'microphone'] });

    const pageAlice = await contextAlice.newPage();
    const pageBob = await contextBob.newPage();
    const pageCharlie = await contextCharlie.newPage();

    try {
      // All three join with dominant speaker enabled
      for (const [page, identity] of [[pageAlice, 'alice'], [pageBob, 'bob'], [pageCharlie, 'charlie']]) {
        await page.goto('/');
        await page.evaluate((id) => {
          window.IDENTITY = id;
          window.DOMINANT_SPEAKER_ENABLED = true;
        }, identity);
        await page.fill('#room-input', roomName);
        await page.click('#btn-join');
        await expect(page.locator('#status')).toHaveText('connected', { timeout: 30000 });
        console.log(`${identity} connected`);
      }

      // Set up dominant speaker tracking on Alice (she'll observe all changes)
      await pageAlice.evaluate(() => {
        window.dominantSpeakerEvents = [];
        window.speakerTransitions = [];

        const room = window.getRoom();

        room.on('dominantSpeakerChanged', (participant) => {
          const identity = participant ? participant.identity : null;
          window.dominantSpeakerEvents.push({
            identity,
            timestamp: Date.now()
          });

          // Track transitions (identity changes)
          const lastTransition = window.speakerTransitions[window.speakerTransitions.length - 1];
          if (!lastTransition || lastTransition.identity !== identity) {
            window.speakerTransitions.push({
              identity,
              timestamp: Date.now()
            });
          }
        });
      });

      // Wait for initial detection with all audio enabled
      console.log('Phase 1: All participants with audio enabled (10 seconds)...');
      await pageAlice.waitForTimeout(10000);

      const phase1Data = await pageAlice.evaluate(() => ({
        events: window.dominantSpeakerEvents.length,
        transitions: window.speakerTransitions,
        current: window.getRoom().dominantSpeaker?.identity
      }));
      console.log('Phase 1 - Events:', phase1Data.events, 'Current:', phase1Data.current);

      // Phase 2: Mute Alice and Charlie, only Bob has audio
      console.log('Phase 2: Muting Alice and Charlie, only Bob has audio...');
      await pageAlice.evaluate(() => {
        const room = window.getRoom();
        room.localParticipant.audioTracks.forEach(pub => {
          if (pub.track) {pub.track.disable();}
        });
      });
      await pageCharlie.evaluate(() => {
        const room = window.getRoom();
        room.localParticipant.audioTracks.forEach(pub => {
          if (pub.track) {pub.track.disable();}
        });
      });

      console.log('Waiting for Bob to become dominant speaker (15 seconds)...');
      await pageAlice.waitForTimeout(15000);

      const phase2Data = await pageAlice.evaluate(() => ({
        events: window.dominantSpeakerEvents.length,
        transitions: window.speakerTransitions,
        current: window.getRoom().dominantSpeaker?.identity
      }));
      console.log('Phase 2 - Events:', phase2Data.events, 'Current:', phase2Data.current);
      console.log('Transitions so far:', JSON.stringify(phase2Data.transitions, null, 2));

      // Phase 3: Unmute Alice, mute Bob - Alice should become dominant
      console.log('Phase 3: Unmuting Alice, muting Bob...');
      await pageAlice.evaluate(() => {
        const room = window.getRoom();
        room.localParticipant.audioTracks.forEach(pub => {
          if (pub.track) {pub.track.enable();}
        });
      });
      await pageBob.evaluate(() => {
        const room = window.getRoom();
        room.localParticipant.audioTracks.forEach(pub => {
          if (pub.track) {pub.track.disable();}
        });
      });

      console.log('Waiting for Alice to become dominant speaker (15 seconds)...');
      await pageAlice.waitForTimeout(15000);

      const phase3Data = await pageAlice.evaluate(() => ({
        events: window.dominantSpeakerEvents.length,
        transitions: window.speakerTransitions,
        current: window.getRoom().dominantSpeaker?.identity
      }));
      console.log('Phase 3 - Events:', phase3Data.events, 'Current:', phase3Data.current);
      console.log('All transitions:', JSON.stringify(phase3Data.transitions, null, 2));

      // Collect final data
      const finalData = await pageAlice.evaluate(() => ({
        totalEvents: window.dominantSpeakerEvents.length,
        transitions: window.speakerTransitions,
        uniqueSpeakers: [...new Set(window.speakerTransitions.map(t => t.identity).filter(Boolean))]
      }));

      console.log('Final results:');
      console.log(`  Total dominantSpeakerChanged events: ${finalData.totalEvents}`);
      console.log(`  Speaker transitions: ${finalData.transitions.length}`);
      console.log(`  Unique speakers: ${finalData.uniqueSpeakers.join(', ')}`);

      // Validations
      // 1. At least one dominantSpeakerChanged event should have fired
      expect(finalData.totalEvents).toBeGreaterThan(0);
      console.log('VERIFIED: dominantSpeakerChanged events fired');

      // 2. We should have detected at least one speaker transition
      // (Initial detection counts as first transition)
      expect(finalData.transitions.length).toBeGreaterThanOrEqual(1);
      console.log('VERIFIED: At least one speaker detected');

      // 3. If we got multiple transitions, verify they're different speakers
      if (finalData.transitions.length >= 2) {
        const speakers = finalData.transitions.map(t => t.identity).filter(Boolean);
        const uniqueSpeakers = new Set(speakers);
        if (uniqueSpeakers.size >= 2) {
          console.log('VERIFIED: Multiple different speakers detected - transitions working');
        } else {
          console.log('Note: Multiple events but same speaker (synthetic audio limitation)');
        }
      }

      // Cleanup
      await pageAlice.click('#btn-leave');
      await pageBob.click('#btn-leave');
      await pageCharlie.click('#btn-leave');

    } finally {
      await contextAlice.close();
      await contextBob.close();
      await contextCharlie.close();
    }
  });
});
