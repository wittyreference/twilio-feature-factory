// ABOUTME: Hold endpoint for the DTMF Injector conference participant.
// ABOUTME: Returns long pause TwiML — call stays on line until updated with <Play digits>.

/**
 * DTMF Injector Hold Handler
 *
 * This function keeps the DTMF Injector participant alive in the conference.
 * It returns a long <Pause> so the call stays connected and silent.
 *
 * When payment DTMF injection is needed, the orchestrator uses update_call
 * to redirect this call to TwiML containing <Play digits="...">, which
 * sends DTMF tones into the conference audio.
 *
 * After DTMF is played, the call should be redirected back here to resume
 * holding, or ended if no more DTMF is needed.
 */

exports.handler = async function (_context, _event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();

  console.log('DTMF Injector: entering hold state (5 minute pause)');

  // Brief audio to answer the call, then hold silently
  twiml.say({ voice: 'Google.en-US-Neural2-D' }, ' ');
  twiml.pause({ length: 300 });

  // If pause expires without update, hang up gracefully
  twiml.say({ voice: 'Google.en-US-Neural2-D' }, 'DTMF injector session has timed out.');
  twiml.hangup();

  return callback(null, twiml);
};
