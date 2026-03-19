// ABOUTME: TwiML handler invoked when a browser makes an outbound call via Voice SDK.
// ABOUTME: Routes calls to PSTN numbers or other SDK clients based on the To parameter.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const to = event.To;

  if (!to) {
    twiml.say({ voice: 'Polly.Amy' }, 'No destination was provided. Goodbye.');
    return callback(null, twiml);
  }

  if (to.startsWith('+')) {
    // PSTN call — dial a phone number
    const dial = twiml.dial({ callerId: context.TWILIO_PHONE_NUMBER });
    dial.number(to);
  } else if (to.startsWith('client:')) {
    // Client-to-client call — dial another SDK identity
    const clientIdentity = to.replace('client:', '');
    const dial = twiml.dial({ callerId: context.TWILIO_PHONE_NUMBER });
    dial.client(clientIdentity);
  } else {
    twiml.say({ voice: 'Polly.Amy' }, 'Invalid destination format. Goodbye.');
  }

  return callback(null, twiml);
};
