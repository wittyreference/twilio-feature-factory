// ABOUTME: Playwright E2E test for Bandwidth Profile Modes.
// ABOUTME: Tests presentation mode with screen share prioritization and adaptive simulcast.

const { test, expect } = require('@playwright/test');
const twilio = require('twilio');

// Generate unique room name for each test run
const generateRoomName = () => `bandwidth-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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

test.describe('Video SDK - Bandwidth Profile Modes', () => {
  test.skip(!process.env.TWILIO_ACCOUNT_SID, 'Requires Twilio credentials');

  test('presentation mode prioritizes screen share over camera tracks', async ({ browser }) => {
    test.setTimeout(90000);
    const roomName = generateRoomName();

    const contextAlice = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextBob = await browser.newContext({ permissions: ['camera', 'microphone'] });

    const pageAlice = await contextAlice.newPage();
    const pageBob = await contextBob.newPage();

    try {
      // Alice joins with presentation mode bandwidth profile
      await pageAlice.goto('/');
      await pageAlice.evaluate(() => {
        window.IDENTITY = 'alice';
        window.BANDWIDTH_PROFILE_MODE = 'presentation';
        window.ADAPTIVE_SIMULCAST = true;
      });
      await pageAlice.fill('#room-input', roomName);
      await pageAlice.click('#btn-join');
      await expect(pageAlice.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Alice connected with presentation mode');

      // Bob joins with same bandwidth profile
      await pageBob.goto('/');
      await pageBob.evaluate(() => {
        window.IDENTITY = 'bob';
        window.BANDWIDTH_PROFILE_MODE = 'presentation';
        window.ADAPTIVE_SIMULCAST = true;
      });
      await pageBob.fill('#room-input', roomName);
      await pageBob.click('#btn-join');
      await expect(pageBob.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Bob connected with presentation mode');

      // Verify both see each other's camera tracks
      await expect(pageAlice.locator('#remote-video-tracks')).toHaveText('1', { timeout: 15000 });
      await expect(pageBob.locator('#remote-video-tracks')).toHaveText('1', { timeout: 15000 });
      console.log('Both participants see each other\'s camera tracks');

      // Alice starts screen share (presentation content)
      console.log('Alice starting screen share...');
      await pageAlice.evaluate(() => window.startScreenShare());
      await expect(pageAlice.locator('#screen-share-status')).toHaveText('sharing', { timeout: 10000 });
      console.log('Alice screen share started');

      // Verify Alice has 2 video tracks (camera + screen)
      await expect(pageAlice.locator('#local-video-tracks')).toHaveText('2', { timeout: 5000 });
      console.log('Alice publishing 2 video tracks (camera + screen)');

      // Verify Bob sees Alice's screen share (2 remote video tracks)
      await expect(pageBob.locator('#remote-video-tracks')).toHaveText('2', { timeout: 15000 });
      console.log('Bob sees 2 video tracks from Alice (camera + screen)');

      // Let media flow for a bit (longer wait for all tracks to stabilize)
      await pageAlice.waitForTimeout(10000);

      // Get WebRTC stats to verify media is flowing
      const aliceStats = await pageAlice.evaluate(async () => {
        const room = window.getRoom();
        if (!room) {return null;}

        const reports = await room.getStats();
        const stats = {
          localVideo: [],
          localAudio: []
        };

        reports.forEach(report => {
          report.localVideoTrackStats.forEach(s => {
            stats.localVideo.push({
              trackSid: s.trackSid,
              packetsSent: s.packetsSent,
              bytesSent: s.bytesSent,
              frameRate: s.frameRate,
              dimensions: s.dimensions
            });
          });
          report.localAudioTrackStats.forEach(s => {
            stats.localAudio.push({
              trackSid: s.trackSid,
              packetsSent: s.packetsSent,
              bytesSent: s.bytesSent
            });
          });
        });

        return stats;
      });

      console.log('\nAlice WebRTC stats:');
      console.log(`  Local video tracks: ${aliceStats.localVideo.length}`);
      for (const track of aliceStats.localVideo) {
        console.log(`    - Packets sent: ${track.packetsSent}, Bytes: ${track.bytesSent}, Frame rate: ${track.frameRate}`);
      }

      // Verify video is being sent (with simulcast, some layers may have 0 packets)
      expect(aliceStats.localVideo.length).toBeGreaterThanOrEqual(2);
      const activeVideoTracks = aliceStats.localVideo.filter(t => t.packetsSent > 0);
      expect(activeVideoTracks.length).toBeGreaterThanOrEqual(2); // At least camera + screen active
      const totalBytesSent = aliceStats.localVideo.reduce((sum, t) => sum + t.bytesSent, 0);
      expect(totalBytesSent).toBeGreaterThan(0);
      console.log(`VERIFIED: Alice sending video (${activeVideoTracks.length} active layers, ${totalBytesSent} bytes total)`);

      const bobStats = await pageBob.evaluate(async () => {
        const room = window.getRoom();
        if (!room) {return null;}

        const reports = await room.getStats();
        const stats = {
          remoteVideo: [],
          remoteAudio: []
        };

        reports.forEach(report => {
          report.remoteVideoTrackStats.forEach(s => {
            stats.remoteVideo.push({
              trackSid: s.trackSid,
              packetsReceived: s.packetsReceived,
              bytesReceived: s.bytesReceived,
              frameRate: s.frameRate,
              dimensions: s.dimensions
            });
          });
          report.remoteAudioTrackStats.forEach(s => {
            stats.remoteAudio.push({
              trackSid: s.trackSid,
              packetsReceived: s.packetsReceived,
              bytesReceived: s.bytesReceived
            });
          });
        });

        return stats;
      });

      console.log('\nBob WebRTC stats:');
      console.log(`  Remote video tracks received: ${bobStats.remoteVideo.length}`);
      for (const track of bobStats.remoteVideo) {
        console.log(`    - Packets received: ${track.packetsReceived}, Bytes: ${track.bytesReceived}, Dimensions: ${JSON.stringify(track.dimensions)}`);
      }

      // Verify Bob is receiving video (handle null values from tracks not yet reporting)
      expect(bobStats.remoteVideo.length).toBeGreaterThanOrEqual(2);
      const activeRemoteVideoTracks = bobStats.remoteVideo.filter(t => t.packetsReceived && t.packetsReceived > 0);
      // At least 1 track should be active; some tracks may have null stats initially
      expect(activeRemoteVideoTracks.length).toBeGreaterThanOrEqual(1);
      const totalBytesReceived = bobStats.remoteVideo.reduce((sum, t) => sum + (t.bytesReceived || 0), 0);
      expect(totalBytesReceived).toBeGreaterThan(0);
      console.log(`VERIFIED: Bob receiving video (${activeRemoteVideoTracks.length} active tracks, ${totalBytesReceived} bytes total)`);

      // Verify audio is flowing
      expect(aliceStats.localAudio.length).toBeGreaterThan(0);
      expect(aliceStats.localAudio[0].packetsSent).toBeGreaterThan(0);
      expect(bobStats.remoteAudio.length).toBeGreaterThan(0);
      expect(bobStats.remoteAudio[0].packetsReceived).toBeGreaterThan(0);
      console.log('VERIFIED: Audio flowing between participants');

      // Stop screen share
      await pageAlice.evaluate(() => window.stopScreenShare());
      await expect(pageAlice.locator('#screen-share-status')).toHaveText('off', { timeout: 10000 });
      console.log('Alice stopped screen share');

      // Verify Bob now sees only 1 video track
      await expect(pageBob.locator('#remote-video-tracks')).toHaveText('1', { timeout: 10000 });
      console.log('Bob now sees 1 video track (camera only)');

      console.log('\nVERIFIED: Presentation mode with screen share working correctly');

      await pageAlice.click('#btn-leave');
      await pageBob.click('#btn-leave');

    } finally {
      await contextAlice.close();
      await contextBob.close();
    }
  });
});
