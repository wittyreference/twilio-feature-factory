// ABOUTME: TwiML connect handler for the pizza-ordering AI agent via ConversationRelay.
// ABOUTME: Starts recording, greets caller, and connects to AI agent WebSocket server.

exports.handler = async function (context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();

  const relayUrl = context.AGENT_B_RELAY_URL;

  if (!relayUrl) {
    console.log('AGENT_B_RELAY_URL not configured for pizza agent');
    twiml.say({ voice: 'Polly.Amy' }, 'The pizza ordering system is not configured. Please try again later.');
    return callback(null, twiml);
  }

  console.log(`Pizza agent call from ${event.From} to ${event.To}`);

  // Start background recording
  const domainName = context.DOMAIN_NAME || 'localhost';
  const start = twiml.start();
  start.recording({
    recordingStatusCallback: `https://${domainName}/callbacks/call-status`,
    recordingStatusCallbackEvent: 'completed',
  });

  // Brief greeting before AI takes over
  twiml.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    "Welcome to Mario's Pizza! One moment while I connect you to our ordering assistant."
  );

  // Connect to ConversationRelay AI agent
  const connect = twiml.connect();
  connect.conversationRelay({
    url: relayUrl,
    dtmfDetection: true,
    interruptible: true,
    voice: 'en-US-Neural2-C',
  });

  return callback(null, twiml);
};
