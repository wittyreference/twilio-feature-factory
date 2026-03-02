// ABOUTME: Intercept callback for Proxy interactions before they are connected.
// ABOUTME: Protected webhook that logs and approves voice/message interactions.

exports.handler = async (context, event, callback) => {
  const {
    interactionType,
    inboundParticipantIdentifier,
    outboundParticipantIdentifier,
    interactionSessionSid,
  } = event;

  console.log(
    `Proxy intercept: ${interactionType || 'unknown'} interaction ` +
    `from ${inboundParticipantIdentifier || 'unknown'} ` +
    `to ${outboundParticipantIdentifier || 'unknown'} ` +
    `in session ${interactionSessionSid || 'unknown'}`
  );

  // Return 200 to allow the interaction to proceed.
  // Return 403 to block the interaction.
  const response = new Twilio.Response();
  response.setStatusCode(200);
  response.appendHeader('Content-Type', 'application/json');
  response.setBody(JSON.stringify({ success: true }));

  return callback(null, response);
};
