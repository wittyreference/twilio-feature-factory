// ABOUTME: Processes IVR menu selections for the dental office self-service system.
// ABOUTME: Routes callers to appointments, billing, or hours info based on DTMF/speech input.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();

  const digits = event.Digits;
  const speechResult = event.SpeechResult;

  const selection = classifyMenuSelection(digits, speechResult);

  if (selection === 'appointments') {
    twiml.say(
      { voice: 'Polly.Amy', language: 'en-GB' },
      'You have reached the appointments department. ' +
      'Our next available appointment is Thursday at 10 AM with Doctor Smith. ' +
      'We also have openings on Friday at 2 PM and Monday at 9 AM. ' +
      'To schedule an appointment, please stay on the line and an operator will assist you shortly.'
    );
    twiml.pause({ length: 2 });
    twiml.say(
      { voice: 'Polly.Amy', language: 'en-GB' },
      'Thank you for your interest in scheduling. ' +
      'A team member will be with you shortly. Goodbye.'
    );
  } else if (selection === 'billing') {
    twiml.say(
      { voice: 'Polly.Amy', language: 'en-GB' },
      'You have reached the billing department. ' +
      'We accept all major insurance plans including Delta Dental, Cigna, and Aetna. ' +
      'For payment questions or to make a payment by phone, ' +
      'please stay on the line and a billing specialist will assist you.'
    );
    twiml.pause({ length: 2 });
    twiml.say(
      { voice: 'Polly.Amy', language: 'en-GB' },
      'Thank you for calling about billing. Goodbye.'
    );
  } else if (selection === 'hours') {
    twiml.say(
      { voice: 'Polly.Amy', language: 'en-GB' },
      'Our office hours are as follows. Valley Dental Clinic is open Monday through Friday from 8 AM to 5 PM. ' +
      'We are closed on weekends and major holidays. ' +
      'Our office is located at 123 Main Street, Suite 200. ' +
      'For directions, please visit our website at valley dental clinic dot com.'
    );
    twiml.pause({ length: 1 });
    twiml.say(
      { voice: 'Polly.Amy', language: 'en-GB' },
      'Thank you for calling Valley Dental Clinic. Goodbye.'
    );
  } else if (selection === 'operator') {
    twiml.say(
      { voice: 'Polly.Amy', language: 'en-GB' },
      'Please hold while we connect you to an operator.'
    );
    twiml.pause({ length: 2 });
    twiml.say(
      { voice: 'Polly.Amy', language: 'en-GB' },
      'All operators are currently assisting other callers. ' +
      'Please try again later. Thank you for calling. Goodbye.'
    );
  } else {
    // Unrecognized — redirect back to welcome
    twiml.say(
      { voice: 'Polly.Amy', language: 'en-GB' },
      'Sorry, we did not understand your selection.'
    );
    twiml.redirect('/voice/ivr-welcome');
  }

  twiml.hangup();

  return callback(null, twiml);
};

/**
 * Classifies menu input as appointments, billing, hours, operator, or unknown.
 */
function classifyMenuSelection(digits, speechResult) {
  // DTMF
  if (digits === '1') {
    return 'appointments';
  }
  if (digits === '2') {
    return 'billing';
  }
  if (digits === '3') {
    return 'hours';
  }
  if (digits === '0') {
    return 'operator';
  }

  // Speech
  if (speechResult) {
    const lower = speechResult.toLowerCase();
    if (lower.includes('appointment') || lower.includes('schedule') || lower.includes('book')) {
      return 'appointments';
    }
    if (lower.includes('billing') || lower.includes('payment') || lower.includes('insurance') || lower.includes('pay')) {
      return 'billing';
    }
    if (lower.includes('hour') || lower.includes('location') || lower.includes('address') || lower.includes('open')) {
      return 'hours';
    }
    if (lower.includes('operator') || lower.includes('person') || lower.includes('human') || lower.includes('representative')) {
      return 'operator';
    }
  }

  return 'unknown';
}
