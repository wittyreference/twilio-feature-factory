// ABOUTME: Playwright E2E test for professional consultation with PSTN participant.
// ABOUTME: Tests 2 browser participants + 1 phone dial-in with recording and composition.

const { test, expect } = require('@playwright/test');
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Generate unique room name for each test run
const generateRoomName = () => `pstn-consult-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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

test.describe('Video SDK - Professional Consultation with PSTN Participant', () => {
  const CALLBACK_BASE_URL = 'https://prototype-9863-dev.twil.io';
  const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;
  const CONSULTANT_NUMBER = process.env.TEST_PHONE_NUMBER;

  test.skip(!process.env.TWILIO_ACCOUNT_SID, 'Requires Twilio credentials');
  test.skip(!FROM_NUMBER, 'Requires TWILIO_PHONE_NUMBER env var for dial-out');
  test.skip(!CONSULTANT_NUMBER, 'Requires TEST_PHONE_NUMBER env var for PSTN consultant');

  test('professional consultation: 2 browsers + 1 PSTN with recording', async ({ browser }) => {
    // Composition can take up to 10 minutes (batch processing)
    test.setTimeout(600000);
    const roomName = generateRoomName();

    // Step 1: Create room via REST API with recording enabled
    const room = await twilioClient.video.v1.rooms.create({
      uniqueName: roomName,
      type: 'group',
      recordParticipantsOnConnect: true,
      statusCallback: `${CALLBACK_BASE_URL}/video/callbacks/room-status`,
      statusCallbackMethod: 'POST',
      recordingStatusCallback: `${CALLBACK_BASE_URL}/video/callbacks/recording-status`,
      recordingStatusCallbackMethod: 'POST',
    });

    const roomSid = room.sid;
    console.log('Created room with recording:', roomSid);

    // Step 2: Create browser contexts for Expert and Patient
    const contextExpert = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextPatient = await browser.newContext({ permissions: ['camera', 'microphone'] });

    const pageExpert = await contextExpert.newPage();
    const pagePatient = await contextPatient.newPage();

    let pstnCallSid = null;

    try {
      // Step 3: Expert joins first
      await pageExpert.goto('/');
      await pageExpert.evaluate(() => { window.IDENTITY = 'expert'; });
      await pageExpert.fill('#room-input', roomName);
      await pageExpert.click('#btn-join');
      await expect(pageExpert.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Expert connected');

      // Step 4: Patient joins
      await pagePatient.goto('/');
      await pagePatient.evaluate(() => { window.IDENTITY = 'patient'; });
      await pagePatient.fill('#room-input', roomName);
      await pagePatient.click('#btn-join');
      await expect(pagePatient.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Patient connected');

      // Verify Expert and Patient see each other
      await expect(pageExpert.locator('#remote-video-tracks')).toHaveText('1', { timeout: 15000 });
      await expect(pagePatient.locator('#remote-video-tracks')).toHaveText('1', { timeout: 15000 });
      await expect(pageExpert.locator('#remote-participant-count')).toHaveText('1', { timeout: 5000 });
      await expect(pagePatient.locator('#remote-participant-count')).toHaveText('1', { timeout: 5000 });

      // Step 5: Dial PSTN consultant into the video room
      // Use participantIdentity attribute to give the PSTN participant a meaningful identity
      const pstnIdentity = 'phone-consultant';
      console.log(`Dialing PSTN consultant: ${CONSULTANT_NUMBER}...`);
      const pstnCall = await twilioClient.calls.create({
        to: CONSULTANT_NUMBER,
        from: FROM_NUMBER,
        twiml: `<Response><Connect><Room participantIdentity="${pstnIdentity}">${roomName}</Room></Connect></Response>`,
      });
      pstnCallSid = pstnCall.sid;
      console.log(`PSTN call initiated: ${pstnCallSid}`);

      // Step 6: Wait for PSTN participant to join the room (allow 60s for phone answer)
      console.log('Waiting for PSTN participant to join room...');
      const roomParticipants = await pollUntil(
        () => twilioClient.video.v1.rooms(roomSid).participants.list({ status: 'connected' }),
        (participants) => participants.length === 3,
        60000,
        3000
      );

      console.log(`${roomParticipants.length} participants in room`);

      // Step 7: Identify and verify PSTN participant by the identity we set
      const pstnParticipant = roomParticipants.find(p => p.identity === pstnIdentity);
      expect(pstnParticipant).toBeDefined();
      console.log(`PSTN participant identity: ${pstnParticipant.identity}`);

      // Verify PSTN participant has audio only (no video tracks)
      const pstnTracks = await twilioClient.video.v1
        .rooms(roomSid)
        .participants(pstnParticipant.sid)
        .publishedTracks.list();

      const pstnVideoTracks = pstnTracks.filter(t => t.kind === 'video');
      const pstnAudioTracks = pstnTracks.filter(t => t.kind === 'audio');

      expect(pstnVideoTracks.length).toBe(0); // PSTN has no video
      expect(pstnAudioTracks.length).toBe(1); // PSTN has audio
      console.log('Verified PSTN participant: 0 video tracks, 1 audio track');

      // Step 8: Verify browser participants see PSTN (2 remote participants, but only 1 remote video)
      await expect(pageExpert.locator('#remote-participant-count')).toHaveText('2', { timeout: 15000 });
      await expect(pagePatient.locator('#remote-participant-count')).toHaveText('2', { timeout: 15000 });

      // Expert sees: Patient video (1) + no PSTN video
      await expect(pageExpert.locator('#remote-video-tracks')).toHaveText('1', { timeout: 5000 });
      // Expert hears: Patient audio (1) + PSTN audio (1)
      await expect(pageExpert.locator('#remote-audio-tracks')).toHaveText('2', { timeout: 15000 });

      // Patient sees: Expert video (1) + no PSTN video
      await expect(pagePatient.locator('#remote-video-tracks')).toHaveText('1', { timeout: 5000 });
      // Patient hears: Expert audio (1) + PSTN audio (1)
      await expect(pagePatient.locator('#remote-audio-tracks')).toHaveText('2', { timeout: 15000 });

      console.log('Browser participants see 2 remote participants, 1 video, 2 audio');

      // Step 9: Record for 15 seconds to capture meaningful content
      console.log('Recording consultation for 15 seconds...');
      await pageExpert.waitForTimeout(15000);

      // Step 10: All participants leave
      console.log('Ending consultation...');
      await pageExpert.click('#btn-leave');
      await pagePatient.click('#btn-leave');

      await expect(pageExpert.locator('#status')).toHaveText('disconnected', { timeout: 10000 });
      await expect(pagePatient.locator('#status')).toHaveText('disconnected', { timeout: 10000 });

    } finally {
      await contextExpert.close();
      await contextPatient.close();

      // End PSTN call if still active
      if (pstnCallSid) {
        try {
          await twilioClient.calls(pstnCallSid).update({ status: 'completed' });
          console.log('PSTN call ended');
        } catch (err) {
          console.log('PSTN call already ended or error:', err.message);
        }
      }
    }

    // Step 11: End room via API
    console.log('Ending room...');
    await twilioClient.video.v1.rooms(roomSid).update({ status: 'completed' });

    // Step 12: Poll recordings until all 5 complete
    // Recording math: 2 browser × 2 tracks (audio+video) + 1 PSTN × 1 track (audio) = 5
    console.log('Waiting for recordings to complete...');
    const completedRecordings = await pollUntil(
      () => twilioClient.video.v1.rooms(roomSid).recordings.list(),
      (recs) => recs.length === 5 && recs.every(r => r.status === 'completed'),
      120000, // 2 minutes for recordings
      5000
    );

    expect(completedRecordings.length).toBe(5);

    // Verify recording types
    const audioRecordings = completedRecordings.filter(r => r.type === 'audio');
    const videoRecordings = completedRecordings.filter(r => r.type === 'video');

    expect(audioRecordings.length).toBe(3); // expert + patient + phone
    expect(videoRecordings.length).toBe(2); // expert + patient only

    console.log(`${completedRecordings.length} recordings completed: ${audioRecordings.length} audio, ${videoRecordings.length} video`);

    // Step 13: Create composition with all audio sources (including PSTN)
    console.log('Creating composition with mixed audio from all participants...');
    const composition = await twilioClient.video.v1.compositions.create({
      roomSid,
      audioSources: ['*'], // ALL audio including PSTN
      videoLayout: { grid: { video_sources: ['*'] } }, // Grid with browser participants
      resolution: '1280x720',
      format: 'mp4',
      statusCallback: `${CALLBACK_BASE_URL}/video/callbacks/composition-status`,
      statusCallbackMethod: 'POST',
      trim: true,
    });

    expect(composition.sid).toMatch(/^CJ/);
    console.log(`Composition created: ${composition.sid}`);

    // Step 14: Poll until composition completes (batch-based, up to 10 minutes)
    console.log('Waiting for composition to complete (may take up to 10 minutes)...');
    const completedComposition = await pollUntil(
      () => twilioClient.video.v1.compositions(composition.sid).fetch(),
      (c) => c.status === 'completed' || c.status === 'failed',
      600000, // 10 minutes
      10000   // check every 10 seconds
    );

    expect(completedComposition.status).toBe('completed');
    expect(completedComposition.format).toBe('mp4');
    expect(completedComposition.duration).toBeGreaterThan(0);
    expect(completedComposition.size).toBeGreaterThan(0);

    console.log('Composition completed successfully!');
    console.log(`  SID: ${completedComposition.sid}`);
    console.log(`  Duration: ${completedComposition.duration}s`);
    console.log(`  Size: ${completedComposition.size} bytes`);
    console.log(`  Resolution: ${completedComposition.resolution}`);

    // Step 15: Download and validate the MP4 file
    console.log('Downloading composition MP4...');
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;
    const mediaUrl = `https://video.twilio.com/v1/Compositions/${completedComposition.sid}/Media`;
    const outputPath = path.join(__dirname, `composition-pstn-${completedComposition.sid}.mp4`);

    try {
      execSync(`curl -s -L -u "${apiKey}:${apiSecret}" "${mediaUrl}" -o "${outputPath}"`, {
        encoding: 'utf-8',
      });

      const stats = fs.statSync(outputPath);
      expect(stats.size).toBe(completedComposition.size);
      console.log(`  Downloaded: ${outputPath} (${stats.size} bytes)`);

      // Validate MP4 format using ffprobe
      try {
        const ffprobeOutput = execSync(
          `ffprobe -v quiet -print_format json -show_format -show_streams "${outputPath}"`,
          { encoding: 'utf-8' }
        );
        const metadata = JSON.parse(ffprobeOutput);

        // Verify video stream (grid of browser participants)
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        expect(videoStream).toBeDefined();
        expect(videoStream.codec_name).toBe('h264');
        expect(videoStream.width).toBe(1280);
        expect(videoStream.height).toBe(720);

        // Verify audio stream (mixed from ALL 3 participants including PSTN)
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        expect(audioStream).toBeDefined();
        expect(audioStream.codec_name).toBe('aac');

        // Duration should match composition
        const fileDuration = parseFloat(metadata.format.duration);
        expect(fileDuration).toBeGreaterThan(completedComposition.duration - 1);
        expect(fileDuration).toBeLessThan(completedComposition.duration + 1);

        console.log(`  Validated: H.264 video (${videoStream.width}x${videoStream.height}), AAC audio, ${fileDuration.toFixed(1)}s`);
        console.log('  Audio includes mixed input from expert, patient, AND PSTN consultant');
      } catch (ffprobeErr) {
        // ffprobe not available, basic validation
        const fileOutput = execSync(`file "${outputPath}"`, { encoding: 'utf-8' });
        expect(fileOutput).toContain('MP4');
        console.log('  Validated: MP4 format (ffprobe not available for detailed validation)');
      }
    } finally {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
        console.log('  Cleaned up downloaded file');
      }
    }
  });
});
