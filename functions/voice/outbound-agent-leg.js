// ABOUTME: TwiML handler for the agent leg of an outbound contact center call.
// ABOUTME: Whispers context to the agent then joins them into the conference.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const conferenceName = event.ConferenceName || 'default-conference';

  // Whisper to agent before joining
  twiml.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    'Connecting you to the customer now.'
  );

  // Join the same conference as the customer
  const dial = twiml.dial();
  dial.conference(
    {
      startConferenceOnEnter: true,
      endConferenceOnExit: false,
      beep: false,
    },
    conferenceName
  );

  return callback(null, twiml);
};
