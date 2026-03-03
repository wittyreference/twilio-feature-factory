// ABOUTME: Inbound call handler for the Customer Agent in payment testing.
// ABOUTME: Routes calls to Customer Agent's ConversationRelay WebSocket server.

/**
 * Customer Agent Inbound Handler
 *
 * Handles inbound calls to the Customer Agent's phone number (+12062791099).
 * Connects the call to the Customer Agent WebSocket server via ConversationRelay.
 *
 * The Customer Agent portrays a customer who wants to make a payment and
 * provides test card details when prompted by the Payment Agent.
 *
 * Environment Variables:
 *   CUSTOMER_AGENT_RELAY_URL - WebSocket URL for Customer Agent server (wss://...)
 */

exports.handler = async function (context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();

  const relayUrl = context.CUSTOMER_AGENT_RELAY_URL;

  if (!relayUrl) {
    console.log('CUSTOMER_AGENT_RELAY_URL not configured');
    twiml.say({
      voice: 'Google.en-US-Neural2-F',
    }, 'Customer Agent relay URL is not configured. Please check the environment variables.');
    return callback(null, twiml);
  }

  console.log(`Customer Agent inbound call from ${event.From} to ${event.To}`);
  console.log(`Connecting to relay: ${relayUrl}`);

  // Start background recording before ConversationRelay takes over
  const domainName = context.DOMAIN_NAME || 'localhost';
  const start = twiml.start();
  start.recording({
    recordingStatusCallback: `https://${domainName}/conversation-relay/recording-complete`,
    recordingStatusCallbackEvent: 'completed',
  });

  // Connect to ConversationRelay
  const connect = twiml.connect();
  connect.conversationRelay({
    url: relayUrl,
    dtmfDetection: true,
    interruptible: false,
    voice: 'Google.en-US-Neural2-F', // Female voice for Customer Agent
  });

  return callback(null, twiml);
};
