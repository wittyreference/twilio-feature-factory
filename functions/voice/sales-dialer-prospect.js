// ABOUTME: TwiML handler for the prospect leg of a sales dialer outbound call.
// ABOUTME: Starts recording and joins the prospect into a named conference.

exports.handler = async function (context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();
  const conferenceName = event.ConferenceName || 'sales-conference';

  // Start background recording
  const domainName = context.DOMAIN_NAME || 'localhost';
  const start = twiml.start();
  start.recording({
    recordingStatusCallback: `https://${domainName}/callbacks/call-status`,
    recordingStatusCallbackEvent: 'completed',
  });

  // Greet the prospect
  twiml.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    'Hello, this is a call from our sales team regarding a product demonstration. Please hold while we connect you to a representative.'
  );

  // Join the named conference
  const dial = twiml.dial();
  dial.conference({
    startConferenceOnEnter: true,
    endConferenceOnExit: true,
    beep: false,
    record: 'record-from-start',
    statusCallback: `https://${domainName}/callbacks/call-status`,
    statusCallbackEvent: 'start end join leave',
  }, conferenceName);

  return callback(null, twiml);
};
