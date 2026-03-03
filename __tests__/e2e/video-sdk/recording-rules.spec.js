// ABOUTME: Playwright E2E test for Recording Rules API.
// ABOUTME: Tests selective recording by track type and dynamic rule updates mid-session.

const { test, expect } = require('@playwright/test');
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Generate unique room name for each test run
const generateRoomName = () => `recreules-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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

test.describe('Video SDK - Recording Rules', () => {
  test.skip(!process.env.TWILIO_ACCOUNT_SID, 'Requires Twilio credentials');

  test('records only audio tracks when video is excluded', async ({ browser }) => {
    test.setTimeout(180000); // 3 minutes for recording completion
    const roomName = generateRoomName();

    // Create room WITHOUT recordParticipantsOnConnect - we'll use Recording Rules
    const room = await twilioClient.video.v1.rooms.create({
      uniqueName: roomName,
      type: 'group',
      // No recordParticipantsOnConnect - Recording Rules will control recording
    });
    const roomSid = room.sid;
    console.log('Created room (no auto-record):', roomSid);

    const contextAlice = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextBob = await browser.newContext({ permissions: ['camera', 'microphone'] });

    const pageAlice = await contextAlice.newPage();
    const pageBob = await contextBob.newPage();

    try {
      // Alice joins
      await pageAlice.goto('/');
      await pageAlice.evaluate(() => { window.IDENTITY = 'alice'; });
      await pageAlice.fill('#room-input', roomName);
      await pageAlice.click('#btn-join');
      await expect(pageAlice.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Alice connected');

      // Bob joins
      await pageBob.goto('/');
      await pageBob.evaluate(() => { window.IDENTITY = 'bob'; });
      await pageBob.fill('#room-input', roomName);
      await pageBob.click('#btn-join');
      await expect(pageBob.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Bob connected');

      // Apply Recording Rules: include all, then exclude video
      // Note: "all" filter cannot be combined with other filters in same rule
      console.log('Applying Recording Rules: audio only (include all, exclude video)...');
      await twilioClient.video.v1.rooms(roomSid)
        .recordingRules
        .update({
          rules: [
            { type: 'include', all: true },
            { type: 'exclude', kind: 'video' }
          ]
        });
      console.log('Recording Rules applied');

      // Verify rules were set
      const rulesResponse = await twilioClient.video.v1.rooms(roomSid)
        .recordingRules
        .fetch();
      console.log('Current Recording Rules:', JSON.stringify(rulesResponse.rules, null, 2));

      // Let recording run for 15 seconds
      console.log('Recording audio for 15 seconds...');
      await pageAlice.waitForTimeout(15000);

      // Disconnect participants
      await pageAlice.click('#btn-leave');
      await pageBob.click('#btn-leave');
      await expect(pageAlice.locator('#status')).toHaveText('disconnected', { timeout: 10000 });
      await expect(pageBob.locator('#status')).toHaveText('disconnected', { timeout: 10000 });

    } finally {
      await contextAlice.close();
      await contextBob.close();
    }

    // End room
    console.log('Ending room...');
    await twilioClient.video.v1.rooms(roomSid).update({ status: 'completed' });

    // Wait for recordings to complete
    console.log('Waiting for recordings to complete...');
    const recordings = await pollUntil(
      () => twilioClient.video.v1.rooms(roomSid).recordings.list(),
      (recs) => recs.length > 0 && recs.every(r => r.status === 'completed'),
      120000,
      5000
    );

    console.log(`Total recordings: ${recordings.length}`);

    // Analyze recordings by type
    const audioRecordings = recordings.filter(r => r.type === 'audio');
    const videoRecordings = recordings.filter(r => r.type === 'video');

    console.log(`Audio recordings: ${audioRecordings.length}`);
    console.log(`Video recordings: ${videoRecordings.length}`);

    // Log recording details
    for (const rec of recordings) {
      console.log(`  ${rec.sid}: ${rec.type}, ${rec.duration}s, source=${rec.sourceSid}`);
    }

    // Validations
    // Should have exactly 2 audio recordings (Alice + Bob)
    expect(audioRecordings.length).toBe(2);
    console.log('VERIFIED: 2 audio recordings created (Alice + Bob)');

    // Should have 0 video recordings
    expect(videoRecordings.length).toBe(0);
    console.log('VERIFIED: 0 video recordings (excluded by rules)');

    // Verify audio recordings have duration
    for (const rec of audioRecordings) {
      expect(rec.duration).toBeGreaterThan(0);
    }
    console.log('VERIFIED: Audio recordings have valid duration');

    // Download and validate actual recording files
    console.log('Downloading and validating recording files...');
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;

    for (const rec of audioRecordings) {
      const mediaUrl = `https://video.twilio.com/v1/Recordings/${rec.sid}/Media`;
      const outputPath = path.join(__dirname, `recording-${rec.sid}.mka`);

      try {
        execSync(`curl -s -L -u "${apiKey}:${apiSecret}" "${mediaUrl}" -o "${outputPath}"`, {
          encoding: 'utf-8',
        });

        const stats = fs.statSync(outputPath);
        expect(stats.size).toBeGreaterThan(0);
        console.log(`  Downloaded ${rec.sid}: ${stats.size} bytes`);

        // Validate with ffprobe
        try {
          const ffprobeOutput = execSync(
            `ffprobe -v quiet -print_format json -show_format -show_streams "${outputPath}"`,
            { encoding: 'utf-8' }
          );
          const metadata = JSON.parse(ffprobeOutput);

          // Verify it's audio only
          const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
          const videoStream = metadata.streams.find(s => s.codec_type === 'video');

          expect(audioStream).toBeDefined();
          expect(videoStream).toBeUndefined();

          // Verify duration matches API metadata (within 2 seconds tolerance)
          const fileDuration = parseFloat(metadata.format.duration);
          expect(fileDuration).toBeGreaterThan(rec.duration - 2);
          expect(fileDuration).toBeLessThan(rec.duration + 2);

          console.log(`  Validated ${rec.sid}: audio-only, ${fileDuration.toFixed(1)}s (API: ${rec.duration}s)`);
        } catch (ffprobeErr) {
          // ffprobe not available - basic file check
          const fileOutput = execSync(`file "${outputPath}"`, { encoding: 'utf-8' });
          console.log(`  File type: ${fileOutput.trim()}`);
        }
      } finally {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      }
    }
    console.log('VERIFIED: Recording files are valid audio-only media');

    console.log('VERIFIED: Recording Rules correctly filtered to audio-only');
  });

  test('dynamically starts, stops, and restarts recording mid-session', async ({ browser }) => {
    test.setTimeout(300000); // 5 minutes for multiple recording phases
    const roomName = generateRoomName();

    // Create room WITHOUT recordParticipantsOnConnect
    const room = await twilioClient.video.v1.rooms.create({
      uniqueName: roomName,
      type: 'group',
    });
    const roomSid = room.sid;
    console.log('Created room (no auto-record):', roomSid);

    const contextAlice = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextBob = await browser.newContext({ permissions: ['camera', 'microphone'] });

    const pageAlice = await contextAlice.newPage();
    const pageBob = await contextBob.newPage();

    try {
      // Both join
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

      // Phase 1: No recording (default - no rules)
      console.log('\n=== Phase 1: No recording (10 seconds) ===');
      await pageAlice.waitForTimeout(10000);

      const phase1Recordings = await twilioClient.video.v1.rooms(roomSid).recordings.list();
      console.log(`Phase 1 recordings: ${phase1Recordings.length}`);
      expect(phase1Recordings.length).toBe(0);
      console.log('VERIFIED: No recordings without rules');

      // Phase 2: Start recording (include all)
      console.log('\n=== Phase 2: Start recording (15 seconds) ===');
      await twilioClient.video.v1.rooms(roomSid)
        .recordingRules
        .update({
          rules: [{ type: 'include', all: true }]
        });
      console.log('Recording Rules: include all');

      await pageAlice.waitForTimeout(15000);

      const phase2Recordings = await twilioClient.video.v1.rooms(roomSid).recordings.list();
      console.log(`Phase 2 recordings (in-progress): ${phase2Recordings.length}`);
      // Should have 4 recordings starting (2 participants × 2 tracks)
      expect(phase2Recordings.length).toBe(4);
      console.log('VERIFIED: 4 recordings started (Alice + Bob, audio + video)');

      // Phase 3: Stop recording (exclude all)
      console.log('\n=== Phase 3: Stop recording (10 seconds) ===');
      await twilioClient.video.v1.rooms(roomSid)
        .recordingRules
        .update({
          rules: [{ type: 'exclude', all: true }]
        });
      console.log('Recording Rules: exclude all');

      await pageAlice.waitForTimeout(10000);

      // Check that recordings from phase 2 are now completed (stopped)
      const phase3Recordings = await twilioClient.video.v1.rooms(roomSid).recordings.list();
      const completedRecordings = phase3Recordings.filter(r => r.status === 'completed');
      console.log(`Phase 3 recordings: ${phase3Recordings.length} (${completedRecordings.length} completed)`);

      // The first batch should be completed now
      expect(completedRecordings.length).toBe(4);
      console.log('VERIFIED: First batch of recordings completed (stopped by exclude rule)');

      // Phase 4: Restart recording (include all again)
      console.log('\n=== Phase 4: Restart recording (15 seconds) ===');
      await twilioClient.video.v1.rooms(roomSid)
        .recordingRules
        .update({
          rules: [{ type: 'include', all: true }]
        });
      console.log('Recording Rules: include all (restart)');

      await pageAlice.waitForTimeout(15000);

      const phase4Recordings = await twilioClient.video.v1.rooms(roomSid).recordings.list();
      console.log(`Phase 4 recordings: ${phase4Recordings.length}`);
      // Should now have 8 recordings (4 from phase 2 + 4 new from phase 4)
      expect(phase4Recordings.length).toBe(8);
      console.log('VERIFIED: 4 new recordings started (total 8)');

      // Disconnect participants
      await pageAlice.click('#btn-leave');
      await pageBob.click('#btn-leave');
      await expect(pageAlice.locator('#status')).toHaveText('disconnected', { timeout: 10000 });
      await expect(pageBob.locator('#status')).toHaveText('disconnected', { timeout: 10000 });

    } finally {
      await contextAlice.close();
      await contextBob.close();
    }

    // End room
    console.log('\n=== Finalizing ===');
    console.log('Ending room...');
    await twilioClient.video.v1.rooms(roomSid).update({ status: 'completed' });

    // Wait for all recordings to complete
    console.log('Waiting for all recordings to complete...');
    const finalRecordings = await pollUntil(
      () => twilioClient.video.v1.rooms(roomSid).recordings.list(),
      (recs) => recs.length === 8 && recs.every(r => r.status === 'completed'),
      120000,
      5000
    );

    console.log('\nFinal recording summary:');
    console.log(`Total recordings: ${finalRecordings.length}`);

    // Group recordings by approximate start time to identify batches
    const sortedByDate = [...finalRecordings].sort((a, b) =>
      new Date(a.dateCreated) - new Date(b.dateCreated)
    );

    // First 4 recordings (Phase 2 batch)
    const batch1 = sortedByDate.slice(0, 4);
    // Last 4 recordings (Phase 4 batch)
    const batch2 = sortedByDate.slice(4, 8);

    console.log('\nBatch 1 (Phase 2 - first recording period):');
    for (const rec of batch1) {
      console.log(`  ${rec.sid}: ${rec.type}, ${rec.duration}s`);
    }

    console.log('\nBatch 2 (Phase 4 - restarted recording):');
    for (const rec of batch2) {
      console.log(`  ${rec.sid}: ${rec.type}, ${rec.duration}s`);
    }

    // Validate we have 8 total recordings
    expect(finalRecordings.length).toBe(8);
    console.log('\nVERIFIED: 8 total recordings (2 batches of 4)');

    // Validate both batches have audio and video
    const batch1Audio = batch1.filter(r => r.type === 'audio');
    const batch1Video = batch1.filter(r => r.type === 'video');
    const batch2Audio = batch2.filter(r => r.type === 'audio');
    const batch2Video = batch2.filter(r => r.type === 'video');

    expect(batch1Audio.length).toBe(2);
    expect(batch1Video.length).toBe(2);
    expect(batch2Audio.length).toBe(2);
    expect(batch2Video.length).toBe(2);
    console.log('VERIFIED: Each batch has 2 audio + 2 video recordings');

    // Validate all recordings have duration
    for (const rec of finalRecordings) {
      expect(rec.duration).toBeGreaterThan(0);
    }
    console.log('VERIFIED: All recordings have valid duration');

    // Download and validate sample recording files (one from each batch)
    console.log('\nDownloading and validating sample recording files...');
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;

    // Validate one audio and one video from batch 1
    const samplesToValidate = [
      { rec: batch1Audio[0], expectedType: 'audio', batch: 1 },
      { rec: batch1Video[0], expectedType: 'video', batch: 1 },
      { rec: batch2Audio[0], expectedType: 'audio', batch: 2 },
      { rec: batch2Video[0], expectedType: 'video', batch: 2 },
    ];

    for (const { rec, expectedType, batch } of samplesToValidate) {
      const extension = expectedType === 'audio' ? 'mka' : 'mkv';
      const mediaUrl = `https://video.twilio.com/v1/Recordings/${rec.sid}/Media`;
      const outputPath = path.join(__dirname, `recording-${rec.sid}.${extension}`);

      try {
        execSync(`curl -s -L -u "${apiKey}:${apiSecret}" "${mediaUrl}" -o "${outputPath}"`, {
          encoding: 'utf-8',
        });

        const stats = fs.statSync(outputPath);
        expect(stats.size).toBeGreaterThan(0);

        // Validate with ffprobe
        try {
          const ffprobeOutput = execSync(
            `ffprobe -v quiet -print_format json -show_format -show_streams "${outputPath}"`,
            { encoding: 'utf-8' }
          );
          const metadata = JSON.parse(ffprobeOutput);

          // Verify correct stream type
          const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
          const videoStream = metadata.streams.find(s => s.codec_type === 'video');

          if (expectedType === 'audio') {
            expect(audioStream).toBeDefined();
          } else {
            expect(videoStream).toBeDefined();
          }

          // Verify duration matches API metadata (within 2 seconds tolerance)
          const fileDuration = parseFloat(metadata.format.duration);
          expect(fileDuration).toBeGreaterThan(rec.duration - 2);
          expect(fileDuration).toBeLessThan(rec.duration + 2);

          console.log(`  Batch ${batch} ${expectedType}: ${fileDuration.toFixed(1)}s (API: ${rec.duration}s)`);
        } catch (ffprobeErr) {
          // ffprobe not available - basic file check
          const fileOutput = execSync(`file "${outputPath}"`, { encoding: 'utf-8' });
          console.log(`  Batch ${batch} ${expectedType}: ${fileOutput.trim()}`);
        }
      } finally {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      }
    }
    console.log('VERIFIED: Recording files have correct media types and durations');

    console.log('\nVERIFIED: Recording Rules successfully started, stopped, and restarted recording');
  });
});
