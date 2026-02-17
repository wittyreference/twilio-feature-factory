// ABOUTME: Creates a conference and adds the first participant via REST API.
// ABOUTME: Protected endpoint for programmatic conference creation with timeout controls.

/**
 * Generate a unique conference name with timestamp and random suffix.
 * Format: conf-{timestamp}-{random4chars}
 */
function generateConferenceName() {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `conf-${timestamp}-${randomSuffix}`;
}

exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();

  // Required: participant phone number
  const participantNumber = event.To;
  if (!participantNumber) {
    const response = new Twilio.Response();
    response.setStatusCode(400);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({ error: 'Missing required parameter: To' }));
    return callback(null, response);
  }

  // Conference settings
  const conferenceName = event.ConferenceName || generateConferenceName();
  const from = event.From || context.TWILIO_PHONE_NUMBER;

  // Timeout settings (prevent conferences from running forever)
  const timeout = parseInt(event.Timeout, 10) || 30; // Ring timeout in seconds
  const timeLimit = parseInt(event.TimeLimit, 10) || 600; // Max call duration (10 min default)

  // Conference participant options
  const startConferenceOnEnter = event.StartOnEnter !== 'false';
  const endConferenceOnExit = event.EndOnExit === 'true';
  const muted = event.Muted === 'true';
  const beep = event.Beep !== 'false';
  const statusCallback = event.StatusCallback || null;

  try {
    // Create conference by adding first participant
    // The conference is created automatically when the first participant joins
    const participantOptions = {
      from,
      to: participantNumber,
      timeout,
      timeLimit,
      startConferenceOnEnter,
      endConferenceOnExit,
      muted,
      beep
    };

    if (statusCallback) {
      participantOptions.statusCallback = statusCallback;
      participantOptions.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed'];
    }

    const participant = await client.conferences(conferenceName)
      .participants
      .create(participantOptions);

    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({
      success: true,
      conferenceName,
      callSid: participant.callSid,
      participantSid: participant.accountSid,
      status: participant.status
    }));

    return callback(null, response);
  } catch (error) {
    const response = new Twilio.Response();
    response.setStatusCode(error.status || 500);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({
      error: error.message,
      code: error.code
    }));

    return callback(null, response);
  }
};
