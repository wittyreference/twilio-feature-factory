// ABOUTME: Connects incoming calls to ConversationRelay AI agent for pizza ordering.
// ABOUTME: Sets up background recording with callback for post-call processing.

exports.handler = function (context, event, callback) {
  var twiml = new Twilio.twiml.VoiceResponse();

  var wsUrl = context.CONVERSATION_RELAY_URL;

  if (!wsUrl || wsUrl === 'wss://your-websocket-server.com/relay') {
    twiml.say(
      { voice: 'Google.en-US-Neural2-F' },
      'The pizza ordering agent is not available right now. Please try again later.'
    );
    twiml.hangup();
    return callback(null, twiml);
  }

  // Start background recording (non-blocking)
  // Recording callback triggers transcription, Sync storage, and SMS confirmation
  var recordingCallbackUrl =
    'https://' + context.DOMAIN_NAME + '/callbacks/pizza-order-status';
  var start = twiml.start();
  start.recording({
    recordingStatusCallback: recordingCallbackUrl,
    recordingStatusCallbackEvent: 'completed',
    recordingStatusCallbackMethod: 'POST',
    trim: 'trim-silence',
  });

  // Connect to ConversationRelay with pizza agent greeting
  var connect = twiml.connect();
  connect.conversationRelay({
    url: wsUrl,
    voice: 'Google.en-US-Neural2-F',
    language: 'en-US',
    transcriptionProvider: 'deepgram',
    speechModel: 'nova-3-general',
    dtmfDetection: 'true',
    interruptible: 'true',
    welcomeGreeting:
      'Welcome to Mario Pizza! I am your AI ordering assistant. ' +
      'What can I get for you today?',
  });

  return callback(null, twiml);
};
