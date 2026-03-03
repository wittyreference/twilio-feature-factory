// ABOUTME: ConversationRelay handler for SIP Lab hostess agent (Sam).
// ABOUTME: Connects inbound calls to the hostess WebSocket server, starts recording.

exports.handler = async function (context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();

  const relayUrl = context.SIP_HOSTESS_RELAY_URL;

  if (!relayUrl) {
    console.log('SIP_HOSTESS_RELAY_URL not configured');
    twiml.say({ voice: 'Google.en-US-Neural2-F' },
      'The hostess agent relay URL is not configured.');
    return callback(null, twiml);
  }

  console.log(`SIP hostess inbound from ${event.From} to ${event.To}`);
  console.log(`Connecting to relay: ${relayUrl}`);

  // Start background recording
  const domainName = context.DOMAIN_NAME || 'localhost';
  const start = twiml.start();
  start.recording({
    recordingStatusCallback: `https://${domainName}/callbacks/call-status`,
    recordingStatusCallbackEvent: 'completed',
    trim: 'trim-silence',
  });

  // Connect to ConversationRelay
  const connect = twiml.connect();
  connect.conversationRelay({
    url: relayUrl,
    dtmfDetection: 'true',
    interruptible: 'true',
    voice: 'Google.en-US-Neural2-C',
    language: 'en-US',
  });

  return callback(null, twiml);
};
