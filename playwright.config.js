// ABOUTME: Playwright configuration for Voice SDK and Video SDK browser E2E tests.
// ABOUTME: Configures headless Chrome with fake WebRTC media and auto-starts test servers.

require('dotenv').config();

const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const voiceTestAudioPath = path.resolve(__dirname, '__tests__/e2e/voice-sdk/fixtures/test-audio.wav');
const videoTestAudioPath = path.resolve(__dirname, '__tests__/e2e/video-sdk/fixtures/speech.wav');
const VOICE_PORT = process.env.VOICE_SDK_TEST_PORT || 3333;
const VIDEO_PORT = process.env.VIDEO_SDK_TEST_PORT || 3334;

// Shared Chrome args for fake media
const fakeMediaArgs = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
];

module.exports = defineConfig({
  // Global defaults
  timeout: 60_000,
  expect: { timeout: 30_000 },
  retries: 0,
  fullyParallel: false,
  workers: 1,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }]
  ],

  use: {
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },

  projects: [
    // Voice SDK tests
    {
      name: 'voice-sdk',
      testDir: '__tests__/e2e/voice-sdk',
      testMatch: '**/*.spec.js',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${VOICE_PORT}`,
        launchOptions: {
          args: [
            ...fakeMediaArgs,
            `--use-file-for-fake-audio-capture=${voiceTestAudioPath}`,
          ],
        },
        permissions: ['microphone'],
      },
    },
    // Video SDK tests
    {
      name: 'video-sdk',
      testDir: '__tests__/e2e/video-sdk',
      testMatch: '**/*.spec.js',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${VIDEO_PORT}`,
        launchOptions: {
          args: [
            ...fakeMediaArgs,
            `--use-file-for-fake-audio-capture=${videoTestAudioPath}`,
          ],
        },
        permissions: ['camera', 'microphone'],
      },
    },
  ],

  webServer: [
    // Voice SDK test server
    {
      command: `node ${path.resolve(__dirname, '__tests__/e2e/voice-sdk/server.js')}`,
      port: Number(VOICE_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
    // Video SDK test server
    {
      command: `node ${path.resolve(__dirname, '__tests__/e2e/video-sdk/server.js')}`,
      port: Number(VIDEO_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
  ],
});
