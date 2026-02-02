// ABOUTME: Handles Conversation Relay WebSocket connections for real-time voice AI.
// ABOUTME: Entry point for connecting phone calls to LLM-powered voice agents.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();

  const connect = twiml.connect();

  // NOTE: interruptByDtmf is NOT a valid ConversationRelay attribute.
  // Use dtmfDetection to detect DTMF tones; interruption is controlled by interruptible.
  connect.conversationRelay({
    url: context.CONVERSATION_RELAY_URL || 'wss://your-websocket-server.com/relay',
    transcriptionProvider: 'deepgram',
    speechModel: 'nova-3-general',
    voice: 'Polly.Amy',
    language: 'en-US',
    dtmfDetection: 'true',
    interruptible: 'true',
  });

  return callback(null, twiml);
};
