// ABOUTME: Returns TwiML with <Play digits> for DTMF injection into conferences.
// ABOUTME: Public endpoint used as announceUrl to inject card digits during payment capture.

/**
 * DTMF Injection Endpoint
 *
 * Returns <Play digits="..."> TwiML for use as a conference announceUrl.
 * The digits are passed as a query parameter.
 *
 * GET/POST /pay/dtmf-inject?digits=4242424242424242
 */

exports.handler = async (_context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const digits = event.digits || '';

  if (!digits) {
    twiml.say({ voice: 'Google.en-US-Neural2-D' }, 'No digits provided.');
    return callback(null, twiml);
  }

  console.log(`DTMF inject: playing digits ${digits.slice(0, 4)}****`);
  twiml.play({ digits });

  return callback(null, twiml);
};
