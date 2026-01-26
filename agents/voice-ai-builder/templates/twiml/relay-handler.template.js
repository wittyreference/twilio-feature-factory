// ABOUTME: Template TwiML handler for ConversationRelay voice AI application.
// ABOUTME: Replace placeholders with your configuration values.

/**
 * Twilio Function handler for ConversationRelay
 *
 * This function connects inbound calls to a WebSocket server
 * that processes speech with an LLM.
 *
 * Environment variables required:
 * - CONVERSATION_RELAY_URL: Your WebSocket server URL (wss://)
 */
exports.handler = function(context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();

  // Optional: Welcome greeting before connecting
  // twiml.say('Welcome to our AI assistant.');

  const connect = twiml.connect();

  connect.conversationRelay({
    // WebSocket URL for your ConversationRelay server
    url: context.CONVERSATION_RELAY_URL || '{{RELAY_URL}}',

    // Voice configuration
    voice: '{{VOICE}}',              // e.g., 'Polly.Matthew', 'Google.en-US-Neural2-D'
    language: '{{LANGUAGE}}',        // e.g., 'en-US', 'es-ES'

    // Speech recognition
    transcriptionProvider: '{{TRANSCRIPTION_PROVIDER}}',  // 'google' or 'deepgram'
    speechModel: '{{SPEECH_MODEL}}', // 'telephony' or 'default'

    // Interaction settings
    dtmfDetection: '{{DTMF_ENABLED}}',       // 'true' or 'false'
    interruptible: '{{INTERRUPTIBLE}}',      // 'true' or 'false'
    interruptByDtmf: '{{DTMF_ENABLED}}',     // Match DTMF detection

    // Optional: Content filtering
    // profanityFilter: 'true',

    // Optional: Status callbacks
    // statusCallback: 'https://your-domain.com/status',
  });

  callback(null, twiml);
};
