// ABOUTME: Welcome handler for a dental office IVR self-service menu.
// ABOUTME: Greets callers, starts background recording, and gathers speech/DTMF for menu navigation.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();

  // Start background recording
  const start = twiml.start();
  start.recording({
    recordingStatusCallback: `https://${context.DOMAIN_NAME}/callbacks/call-status`,
    recordingStatusCallbackEvent: 'completed',
  });

  // Welcome greeting
  twiml.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    'Thank you for calling Valley Dental Clinic. ' +
    'We are happy to assist you today.'
  );

  // Main menu gather
  const gather = twiml.gather({
    input: 'dtmf speech',
    timeout: 5,
    numDigits: 1,
    action: '/voice/ivr-menu',
    method: 'POST',
    speechTimeout: 'auto',
    hints: 'appointments, billing, hours, schedule, payment, office hours, operator',
  });

  gather.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    'For appointments and scheduling, press 1 or say appointments. ' +
    'For billing and payments, press 2 or say billing. ' +
    'For office hours and location, press 3 or say hours. ' +
    'To speak with an operator, press 0.'
  );

  // No input fallback
  twiml.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    'We did not receive any input. Please call again. Goodbye.'
  );

  return callback(null, twiml);
};
