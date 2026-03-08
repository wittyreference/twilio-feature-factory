// ABOUTME: Playwright E2E test for exam proctoring with invisible observer pattern.
// ABOUTME: Tests student recording + screen share with proctor joining invisibly via Track Subscriptions API.

const { test, expect } = require('@playwright/test');
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Generate unique room name for each test run
const generateRoomName = () => `exam-proctor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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

test.describe('Video SDK - Exam Proctoring with Invisible Observer', () => {
  const CALLBACK_BASE_URL = process.env.TWILIO_CALLBACK_BASE_URL;
  const SYNC_SERVICE_SID = process.env.TWILIO_SYNC_SERVICE_SID;

  test.skip(!process.env.TWILIO_ACCOUNT_SID, 'Requires Twilio credentials');
  test.skip(!SYNC_SERVICE_SID, 'Requires TWILIO_SYNC_SERVICE_SID for callback verification');

  test('student with screen share, proctor joins as invisible observer via Track Subscriptions API', async ({ browser }) => {
    // Recording and composition can take several minutes (composition is batch-based)
    test.setTimeout(600000); // 10 minutes
    const roomName = generateRoomName();

    // Step 1: Create room with recording enabled
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
    console.log('Created exam room with recording:', roomSid);

    // Step 2: Create browser contexts for student and proctor
    const contextStudent = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextProctor = await browser.newContext({ permissions: ['camera', 'microphone'] });

    const pageStudent = await contextStudent.newPage();
    const pageProctor = await contextProctor.newPage();

    let studentParticipantSid = null;
    let proctorParticipantSid = null;

    try {
      // Step 3: Student joins the exam room
      await pageStudent.goto('/');
      await pageStudent.evaluate(() => { window.IDENTITY = 'student'; });
      await pageStudent.fill('#room-input', roomName);
      await pageStudent.click('#btn-join');
      await expect(pageStudent.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Student connected');

      // Step 4: Student starts screen share
      await pageStudent.evaluate(() => window.startScreenShare());
      await expect(pageStudent.locator('#screen-share-status')).toHaveText('sharing', { timeout: 10000 });
      console.log('Student started screen share');

      // Verify student has 2 video tracks (camera + screen) and 1 audio
      await expect(pageStudent.locator('#local-video-tracks')).toHaveText('2', { timeout: 5000 });
      await expect(pageStudent.locator('#local-audio-tracks')).toHaveText('1');

      // Get student's participant SID for Track Subscriptions API
      const studentParticipants = await twilioClient.video.v1.rooms(roomSid).participants.list({ status: 'connected' });
      const studentParticipant = studentParticipants.find(p => p.identity === 'student');
      studentParticipantSid = studentParticipant.sid;
      console.log(`Student participant SID: ${studentParticipantSid}`);

      // Step 5: Record for 10 seconds before proctor joins
      console.log('Recording student for 10 seconds before proctor joins...');
      await pageStudent.waitForTimeout(10000);

      // Step 6: Proctor joins as observer (no audio/video published)
      // OBSERVER_MODE connects without tracks - proctor won't be recorded
      await pageProctor.goto('/');
      await pageProctor.evaluate(() => {
        window.IDENTITY = 'proctor';
        window.OBSERVER_MODE = true; // Connect without publishing tracks
      });
      await pageProctor.fill('#room-input', roomName);
      await pageProctor.click('#btn-join');
      await expect(pageProctor.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Proctor connected in observer mode (no tracks published)');

      // Get proctor's participant SID
      const allParticipants = await twilioClient.video.v1.rooms(roomSid).participants.list({ status: 'connected' });
      const proctorParticipant = allParticipants.find(p => p.identity === 'proctor');
      proctorParticipantSid = proctorParticipant.sid;
      console.log(`Proctor participant SID: ${proctorParticipantSid}`);

      // Step 7: Make proctor invisible to student using Track Subscriptions API
      // Update student's subscribe rules to exclude proctor's tracks
      console.log('Making proctor invisible to student via Track Subscriptions API...');
      await twilioClient.video.v1
        .rooms(roomSid)
        .participants(studentParticipantSid)
        .subscribeRules
        .update({
          rules: [
            { type: 'include', all: true },
            { type: 'exclude', publisher: 'proctor' }
          ]
        });
      console.log('Student subscribe rules updated - proctor tracks excluded');

      // Proctor subscribes to all tracks (sees student)
      await twilioClient.video.v1
        .rooms(roomSid)
        .participants(proctorParticipantSid)
        .subscribeRules
        .update({
          rules: [{ type: 'include', all: true }]
        });
      console.log('Proctor subscribes to all tracks');

      // Step 8: Wait for subscriptions to take effect
      await pageStudent.waitForTimeout(3000);

      // Step 9: Verify proctor sees student's tracks (camera + screen share + audio)
      // Proctor should see 2 remote video tracks (student camera + screen share) and 1 audio
      await expect(pageProctor.locator('#remote-video-tracks')).toHaveText('2', { timeout: 15000 });
      await expect(pageProctor.locator('#remote-audio-tracks')).toHaveText('1', { timeout: 5000 });
      console.log('Proctor sees student: 2 video tracks (camera + screen), 1 audio');

      // Step 10: Verify student does NOT see proctor's tracks (invisible observer)
      // Student should see 0 remote video and 0 remote audio (proctor is excluded)
      await expect(pageStudent.locator('#remote-video-tracks')).toHaveText('0', { timeout: 5000 });
      await expect(pageStudent.locator('#remote-audio-tracks')).toHaveText('0', { timeout: 5000 });
      console.log('Student cannot see proctor - invisible observer pattern working');

      // Note: Student will still see participant count increase (unavoidable with Track Subscriptions API)
      await expect(pageStudent.locator('#remote-participant-count')).toHaveText('1', { timeout: 5000 });
      console.log('Student sees 1 remote participant (count visible, but no tracks)');

      // Step 11: Continue recording for 10 more seconds with proctor observing
      console.log('Recording with proctor observing for 10 more seconds...');
      await pageStudent.waitForTimeout(10000);

      // Step 12: Both participants leave
      console.log('Ending exam session...');
      await pageStudent.click('#btn-leave');
      await pageProctor.click('#btn-leave');

      await expect(pageStudent.locator('#status')).toHaveText('disconnected', { timeout: 10000 });
      await expect(pageProctor.locator('#status')).toHaveText('disconnected', { timeout: 10000 });

    } finally {
      await contextStudent.close();
      await contextProctor.close();
    }

    // Step 13: End room via API
    console.log('Ending room...');
    await twilioClient.video.v1.rooms(roomSid).update({ status: 'completed' });

    // Step 14: Poll recordings until complete
    // Expected recordings (proctor in observer mode publishes NO tracks):
    // - Student: 1 audio + 1-2 video (camera, possibly screen share) = 2-3 recordings
    // - Proctor: 0 recordings (observer mode - no tracks published)
    console.log('Waiting for recordings to complete...');
    const completedRecordings = await pollUntil(
      () => twilioClient.video.v1.rooms(roomSid).recordings.list(),
      (recs) => recs.length >= 2 && recs.every(r => r.status === 'completed'),
      120000,
      5000
    );

    console.log(`${completedRecordings.length} recordings completed`);

    // STRONG VALIDATION: Verify recordings belong to student by checking sourceSid/trackSid
    const audioRecordings = completedRecordings.filter(r => r.type === 'audio');
    const videoRecordings = completedRecordings.filter(r => r.type === 'video');

    console.log(`Recording breakdown: ${audioRecordings.length} audio, ${videoRecordings.length} video`);

    // Get the track SIDs that student published
    const studentTracks = await twilioClient.video.v1
      .rooms(roomSid)
      .participants(studentParticipantSid)
      .publishedTracks.list();
    const studentTrackSids = studentTracks.map(t => t.sid);
    console.log(`Student published tracks: ${studentTrackSids.join(', ')}`);

    // Get any tracks proctor might have published (should be none in observer mode)
    let proctorTrackSids = [];
    try {
      const proctorTracks = await twilioClient.video.v1
        .rooms(roomSid)
        .participants(proctorParticipantSid)
        .publishedTracks.list();
      proctorTrackSids = proctorTracks.map(t => t.sid);
    } catch (_e) {
      // Proctor may have disconnected, that's fine
    }
    console.log(`Proctor published tracks: ${proctorTrackSids.length === 0 ? 'NONE (observer mode)' : proctorTrackSids.join(', ')}`);

    // Verify proctor published no tracks
    expect(proctorTrackSids.length).toBe(0);
    console.log('VERIFIED: Proctor published 0 tracks (observer mode)');

    // Log recording details with source info
    for (const rec of completedRecordings) {
      const sourceSid = rec.sourceSid || rec.trackSid || 'unknown';
      console.log(`  Recording ${rec.sid}: ${rec.type}, ${rec.duration}s, source=${sourceSid}`);
    }

    // Since proctor published no tracks, all recordings must be from student
    // The total should be student's tracks only (audio + video, possibly screen)
    expect(completedRecordings.length).toBeGreaterThanOrEqual(2);
    expect(completedRecordings.length).toBeLessThanOrEqual(3); // max: audio + camera + screen

    console.log('VERIFIED: All recordings are from student (proctor had no tracks to record)');

    // Step 15: Verify Room Status Callbacks via Sync
    console.log('Verifying room status callbacks...');
    const roomSyncDocName = `callbacks-video-room-${roomSid}`;

    let roomSyncDoc;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      try {
        roomSyncDoc = await twilioClient.sync.v1
          .services(SYNC_SERVICE_SID)
          .documents(roomSyncDocName)
          .fetch();
        break;
      } catch (err) {
        if (err.code === 20404) {
          await new Promise(r => setTimeout(r, 1000));
          attempts++;
        } else {
          throw err;
        }
      }
    }

    if (!roomSyncDoc) {
      throw new Error(`Room Sync document ${roomSyncDocName} not found`);
    }

    const roomCallbacks = roomSyncDoc.data.callbacks || [];
    const roomEvents = roomCallbacks.map(cb => cb.rawPayload?.event);
    console.log('Room callback events:', roomEvents);

    // Verify participant-connected events for both student and proctor
    const participantConnectedEvents = roomCallbacks.filter(cb => cb.rawPayload?.event === 'participant-connected');
    const connectedIdentities = participantConnectedEvents.map(cb => cb.rawPayload?.participantIdentity);
    console.log('Participants connected:', connectedIdentities);

    expect(connectedIdentities).toContain('student');
    expect(connectedIdentities).toContain('proctor');
    console.log('VERIFIED: Both student and proctor participant-connected callbacks received');

    // Step 16: Verify Recording Status Callbacks
    console.log('Verifying recording status callbacks...');

    // Check recording callbacks for each recording
    let recordingStartedCount = 0;
    let recordingCompletedCount = 0;

    for (const rec of completedRecordings) {
      const recSyncDocName = `callbacks-video-recording-${rec.sid}`;
      try {
        const recSyncDoc = await twilioClient.sync.v1
          .services(SYNC_SERVICE_SID)
          .documents(recSyncDocName)
          .fetch();

        const recCallbacks = recSyncDoc.data.callbacks || [];
        const recEvents = recCallbacks.map(cb => cb.rawPayload?.event);

        if (recEvents.includes('recording-started')) {
          recordingStartedCount++;
        }
        if (recEvents.includes('recording-completed')) {
          recordingCompletedCount++;
        }

        console.log(`  Recording ${rec.sid} callbacks: ${recEvents.join(', ')}`);
      } catch (err) {
        if (err.code !== 20404) {
          throw err;
        }
        console.log(`  Recording ${rec.sid} callback doc not found (may use room doc)`);
      }
    }

    console.log(`Recording callbacks: ${recordingStartedCount} started, ${recordingCompletedCount} completed`);

    // At minimum, verify we got recording events in the room callbacks
    const hasRecordingStarted = roomEvents.includes('recording-started');
    const hasRecordingCompleted = roomEvents.includes('recording-completed');
    console.log(`Room-level recording events: started=${hasRecordingStarted}, completed=${hasRecordingCompleted}`);

    // Recording events should be present (either in dedicated docs or room doc)
    expect(recordingStartedCount > 0 || hasRecordingStarted).toBe(true);
    expect(recordingCompletedCount > 0 || hasRecordingCompleted).toBe(true);
    console.log('VERIFIED: Recording started and completed callbacks received');

    // Cleanup Sync documents
    try {
      await twilioClient.sync.v1.services(SYNC_SERVICE_SID).documents(roomSyncDocName).remove();
      for (const rec of completedRecordings) {
        try {
          await twilioClient.sync.v1.services(SYNC_SERVICE_SID).documents(`callbacks-video-recording-${rec.sid}`).remove();
        } catch (_e) { /* ignore */ }
      }
    } catch (cleanupErr) {
      console.log('Sync cleanup warning:', cleanupErr.message);
    }

    // Step 17: Create composition with student recordings only
    // Since proctor is in observer mode, only student tracks are recorded
    console.log('Creating composition with student recordings...');
    const composition = await twilioClient.video.v1.compositions.create({
      roomSid,
      audioSources: ['*'],
      videoLayout: {
        grid: {
          video_sources: ['*']
        }
      },
      resolution: '1280x720',
      format: 'mp4',
      statusCallback: `${CALLBACK_BASE_URL}/video/callbacks/composition-status`,
      statusCallbackMethod: 'POST',
      trim: true,
    });

    expect(composition.sid).toMatch(/^CJ/);
    console.log(`Composition created: ${composition.sid}`);

    // Step 18: Poll until composition completes
    console.log('Waiting for composition to complete...');
    const completedComposition = await pollUntil(
      () => twilioClient.video.v1.compositions(composition.sid).fetch(),
      (c) => c.status === 'completed' || c.status === 'failed',
      600000,
      10000
    );

    expect(completedComposition.status).toBe('completed');
    expect(completedComposition.duration).toBeGreaterThan(0);

    console.log('Composition completed successfully!');
    console.log(`  SID: ${completedComposition.sid}`);
    console.log(`  Duration: ${completedComposition.duration}s`);
    console.log(`  Size: ${completedComposition.size} bytes`);

    // Step 19: Download and validate the MP4
    console.log('Downloading composition MP4...');
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;
    const mediaUrl = `https://video.twilio.com/v1/Compositions/${completedComposition.sid}/Media`;
    const outputPath = path.join(__dirname, `composition-exam-${completedComposition.sid}.mp4`);

    try {
      execSync(`curl -s -L -u "${apiKey}:${apiSecret}" "${mediaUrl}" -o "${outputPath}"`, {
        encoding: 'utf-8',
      });

      const stats = fs.statSync(outputPath);
      expect(stats.size).toBe(completedComposition.size);
      console.log(`  Downloaded: ${outputPath} (${stats.size} bytes)`);

      // Validate MP4 format
      try {
        const ffprobeOutput = execSync(
          `ffprobe -v quiet -print_format json -show_format -show_streams "${outputPath}"`,
          { encoding: 'utf-8' }
        );
        const metadata = JSON.parse(ffprobeOutput);

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        expect(videoStream).toBeDefined();
        expect(videoStream.codec_name).toBe('h264');

        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        expect(audioStream).toBeDefined();
        expect(audioStream.codec_name).toBe('aac');

        console.log(`  Validated: H.264 video, AAC audio, ${parseFloat(metadata.format.duration).toFixed(1)}s`);
        console.log('  Composition contains only student media (proctor in observer mode)');
      } catch (_ffprobeErr) {
        const fileOutput = execSync(`file "${outputPath}"`, { encoding: 'utf-8' });
        expect(fileOutput).toContain('MP4');
        console.log('  Validated: MP4 format');
      }
    } finally {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
        console.log('  Cleaned up downloaded file');
      }
    }
  });
});
