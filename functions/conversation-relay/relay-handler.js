// ABOUTME: Handles Conversation Relay WebSocket connections for real-time voice AI.
// ABOUTME: Entry point for connecting phone calls to LLM-powered voice agents.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();

  const connect = twiml.connect();

  connect.conversationRelay({
    url: context.CONVERSATION_RELAY_URL || 'wss://your-websocket-server.com/relay',
    transcriptionProvider: 'deepgram',
    speechModel: 'nova-3-general',
    voice: 'Polly.Amy',
    language: 'en-US',
    dtmfDetection: 'true',
    interruptible: 'true',
    interruptByDtmf: 'true',
  });

  return callback(null, twiml);
};
