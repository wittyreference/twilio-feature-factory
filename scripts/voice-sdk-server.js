#!/usr/bin/env node
// ABOUTME: Local Express server for the general-purpose Voice SDK browser client.
// ABOUTME: Serves the softphone UI, Voice SDK bundle, and generates access tokens.

const path = require('path');
const express = require('express');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true, quiet: true });

const twilio = require('twilio');
const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

const PORT = process.env.VOICE_SDK_PORT || 3336;
const app = express();

app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../assets/voice-sdk-client.html'));
});

app.get('/sdk/twilio.min.js', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../node_modules/@twilio/voice-sdk/dist/twilio.min.js'));
});

app.get('/api/token', (req, res) => {
  const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_VOICE_SDK_APP_SID } = process.env;

  const missing = [];
  if (!TWILIO_ACCOUNT_SID) missing.push('TWILIO_ACCOUNT_SID');
  if (!TWILIO_API_KEY) missing.push('TWILIO_API_KEY');
  if (!TWILIO_API_SECRET) missing.push('TWILIO_API_SECRET');
  if (!TWILIO_VOICE_SDK_APP_SID) missing.push('TWILIO_VOICE_SDK_APP_SID');

  if (missing.length > 0) {
    return res.status(500).json({ error: `Missing env vars: ${missing.join(', ')}` });
  }

  const identity = req.query.identity || `sdk-user-${Date.now()}`;
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: TWILIO_VOICE_SDK_APP_SID,
    incomingAllow: true
  });

  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, { identity });
  token.addGrant(voiceGrant);

  res.json({ token: token.toJwt(), identity });
});

app.listen(PORT, () => {
  console.log(`\n  Voice SDK Softphone`);
  console.log(`  ====================`);
  console.log(`  Open: http://localhost:${PORT}`);
  console.log(`  App SID: ${process.env.TWILIO_VOICE_SDK_APP_SID || '(not set)'}`);
  console.log(`  Press Ctrl+C to stop\n`);
});
