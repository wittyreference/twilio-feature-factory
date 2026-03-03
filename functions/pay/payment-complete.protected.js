// ABOUTME: Handles Pay verb completion with payment result and tokenized card data.
// ABOUTME: Protected action URL returning confirmation or failure TwiML to the caller.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();

  const { Result, PaymentCardNumber, PaymentCardType, PaymentToken, PaymentConfirmationCode } = event;

  console.log(`payment-complete called: Result=${Result}, CardType=${PaymentCardType}, LastFour=${PaymentCardNumber}`);
  console.log(`Token=${PaymentToken}, ConfirmationCode=${PaymentConfirmationCode}`);
  console.log(`CallSid=${event.CallSid}, PaymentSid=${event.PaymentSid}`);

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
