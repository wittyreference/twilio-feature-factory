// ABOUTME: Inbound call handler for Agent A (questioner) in agent-to-agent testing.
// ABOUTME: Routes calls to Agent A's ConversationRelay WebSocket server.

/**
 * Agent A Inbound Handler
 *
 * This function handles inbound calls to Agent A's phone number (+12062021014).
 * It connects the call to the Agent A WebSocket server via ConversationRelay.
 *
 * For agent-to-agent testing:
 * - Agent A acts as the QUESTIONER
 * - Initiates questions to verify Agent B is working
 * - Stores transcript to Sync for validation
 *
 * Environment Variables:
 *   AGENT_A_RELAY_URL - WebSocket URL for Agent A server (wss://...)
 *   TWILIO_SYNC_SERVICE_SID - Sync Service SID for transcript storage
 */

exports.handler = async function (context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();

  // Get the Agent A relay URL from environment
  const relayUrl = context.AGENT_A_RELAY_URL;

  if (!relayUrl) {
    console.log('AGENT_A_RELAY_URL not configured');
    twiml.say({
      voice: 'Polly.Amy',
    }, 'Agent A relay URL is not configured. Please check the environment variables.');
    return callback(null, twiml);
  }

  console.log(`Agent A inbound call from ${event.From} to ${event.To}`);
  console.log(`Connecting to relay: ${relayUrl}`);

  // Start background recording before ConversationRelay takes over
  const domainName = context.DOMAIN_NAME || 'localhost';
  const start = twiml.start();
  start.recording({
    recordingStatusCallback: `https://${domainName}/callbacks/call-status`,
    recordingStatusCallbackEvent: 'completed',
  });

  // Connect to ConversationRelay
  const connect = twiml.connect();
  connect.conversationRelay({
    url: relayUrl,
    dtmfDetection: true,
    interruptible: true,
    voice: 'en-US-Neural2-D', // Male voice for Agent A
  });

  return callback(null, twiml);
};
