// ABOUTME: Local Express server for the blackjack browser client on port 3335.
// ABOUTME: Serves the HTML client, Voice SDK JS, and generates access tokens.

require('dotenv').config();
const express = require('express');
const path = require('path');
const twilio = require('twilio');

const app = express();
const PORT = 3335;

app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../assets/blackjack-client.html'));
});

app.get('/sdk/twilio.min.js', (req, res) => {
  const sdkPath = path.resolve(__dirname, '../node_modules/@twilio/voice-sdk/dist/twilio.min.js');
  res.sendFile(sdkPath, (err) => {
    if (err) {
      res.status(404).send('// Voice SDK not found locally. CDN fallback will load.');
    }
  });
});

app.get('/api/token', (req, res) => {
  const identity = req.query.identity || 'blackjack-player';
  const { AccessToken } = twilio.jwt;
  const { VoiceGrant } = AccessToken;

  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_API_KEY,
    process.env.TWILIO_API_SECRET,
    { identity }
  );

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: process.env.TWILIO_VOICE_SDK_APP_SID,
    incomingAllow: true,
  });
  token.addGrant(voiceGrant);

  res.json({ token: token.toJwt() });
});

app.listen(PORT, () => {
  console.log(`Blackjack server running at http://localhost:${PORT}`);
});
