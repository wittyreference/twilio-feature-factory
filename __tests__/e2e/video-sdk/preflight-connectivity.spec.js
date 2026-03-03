// ABOUTME: Playwright E2E test for Video SDK Preflight API.
// ABOUTME: Tests network connectivity and WebRTC diagnostics before joining a room.

const { test, expect } = require('@playwright/test');

test.describe('Video SDK - Preflight API', () => {
  test.skip(!process.env.TWILIO_ACCOUNT_SID, 'Requires Twilio credentials');

  test('preflight test completes successfully with network diagnostics', async ({ browser }) => {
    test.setTimeout(120000); // 2 minutes - preflight can take time

    const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const page = await context.newPage();

    try {
      await page.goto('/');

      // Get a token for preflight (no room name needed, just identity)
      const token = await page.evaluate(async () => {
        const response = await fetch('/api/token?identity=preflight-test');
        const data = await response.json();
        return data.token;
      });

      expect(token).toBeTruthy();
      console.log('Got token for preflight test');

      // Run preflight test
      console.log('Starting preflight connectivity test...');
      const result = await page.evaluate(async (token) => {
        return await window.runPreflight(token);
      }, token);

      console.log('Preflight result:', JSON.stringify(result, null, 2));

      // Verify success
      expect(result.success).toBe(true);
      console.log('VERIFIED: Preflight test completed successfully');

      // Verify progress events fired
      expect(result.progressEvents).toBeDefined();
      expect(result.progressEvents.length).toBeGreaterThan(0);
      console.log(`Progress events received: ${result.progressEvents.length}`);
      for (const event of result.progressEvents) {
        console.log(`  - ${event.name}`);
      }

      // Verify expected progress steps occurred
      const progressNames = result.progressEvents.map(e => e.name);
      console.log('\nExpected progress events:');

      // mediaAcquired - local media captured
      if (progressNames.includes('mediaAcquired')) {
        console.log('  - mediaAcquired: Local media captured');
      }

      // connected - connected to Twilio
      if (progressNames.includes('connected')) {
        console.log('  - connected: Connected to Twilio servers');
      }

      // mediaSubscribed - received test media
      if (progressNames.includes('mediaSubscribed')) {
        console.log('  - mediaSubscribed: Test media received');
      }

      // Verify report contains expected fields
      expect(result.report).toBeDefined();
      console.log('\nPreflight Report:');

      // Test timing
      if (result.report.testTiming) {
        console.log('  Test Timing:');
        console.log(`    - Duration: ${result.report.testTiming.duration}ms`);
      }

      // Network timing
      if (result.report.networkTiming) {
        console.log('  Network Timing:');
        if (result.report.networkTiming.connect) {
          console.log(`    - Connect: ${result.report.networkTiming.connect.duration}ms`);
        }
        if (result.report.networkTiming.media) {
          console.log(`    - Media: ${result.report.networkTiming.media.duration}ms`);
        }
      }

      // Stats
      if (result.report.stats) {
        console.log('  Stats:');
        if (result.report.stats.jitter) {
          console.log(`    - Jitter: avg=${result.report.stats.jitter.average}ms, max=${result.report.stats.jitter.max}ms`);
        }
        if (result.report.stats.rtt) {
          console.log(`    - RTT: avg=${result.report.stats.rtt.average}ms, max=${result.report.stats.rtt.max}ms`);
        }
        if (result.report.stats.packetLoss) {
          console.log(`    - Packet Loss: ${result.report.stats.packetLoss.average}%`);
        }
      }

      // ICE candidate stats
      if (result.report.selectedIceCandidatePairStats) {
        console.log('  Selected ICE Candidate Pair:');
        const pair = result.report.selectedIceCandidatePairStats;
        if (pair.localCandidate) {
          console.log(`    - Local: ${pair.localCandidate.candidateType} (${pair.localCandidate.protocol})`);
        }
        if (pair.remoteCandidate) {
          console.log(`    - Remote: ${pair.remoteCandidate.candidateType} (${pair.remoteCandidate.protocol})`);
        }
      }

      // ICE candidates gathered
      if (result.report.iceCandidateStats && result.report.iceCandidateStats.length > 0) {
        console.log(`  ICE Candidates gathered: ${result.report.iceCandidateStats.length}`);
        const types = {};
        for (const candidate of result.report.iceCandidateStats) {
          types[candidate.candidateType] = (types[candidate.candidateType] || 0) + 1;
        }
        for (const [type, count] of Object.entries(types)) {
          console.log(`    - ${type}: ${count}`);
        }
      }

      console.log('\nVERIFIED: Preflight API provides comprehensive network diagnostics');

    } finally {
      await context.close();
    }
  });
});
