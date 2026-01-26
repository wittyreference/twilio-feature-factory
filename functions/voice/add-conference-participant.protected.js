// ABOUTME: Adds a participant to an existing conference via REST API.
// ABOUTME: Protected endpoint for adding additional callers to a running conference.

exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();

  // Required parameters
  const conferenceName = event.ConferenceName;
  const participantNumber = event.To;

  if (!conferenceName) {
    const response = new Twilio.Response();
    response.setStatusCode(400);
    response.setBody({ error: 'Missing required parameter: ConferenceName' });
    return callback(null, response);
  }

  if (!participantNumber) {
    const response = new Twilio.Response();
    response.setStatusCode(400);
    response.setBody({ error: 'Missing required parameter: To' });
    return callback(null, response);
  }

  // Conference settings
  const from = event.From || context.TWILIO_PHONE_NUMBER;

  // Timeout settings
  const timeout = parseInt(event.Timeout, 10) || 30;
  const timeLimit = parseInt(event.TimeLimit, 10) || 600;

  // Participant options
  const startConferenceOnEnter = event.StartOnEnter !== 'false';
  const endConferenceOnExit = event.EndOnExit === 'true';
  const muted = event.Muted === 'true';
  const beep = event.Beep !== 'false';
  const statusCallback = event.StatusCallback || null;

  try {
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
    response.setBody({
      success: true,
      conferenceName,
      callSid: participant.callSid,
      status: participant.status
    });

    return callback(null, response);
  } catch (error) {
    const response = new Twilio.Response();
    response.setStatusCode(error.status || 500);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody({
      error: error.message,
      code: error.code
    });

    return callback(null, response);
  }
};
