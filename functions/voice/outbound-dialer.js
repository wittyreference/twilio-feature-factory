// ABOUTME: Initiates outbound contact center calls with conference bridge and AMD.
// ABOUTME: Creates a conference, calls the customer with AMD, then bridges the agent.

exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();

  const customerNumber = event.CustomerNumber || event.To;
  const agentNumber = event.AgentNumber || context.TWILIO_PHONE_NUMBER;
  const fromNumber = event.From || context.TWILIO_PHONE_NUMBER;

  if (!customerNumber) {
    const response = new Twilio.Response();
    response.setStatusCode(400);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({ success: false, error: 'Missing CustomerNumber' }));
    return callback(null, response);
  }

  const conferenceName = `outbound-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  try {
    // Call customer with AMD and conference TwiML
    const customerCall = await client.calls.create({
      to: customerNumber,
      from: fromNumber,
      url: `https://${context.DOMAIN_NAME}/voice/outbound-customer-leg?ConferenceName=${encodeURIComponent(conferenceName)}`,
      machineDetection: 'DetectMessageEnd',
      statusCallback: `https://${context.DOMAIN_NAME}/callbacks/call-status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      timeout: 30,
    });

    console.log(`Customer call initiated: ${customerCall.sid} to ${customerNumber}`);
    console.log(`Conference: ${conferenceName}`);

    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({
      success: true,
      conferenceName,
      customerCallSid: customerCall.sid,
      agentNumber,
    }));

    return callback(null, response);
  } catch (error) {
    console.log(`Error initiating outbound call: ${error.message}`);
    const response = new Twilio.Response();
    response.setStatusCode(error.status || 500);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({ success: false, error: error.message }));
    return callback(null, response);
  }
};
