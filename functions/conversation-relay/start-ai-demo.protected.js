// ABOUTME: Initiates outbound AI demo call using ConversationRelay.
// ABOUTME: Creates call with recording, connects to WebSocket AI server.

/**
 * Start AI Demo Call
 *
 * Initiates an outbound call that connects to a ConversationRelay
 * WebSocket server for an AI-powered conversation.
 *
 * Query Parameters:
 *   - to: Phone number to call (E.164 format)
 *   - relayUrl: WebSocket URL for ConversationRelay (optional, uses env default)
 *
 * Environment Variables:
 *   - CONVERSATION_RELAY_URL: Default WebSocket URL
 *   - TWILIO_PHONE_NUMBER: Caller ID for outbound calls
 *   - TWILIO_STATUS_CALLBACK_URL: Status callback URL (optional)
 *
 * Returns: JSON with callSid and status
 */
exports.handler = async function (context, event, callback) {
  const response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');

  // Get parameters
  const toNumber = event.to || context.TEST_PHONE_NUMBER;
  const relayUrl = event.relayUrl || context.CONVERSATION_RELAY_URL;
  const fromNumber = context.TWILIO_PHONE_NUMBER;

  // Validate required parameters
  if (!toNumber) {
    response.setStatusCode(400);
    response.setBody({
      success: false,
      error: 'Missing "to" parameter or TEST_PHONE_NUMBER environment variable',
    });
    return callback(null, response);
  }

  if (!relayUrl) {
    response.setStatusCode(400);
    response.setBody({
      success: false,
      error: 'Missing "relayUrl" parameter or CONVERSATION_RELAY_URL environment variable',
    });
    return callback(null, response);
  }

  if (!fromNumber) {
    response.setStatusCode(400);
    response.setBody({
      success: false,
      error: 'Missing TWILIO_PHONE_NUMBER environment variable',
    });
    return callback(null, response);
  }

  try {
    const client = context.getTwilioClient();

    // Build TwiML for ConversationRelay with recording
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay
      url="${relayUrl}"
      voice="en-US-Neural2-J"
      language="en-US"
      transcriptionProvider="google"
      speechModel="telephony"
      profanityFilter="true"
      dtmfDetection="true"
      interruptible="true"
    />
  </Connect>
</Response>`;

    // Determine status callback URL
    const statusCallbackUrl = context.TWILIO_STATUS_CALLBACK_URL ||
      `https://${context.DOMAIN_NAME}/call-status`;

    // Create the outbound call
    const call = await client.calls.create({
      to: toNumber,
      from: fromNumber,
      twiml: twiml,
      record: true, // Enable recording for the call
      recordingStatusCallback: `https://${context.DOMAIN_NAME}/recording-complete`,
      recordingStatusCallbackEvent: ['completed'],
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      timeout: 30,
      machineDetection: 'Enable',
      machineDetectionTimeout: 5,
    });

    console.log(`AI Demo call initiated: ${call.sid} to ${toNumber}`);

    response.setStatusCode(200);
    response.setBody({
      success: true,
      callSid: call.sid,
      status: call.status,
      to: toNumber,
      from: fromNumber,
      relayUrl: relayUrl,
      message: 'AI demo call initiated. Answer your phone to speak with the AI agent.',
    });

    return callback(null, response);
  } catch (error) {
    console.log('Failed to initiate AI demo call:', error.message);

    response.setStatusCode(500);
    response.setBody({
      success: false,
      error: error.message,
      code: error.code,
    });

    return callback(null, response);
  }
};
