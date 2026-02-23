// ABOUTME: TwiML connect handler for bidirectional Media Streams integration.
// ABOUTME: Starts recording and connects call audio to a WebSocket via Stream.

exports.handler = async function (context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();

  const streamUrl = context.AGENT_B_RELAY_URL;

  if (!streamUrl) {
    console.log('AGENT_B_RELAY_URL not configured for stream handler');
    twiml.say({ voice: 'Polly.Amy' }, 'The streaming service is not configured. Please try again later.');
    return callback(null, twiml);
  }

  console.log(`Stream connect call from ${event.From} to ${event.To}`);

  // Start background recording
  const domainName = context.DOMAIN_NAME || 'localhost';
  const start = twiml.start();
  start.recording({
    recordingStatusCallback: `https://${domainName}/callbacks/call-status`,
    recordingStatusCallbackEvent: 'completed',
  });

  // Greet the caller
  twiml.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    'Welcome to the weather information line. Connecting you to our automated assistant.'
  );

  // Connect bidirectional stream to WebSocket
  const connect = twiml.connect();
  connect.stream({
    url: streamUrl,
  });

  return callback(null, twiml);
};
