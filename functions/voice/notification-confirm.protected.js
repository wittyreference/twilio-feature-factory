// ABOUTME: Processes appointment confirmation or denial from notification recipients.
// ABOUTME: Handles DTMF digits and speech input, classifies as confirmed/reschedule/unrecognized.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();

  const digits = event.Digits;
  const speechResult = event.SpeechResult;

  const classification = classifyInput(digits, speechResult);

  if (classification === 'confirmed') {
    twiml.say(
      { voice: 'Polly.Amy', language: 'en-GB' },
      'Your appointment has been confirmed for tomorrow at 2:30 PM. ' +
      'Thank you, and we will see you then. Goodbye.'
    );
  } else if (classification === 'reschedule') {
    twiml.say(
      { voice: 'Polly.Amy', language: 'en-GB' },
      'We understand you need to reschedule. Our office will contact you ' +
      'to arrange a new appointment time. Goodbye.'
    );
  } else {
    twiml.say(
      { voice: 'Polly.Amy', language: 'en-GB' },
      'We were unable to understand your response. Our office will follow up ' +
      'with you directly. Goodbye.'
    );
  }

  twiml.hangup();

  return callback(null, twiml);
};

/**
 * Classifies the caller's input as confirmed, reschedule, or unrecognized.
 *
 * @param {string|undefined} digits - DTMF digit pressed
 * @param {string|undefined} speechResult - Transcribed speech
 * @returns {'confirmed'|'reschedule'|'unrecognized'}
 */
function classifyInput(digits, speechResult) {
  // DTMF takes priority
  if (digits === '1') {
    return 'confirmed';
  }
  if (digits === '2') {
    return 'reschedule';
  }
  if (digits && digits !== '1' && digits !== '2') {
    return 'unrecognized';
  }

  // Speech classification
  if (speechResult) {
    const lower = speechResult.toLowerCase();
    const confirmWords = ['yes', 'confirm', 'affirmative'];
    const denyWords = ['no', 'cancel', 'reschedule'];

    if (confirmWords.some((word) => lower.includes(word))) {
      return 'confirmed';
    }
    if (denyWords.some((word) => lower.includes(word))) {
      return 'reschedule';
    }
    return 'unrecognized';
  }

  return 'unrecognized';
}
