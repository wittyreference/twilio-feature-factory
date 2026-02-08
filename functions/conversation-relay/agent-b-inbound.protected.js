// ABOUTME: Inbound call handler for Agent B (answerer) in agent-to-agent testing.
// ABOUTME: Routes calls to Agent B's ConversationRelay WebSocket server.

/**
 * Agent B Inbound Handler
 *
 * This function handles inbound calls to Agent B's phone number (+12062031575).
 * It connects the call to the Agent B WebSocket server via ConversationRelay.
 *
 * For agent-to-agent testing:
 * - Agent B acts as the ANSWERER
 * - Responds to Agent A's questions
 * - Stores transcript to Sync for validation
 *
 * Environment Variables:
 *   AGENT_B_RELAY_URL - WebSocket URL for Agent B server (wss://...)
 *   TWILIO_SYNC_SERVICE_SID - Sync Service SID for transcript storage
 */

exports.handler = async function (context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();

  // Get the Agent B relay URL from environment
  const relayUrl = context.AGENT_B_RELAY_URL;

  if (!relayUrl) {
    console.error('AGENT_B_RELAY_URL not configured');
    twiml.say({
      voice: 'Polly.Amy',
    }, 'Agent B relay URL is not configured. Please check the environment variables.');
    return callback(null, twiml);
  }

  console.log(`Agent B inbound call from ${event.From} to ${event.To}`);
  console.log(`Connecting to relay: ${relayUrl}`);

  // Connect to ConversationRelay
  const connect = twiml.connect();
  connect.conversationRelay({
    url: relayUrl,
    dtmfDetection: true,
    interruptible: true,
    voice: 'en-US-Neural2-C', // Female voice for Agent B
  });

  return callback(null, twiml);
};
