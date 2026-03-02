// ABOUTME: Handles Pay verb completion with payment result and tokenized card data.
// ABOUTME: Protected action URL returning confirmation or failure TwiML to the caller.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();

  const { Result, PaymentCardNumber, PaymentCardType } = event;

  if (Result === 'success') {
    const lastFour = PaymentCardNumber || '****';
    const cardType = PaymentCardType || 'card';
    twiml.say({ voice: 'Polly.Amy' },
      `Payment success. Your ${cardType} ending in ${lastFour} has been charged. Thank you.`
    );
  } else {
    twiml.say({ voice: 'Polly.Amy' },
      'We were unable to process your payment. Please try again or contact support.'
    );
  }

  twiml.hangup();
  return callback(null, twiml);
};
