// ABOUTME: Inbound message webhook for Messaging Services with keyword routing.
// ABOUTME: Public endpoint returning TwiML with HELP/INFO responses and default acknowledgment.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.MessagingResponse();
  const body = (event.Body || '').toUpperCase().trim();

  if (body === 'HELP') {
    twiml.message('Reply STOP to unsubscribe. For support, visit our website or reply INFO for more options.');
    return callback(null, twiml);
  }

  if (body === 'INFO') {
    twiml.message('This is an automated messaging service. Reply HELP for support or STOP to unsubscribe.');
    return callback(null, twiml);
  }

  twiml.message('Thanks for your message! We\'ll get back to you shortly.');
  return callback(null, twiml);
};
