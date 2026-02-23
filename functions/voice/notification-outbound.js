// ABOUTME: TwiML entry point for outbound appointment reminder notification calls.
// ABOUTME: Starts background recording, announces appointment details, gathers speech/DTMF confirmation.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();

  // Start background recording with absolute callback URL
  const start = twiml.start();
  start.recording({
    recordingStatusCallback: `https://${context.DOMAIN_NAME}/callbacks/call-status`,
    recordingStatusCallbackEvent: 'completed',
  });

  // Announce appointment details
  twiml.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    'Hello, this is an automated reminder from Valley Health Clinic. ' +
    'You have an appointment scheduled for tomorrow, Wednesday, at 2:30 PM ' +
    'with Doctor Johnson.'
  );

  // Gather confirmation via speech or DTMF
  const gather = twiml.gather({
    input: 'dtmf speech',
    timeout: 5,
    numDigits: 1,
    action: '/voice/notification-confirm',
    method: 'POST',
    speechTimeout: 'auto',
    hints: 'yes, no, confirm, cancel, reschedule',
  });

  gather.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    'To confirm your appointment, press 1 or say yes. ' +
    'To cancel or reschedule, press 2 or say no.'
  );

  // Fallback for no input
  twiml.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    'We did not receive a response. We will try calling again later. Goodbye.'
  );

  return callback(null, twiml);
};
