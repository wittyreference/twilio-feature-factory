// ABOUTME: Voice webhook returning Pay TwiML for PCI-compliant DTMF payment collection.
// ABOUTME: Public endpoint that greets the caller and initiates credit card capture.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();

  const chargeAmount = event.chargeAmount || context.PAYMENT_CHARGE_AMOUNT || '0.00';
  const paymentConnector = context.PAYMENT_CONNECTOR || 'Default';
  const currency = context.PAYMENT_CURRENCY || 'usd';

  twiml.say({ voice: 'Polly.Amy' },
    'Welcome to our payment system. You will now be prompted to enter your credit card information securely.'
  );

  twiml.pay({
    paymentConnector,
    chargeAmount,
    currency,
    paymentMethod: 'credit-card',
    tokenType: 'one-time',
    action: '/pay/payment-complete',
    statusCallback: '/pay/payment-status',
  });

  return callback(null, twiml);
};
