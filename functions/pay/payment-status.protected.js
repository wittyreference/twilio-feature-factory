// ABOUTME: Logs payment progress events during DTMF card collection.
// ABOUTME: Protected statusCallback endpoint for Pay verb status updates.

exports.handler = async (context, event, callback) => {
  const { CallSid, PaymentSid, Result, Capture, ErrorCode, ErrorMessage } = event;

  if (Capture) {
    console.log(`Payment ${PaymentSid} on call ${CallSid}: capturing ${Capture}`);
  }

  if (ErrorCode) {
    console.log(`Payment ${PaymentSid} error ${ErrorCode}: ${ErrorMessage || 'unknown'}`);
  }

  if (Result) {
    console.log(`Payment ${PaymentSid} on call ${CallSid}: result=${Result}`);
  }

  const response = new Twilio.Response();
  response.setStatusCode(200);
  response.appendHeader('Content-Type', 'application/json');
  response.setBody(JSON.stringify({ success: true }));

  return callback(null, response);
};
