// ABOUTME: Playwright configuration for Voice SDK browser E2E tests.
// ABOUTME: Configures headless Chrome with fake WebRTC media and auto-starts the test server.

require('dotenv').config();

const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const testAudioPath = path.resolve(__dirname, '__tests__/e2e/voice-sdk/fixtures/test-audio.wav');
const PORT = process.env.VOICE_SDK_TEST_PORT || 3333;

module.exports = defineConfig({
  testDir: '__tests__/e2e/voice-sdk',
  testMatch: '**/*.spec.js',

  // Calls have real-world latency — 60s per test, 5 min total
  timeout: 60_000,
  expect: { timeout: 30_000 },

  // No retries for voice tests — each call costs money
  retries: 0,

  // Sequential execution — avoid concurrent call resource contention
  fullyParallel: false,
  workers: 1,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }]
  ],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            `--use-file-for-fake-audio-capture=${testAudioPath}`,
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
        permissions: ['microphone'],
      },
    },
  ],

  webServer: {
    command: `node ${path.resolve(__dirname, '__tests__/e2e/voice-sdk/server.js')}`,
    port: Number(PORT),
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
