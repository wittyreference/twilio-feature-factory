// ABOUTME: Handles incoming calls and connects them to ConversationRelay AI agent.
// ABOUTME: Entry point for Voice AI Assistant with real-time LLM-powered conversation.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();

  // Get WebSocket URL from environment
  const wsUrl = context.CONVERSATION_RELAY_URL;

  if (!wsUrl || wsUrl === 'wss://your-websocket-server.com/relay') {
    // No WebSocket server configured - return helpful error
    twiml.say(
      { voice: 'Polly.Amy' },
      'The voice AI assistant is not configured. Please set the CONVERSATION_RELAY_URL environment variable.'
    );
    twiml.hangup();
    return callback(null, twiml);
  }

  // Start background recording using <Start><Recording> (non-blocking)
  // This forks off a recording that continues while ConversationRelay runs
  // Recording callback will trigger Intelligence API transcription
  const recordingCallbackUrl = `https://${context.DOMAIN_NAME}/conversation-relay/recording-complete`;
  const start = twiml.start();
  start.recording({
    recordingStatusCallback: recordingCallbackUrl,
    recordingStatusCallbackEvent: 'completed',
    recordingStatusCallbackMethod: 'POST',
    trim: 'trim-silence',
  });

  // Connect to ConversationRelay with Deepgram nova-3
  const connect = twiml.connect();

  // NOTE: interruptByDtmf is NOT a valid ConversationRelay attribute.
  // DTMF detection is controlled by dtmfDetection, interruption by interruptible.
  connect.conversationRelay({
    url: wsUrl,
    transcriptionProvider: 'deepgram',
    speechModel: 'nova-3-general',
    voice: 'Google.en-US-Neural2-F',
    language: 'en-US',
    dtmfDetection: 'true',
    interruptible: 'true',
  });

  return callback(null, twiml);
};
