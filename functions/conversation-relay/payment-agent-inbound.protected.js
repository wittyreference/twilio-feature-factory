// ABOUTME: Inbound call handler for the Payment Agent in payment testing.
// ABOUTME: Routes calls to Payment Agent's ConversationRelay WebSocket server.

/**
 * Payment Agent Inbound Handler
 *
 * Handles inbound calls to the Payment Agent's phone number (+12066664151).
 * Connects the call to the Payment Agent WebSocket server via ConversationRelay.
 *
 * The Payment Agent guides customers through payment collection and uses
 * Claude with tool use to orchestrate Twilio Pay processing.
 *
 * Environment Variables:
 *   PAYMENT_AGENT_RELAY_URL - WebSocket URL for Payment Agent server (wss://...)
 */

exports.handler = async function (context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();

  const relayUrl = context.PAYMENT_AGENT_RELAY_URL;

  if (!relayUrl) {
    console.log('PAYMENT_AGENT_RELAY_URL not configured');
    twiml.say({
      voice: 'Google.en-US-Neural2-D',
    }, 'Payment Agent relay URL is not configured. Please check the environment variables.');
    return callback(null, twiml);
  }

  console.log(`Payment Agent inbound call from ${event.From} to ${event.To}`);
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
    voice: 'Google.en-US-Neural2-D', // Male voice for Payment Agent
  });

  return callback(null, twiml);
};
