// ABOUTME: TwiML handler for the sales agent leg of a sales dialer outbound call.
// ABOUTME: Whispers prospect context to the agent then joins them into the conference.

exports.handler = async function (context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();
  const conferenceName = event.ConferenceName || 'sales-conference';

  // Whisper context to the agent
  twiml.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    'Connecting you to the prospect now. They are interested in a product trial.'
  );

  // Join the named conference
  const dial = twiml.dial();
  dial.conference({
    startConferenceOnEnter: true,
    endConferenceOnExit: false,
    beep: false,
  }, conferenceName);

  return callback(null, twiml);
};
