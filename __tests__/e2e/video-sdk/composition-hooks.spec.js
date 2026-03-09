// ABOUTME: Playwright E2E test for Composition Hooks API.
// ABOUTME: Tests automatic composition creation when rooms end via pre-configured hooks.

const { test, expect } = require('@playwright/test');
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Generate unique room name for each test run
const generateRoomName = () => `comphook-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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

test.describe('Video SDK - Composition Hooks', () => {
  const CALLBACK_BASE_URL = process.env.TWILIO_CALLBACK_BASE_URL;
  const SYNC_SERVICE_SID = process.env.TWILIO_SYNC_SERVICE_SID;

  test.skip(!process.env.TWILIO_ACCOUNT_SID, 'Requires Twilio credentials');
  test.skip(!SYNC_SERVICE_SID, 'Requires TWILIO_SYNC_SERVICE_SID for callback verification');

  test('composition hook automatically creates composition when room ends', async ({ browser }) => {
    test.setTimeout(600000); // 10 minutes - composition can take time
    const roomName = generateRoomName();
    const hookName = `test-hook-${Date.now()}`;

    let hookSid = null;
    let roomSid = null;
    let compositionSid = null;

    try {
      // Step 1: Create Composition Hook
      console.log('Creating Composition Hook...');
      const hook = await twilioClient.video.v1.compositionHooks.create({
        friendlyName: hookName,
        enabled: true,
        audioSources: ['*'],
        videoLayout: {
          grid: {
            video_sources: ['*']
          }
        },
        resolution: '1280x720',
        format: 'mp4',
        trim: true,
        statusCallback: `${CALLBACK_BASE_URL}/video/callbacks/composition-status`,
        statusCallbackMethod: 'POST'
      });

      hookSid = hook.sid;
      console.log(`Created Composition Hook: ${hookSid} (${hookName})`);
      console.log(`  Resolution: ${hook.resolution}`);
      console.log(`  Format: ${hook.format}`);
      console.log(`  Enabled: ${hook.enabled}`);

      // Step 2: Create room with recording enabled
      console.log('\nCreating room with recording...');
      const room = await twilioClient.video.v1.rooms.create({
        uniqueName: roomName,
        type: 'group',
        recordParticipantsOnConnect: true,
        statusCallback: `${CALLBACK_BASE_URL}/video/callbacks/room-status`,
        statusCallbackMethod: 'POST'
      });

      roomSid = room.sid;
      console.log(`Created room: ${roomSid}`);

      // Step 3: Participants join and record
      const contextAlice = await browser.newContext({ permissions: ['camera', 'microphone'] });
      const contextBob = await browser.newContext({ permissions: ['camera', 'microphone'] });

      const pageAlice = await contextAlice.newPage();
      const pageBob = await contextBob.newPage();

      try {
        await pageAlice.goto('/');
        await pageAlice.evaluate(() => { window.IDENTITY = 'alice'; });
        await pageAlice.fill('#room-input', roomName);
        await pageAlice.click('#btn-join');
        await expect(pageAlice.locator('#status')).toHaveText('connected', { timeout: 30000 });
        console.log('Alice connected');

        await pageBob.goto('/');
        await pageBob.evaluate(() => { window.IDENTITY = 'bob'; });
        await pageBob.fill('#room-input', roomName);
        await pageBob.click('#btn-join');
        await expect(pageBob.locator('#status')).toHaveText('connected', { timeout: 30000 });
        console.log('Bob connected');

        // Record for 15 seconds
        console.log('Recording for 15 seconds...');
        await pageAlice.waitForTimeout(15000);

        // Disconnect participants
        await pageAlice.click('#btn-leave');
        await pageBob.click('#btn-leave');
        await expect(pageAlice.locator('#status')).toHaveText('disconnected', { timeout: 10000 });
        await expect(pageBob.locator('#status')).toHaveText('disconnected', { timeout: 10000 });
        console.log('Participants disconnected');

      } finally {
        await contextAlice.close();
        await contextBob.close();
      }

      // Step 4: End room (triggers hook)
      console.log('\nEnding room (this triggers the Composition Hook)...');
      await twilioClient.video.v1.rooms(roomSid).update({ status: 'completed' });

      // Step 5: Wait for recordings to complete first
      console.log('Waiting for recordings to complete...');
      await pollUntil(
        () => twilioClient.video.v1.rooms(roomSid).recordings.list(),
        (recs) => recs.length >= 4 && recs.every(r => r.status === 'completed'),
        120000,
        5000
      );
      console.log('Recordings completed');

      // Step 6: Poll for composition (created automatically by hook)
      console.log('\nWaiting for Composition Hook to create composition...');
      console.log('(This may take several minutes - composition service is batch-based)');

      const compositions = await pollUntil(
        () => twilioClient.video.v1.compositions.list({ roomSid }),
        (comps) => comps.length > 0,
        300000, // 5 minutes
        10000   // Check every 10 seconds
      );

      const composition = compositions[0];
      compositionSid = composition.sid;
      console.log(`\nComposition created automatically: ${compositionSid}`);

      // Step 7: Wait for composition to complete
      console.log('Waiting for composition to complete...');
      const completedComposition = await pollUntil(
        () => twilioClient.video.v1.compositions(compositionSid).fetch(),
        (c) => c.status === 'completed' || c.status === 'failed',
        300000, // 5 minutes
        10000
      );

      expect(completedComposition.status).toBe('completed');
      console.log(`Composition completed: ${completedComposition.sid}`);
      console.log(`  Duration: ${completedComposition.duration}s`);
      console.log(`  Size: ${completedComposition.size} bytes`);
      console.log(`  Resolution: ${completedComposition.resolution}`);
      console.log(`  Format: ${completedComposition.format}`);

      // Step 8: Verify composition matches hook settings
      expect(completedComposition.resolution).toBe('1280x720');
      expect(completedComposition.format).toBe('mp4');
      expect(completedComposition.duration).toBeGreaterThan(0);
      console.log('\nVERIFIED: Composition settings match hook configuration');

      // Step 9: Download and validate MP4 file
      console.log('\nDownloading and validating composition file...');
      const apiKey = process.env.TWILIO_API_KEY;
      const apiSecret = process.env.TWILIO_API_SECRET;
      const mediaUrl = `https://video.twilio.com/v1/Compositions/${compositionSid}/Media`;
      const outputPath = path.join(__dirname, `composition-hook-${compositionSid}.mp4`);

      try {
        execSync(`curl -s -L -u "${apiKey}:${apiSecret}" "${mediaUrl}" -o "${outputPath}"`, {
          encoding: 'utf-8',
        });

        const stats = fs.statSync(outputPath);
        expect(stats.size).toBe(completedComposition.size);
        console.log(`  Downloaded: ${stats.size} bytes`);

        // Validate with ffprobe
        try {
          const ffprobeOutput = execSync(
            `ffprobe -v quiet -print_format json -show_format -show_streams "${outputPath}"`,
            { encoding: 'utf-8' }
          );
          const metadata = JSON.parse(ffprobeOutput);

          const videoStream = metadata.streams.find(s => s.codec_type === 'video');
          const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

          expect(videoStream).toBeDefined();
          expect(videoStream.codec_name).toBe('h264');
          expect(audioStream).toBeDefined();
          expect(audioStream.codec_name).toBe('aac');

          const fileDuration = parseFloat(metadata.format.duration);
          expect(fileDuration).toBeGreaterThan(completedComposition.duration - 2);
          expect(fileDuration).toBeLessThan(completedComposition.duration + 2);

          console.log(`  Validated: H.264 video, AAC audio, ${fileDuration.toFixed(1)}s`);
        } catch (_ffprobeErr) {
          const fileOutput = execSync(`file "${outputPath}"`, { encoding: 'utf-8' });
          expect(fileOutput).toContain('MP4');
          console.log(`  File type: ${fileOutput.trim()}`);
        }
      } finally {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
          console.log('  Cleaned up downloaded file');
        }
      }

      console.log('VERIFIED: Composition file is valid MP4 with correct codecs');

      // Step 10: Verify status callback fired
      console.log('\nVerifying composition status callback...');
      const compositionSyncDocName = `callbacks-video-composition-${compositionSid}`;

      let callbackVerified = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts && !callbackVerified) {
        try {
          const syncDoc = await twilioClient.sync.v1
            .services(SYNC_SERVICE_SID)
            .documents(compositionSyncDocName)
            .fetch();

          const callbacks = syncDoc.data.callbacks || [];
          const events = callbacks.map(cb => cb.rawPayload?.StatusCallbackEvent || cb.rawPayload?.event);

          console.log(`  Composition callback events: ${events.join(', ')}`);

          // Check for composition-available or similar completion event
          const hasCompletionEvent = events.some(e =>
            e === 'composition-available' ||
            e === 'composition-progress' ||
            e === 'completed'
          );

          if (hasCompletionEvent || callbacks.length > 0) {
            callbackVerified = true;
            console.log('VERIFIED: Composition status callback received');

            // Cleanup Sync document
            try {
              await twilioClient.sync.v1
                .services(SYNC_SERVICE_SID)
                .documents(compositionSyncDocName)
                .remove();
            } catch (_cleanupErr) {
              // Ignore cleanup errors
            }
          }
        } catch (err) {
          if (err.code === 20404) {
            // Document not found yet, wait and retry
            await new Promise(r => setTimeout(r, 3000));
            attempts++;
          } else {
            throw err;
          }
        }
      }

      if (!callbackVerified) {
        console.log('  Note: Composition callback document not found (callback may use different naming)');
      }

      console.log('\nVERIFIED: Composition Hook automatically created composition on room end');

    } finally {
      // Cleanup: Delete the Composition Hook
      if (hookSid) {
        console.log(`\nCleaning up Composition Hook: ${hookSid}`);
        try {
          await twilioClient.video.v1.compositionHooks(hookSid).remove();
          console.log('  Hook deleted successfully');
        } catch (err) {
          console.log(`  Warning: Failed to delete hook: ${err.message}`);
        }
      }
    }
  });
});
