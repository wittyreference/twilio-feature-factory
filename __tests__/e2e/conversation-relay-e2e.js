#!/usr/bin/env node
// ABOUTME: E2E test script for ConversationRelay voice AI.
// ABOUTME: Makes an outbound call to TEST_PHONE_NUMBER connected to AI agent.

/**
 * ConversationRelay E2E Test
 *
 * This script initiates an outbound call to your test phone number,
 * connecting it to a ConversationRelay WebSocket server for an AI conversation.
 *
 * Prerequisites:
 *   1. WebSocket server running: node __tests__/e2e/conversation-relay-server.js
 *   2. ngrok tunnel active: ngrok http 8080
 *   3. Required environment variables set
 *
 * Environment Variables:
 *   TWILIO_ACCOUNT_SID - Twilio Account SID
 *   TWILIO_AUTH_TOKEN - Twilio Auth Token
 *   TWILIO_PHONE_NUMBER - Twilio phone number to call FROM
 *   TEST_PHONE_NUMBER - Your phone number to receive the call
 *   CONVERSATION_RELAY_URL - WebSocket URL from ngrok (wss://xxx.ngrok.io)
 *
 * Usage:
 *   CONVERSATION_RELAY_URL=wss://xxx.ngrok.io node __tests__/e2e/conversation-relay-e2e.js
 */

require('dotenv').config();
const Twilio = require('twilio');

// Configuration
const config = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  fromNumber: process.env.TWILIO_PHONE_NUMBER,
  toNumber: process.env.TEST_PHONE_NUMBER,
  relayUrl: process.env.CONVERSATION_RELAY_URL,
};

// Validate configuration
function validateConfig() {
  const missing = [];

  if (!config.accountSid?.startsWith('AC')) {missing.push('TWILIO_ACCOUNT_SID');}
  if (!config.authToken) {missing.push('TWILIO_AUTH_TOKEN');}
  if (!config.fromNumber?.startsWith('+')) {missing.push('TWILIO_PHONE_NUMBER');}
  if (!config.toNumber?.startsWith('+')) {missing.push('TEST_PHONE_NUMBER');}
  if (!config.relayUrl?.startsWith('wss://')) {missing.push('CONVERSATION_RELAY_URL (must start with wss://)');}

  if (missing.length > 0) {
    console.error('\n[ERROR] Missing or invalid environment variables:');
    missing.forEach(v => console.error(`  - ${v}`));
    console.error('\nMake sure you have:');
    console.error('  1. A .env file with Twilio credentials');
    console.error('  2. CONVERSATION_RELAY_URL set to your ngrok wss:// URL');
    console.error('\nExample:');
    console.error('  CONVERSATION_RELAY_URL=wss://abc123.ngrok.io node __tests__/e2e/conversation-relay-e2e.js\n');
    process.exit(1);
  }
}

// Build TwiML for ConversationRelay
function buildTwiML() {
  // Note: ConversationRelay attributes:
  // - voice: Use "en-US-Neural2-J" format for Google or standard Polly names
  // - interruptByDtmf is NOT a valid attribute (removed)
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay
      url="${config.relayUrl}"
      voice="en-US-Neural2-J"
      language="en-US"
      transcriptionProvider="google"
      speechModel="telephony"
      profanityFilter="true"
      dtmfDetection="true"
      interruptible="true"
    />
  </Connect>
</Response>`;

  return twiml;
}

// Make the call
async function makeCall() {
  validateConfig();

  const client = Twilio(config.accountSid, config.authToken);
  const twiml = buildTwiML();

  console.log(`
=================================================
  ConversationRelay E2E Test - Initiating Call
=================================================
  From: ${config.fromNumber}
  To: ${config.toNumber}
  WebSocket: ${config.relayUrl}
=================================================
`);

  console.log('TwiML being used:');
  console.log(twiml);
  console.log('\n');

  try {
    console.log('Creating outbound call...');

    const call = await client.calls.create({
      to: config.toNumber,
      from: config.fromNumber,
      twiml: twiml,
      timeout: 30, // Answer timeout
      machineDetection: 'Enable', // Detect answering machines
      machineDetectionTimeout: 5,
    });

    console.log(`
[SUCCESS] Call initiated!
  Call SID: ${call.sid}
  Status: ${call.status}

Your phone should ring shortly.

When you answer:
  - The AI will greet you
  - Have a conversation with it
  - Say "test complete" or "goodbye" to end the call
  - Or press # on your keypad to end

Monitoring call status...
`);

    // Poll call status
    let lastStatus = call.status;
    const startTime = Date.now();
    const maxDuration = 120000; // 2 minutes max

    const statusInterval = setInterval(async () => {
      try {
        const updatedCall = await client.calls(call.sid).fetch();

        if (updatedCall.status !== lastStatus) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          console.log(`[${elapsed}s] Call status: ${updatedCall.status}`);
          lastStatus = updatedCall.status;
        }

        // Check for terminal states
        if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(updatedCall.status)) {
          clearInterval(statusInterval);

          console.log(`
=================================================
  Call Completed
=================================================
  Final Status: ${updatedCall.status}
  Duration: ${updatedCall.duration || 0} seconds
  Direction: ${updatedCall.direction}
=================================================
`);

          if (updatedCall.status === 'completed') {
            console.log('[SUCCESS] E2E test completed successfully!\n');
          } else {
            console.log(`[NOTE] Call ended with status: ${updatedCall.status}\n`);
          }
        }

        // Timeout check
        if (Date.now() - startTime > maxDuration) {
          clearInterval(statusInterval);
          console.log('\n[TIMEOUT] Stopping status monitoring (call may still be active)\n');
        }
      } catch (error) {
        console.error('Error checking call status:', error.message);
      }
    }, 2000);

    // Handle Ctrl+C gracefully
    process.on('SIGINT', async () => {
      console.log('\n\nCancelling call...');
      clearInterval(statusInterval);

      try {
        await client.calls(call.sid).update({ status: 'completed' });
        console.log('Call cancelled successfully.\n');
      } catch (error) {
        console.log('Call may have already ended.\n');
      }
      process.exit(0);
    });

  } catch (error) {
    console.error('\n[ERROR] Failed to create call:');
    console.error(`  ${error.message}`);

    if (error.code === 21211) {
      console.error('\n  The "To" number is invalid. Check TEST_PHONE_NUMBER.');
    } else if (error.code === 21212) {
      console.error('\n  The "From" number is invalid. Check TWILIO_PHONE_NUMBER.');
    } else if (error.code === 21214) {
      console.error('\n  The "To" number is not a valid phone number.');
    }

    process.exit(1);
  }
}

// Run the test
makeCall();
