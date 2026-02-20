// ABOUTME: Local Express server for Voice SDK E2E tests.
// ABOUTME: Serves the test harness and generates access tokens for browser clients.

const path = require('path');
const express = require('express');

// Load environment variables from project root .env
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const twilio = require('twilio');
const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

const PORT = process.env.VOICE_SDK_TEST_PORT || 3333;

const app = express();

// Serve the test harness
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'harness.html'));
});

// Generate access tokens for the browser client
app.get('/api/token', (req, res) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const appSid = process.env.TWILIO_VOICE_SDK_APP_SID;

  if (!accountSid || !apiKey || !apiSecret || !appSid) {
    const missing = [];
    if (!accountSid) {missing.push('TWILIO_ACCOUNT_SID');}
    if (!apiKey) {missing.push('TWILIO_API_KEY');}
    if (!apiSecret) {missing.push('TWILIO_API_SECRET');}
    if (!appSid) {missing.push('TWILIO_VOICE_SDK_APP_SID');}
    return res.status(500).json({
      error: `Missing env vars: ${missing.join(', ')}`
    });
  }

  const identity = req.query.identity || `browser-user-${Date.now()}`;

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: appSid,
    incomingAllow: true
  });

  const token = new AccessToken(accountSid, apiKey, apiSecret, { identity });
  token.addGrant(voiceGrant);

  res.json({ token: token.toJwt(), identity });
});

// Only start listening if run directly (not imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Voice SDK test server running at http://localhost:${PORT}`);
    console.log('Open the URL above to use the softphone harness.');
  });
}

module.exports = { app, PORT };
