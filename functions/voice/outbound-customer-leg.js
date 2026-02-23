// ABOUTME: TwiML handler for the customer leg of an outbound contact center call.
// ABOUTME: Starts recording and joins the customer into a named conference.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const conferenceName = event.ConferenceName || 'default-conference';

  // Start background recording
  const start = twiml.start();
  start.recording({
    recordingStatusCallback: `https://${context.DOMAIN_NAME}/callbacks/call-status`,
    recordingStatusCallbackEvent: 'completed',
  });

  // Brief greeting
  twiml.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    'Hello, this is a courtesy call from our customer service team. ' +
    'Please hold while we connect you to an agent.'
  );

  // Join conference
  const dial = twiml.dial();
  dial.conference(
    {
      startConferenceOnEnter: true,
      endConferenceOnExit: true,
      beep: false,
      statusCallback: `https://${context.DOMAIN_NAME}/callbacks/call-status`,
      statusCallbackEvent: 'start end join leave',
      record: 'record-from-start',
    },
    conferenceName
  );

  return callback(null, twiml);
};
