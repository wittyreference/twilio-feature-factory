// ABOUTME: Logs payment progress events to Sync for real-time observability.
// ABOUTME: Protected statusCallback for Pay verb — writes capture/result/error to Sync document.

/**
 * Payment Status → Sync
 *
 * Receives agent-assisted payment status callbacks and writes state to Sync.
 * The Payment Agent WebSocket server polls this Sync document to know when
 * each field is captured and when to prompt for the next field.
 *
 * Sync Document: payment-session-active
 * Data: { callSid, capture, result, errorCode, cardType, lastFour, ... }
 *
 * Environment Variables:
 *   TWILIO_SYNC_SERVICE_SID - Sync Service SID
 */

exports.handler = async (context, event, callback) => {
  // Log ALL event parameters for debugging (agent-assisted payments may use different param names)
  const eventKeys = Object.keys(event).filter((k) => k !== 'request');
  console.log(`payment-status-sync received: ${JSON.stringify(Object.fromEntries(eventKeys.map((k) => [k, event[k]])))}`);

  const callSid = event.CallSid;
  const capture = event.Capture;
  const result = event.Result;
  const errorCode = event.ErrorCode;
  const errorMessage = event.ErrorMessage;
  const paymentCardNumber = event.PaymentCardNumber;
  const paymentCardType = event.PaymentCardType;
  const paymentToken = event.PaymentToken;
  const paymentConfirmationCode = event.PaymentConfirmationCode;
  const required = event.Required;

  // Write payment state to Sync document (well-known name for the agent server to poll)
  const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;
  if (syncServiceSid) {
    const client = context.getTwilioClient();
    const docName = 'payment-session-active';
    const data = {
      callSid,
      capture: capture || null,
      result: result || null,
      errorCode: errorCode || null,
      errorMessage: errorMessage || null,
      required: required || null,
      paymentCardNumber: paymentCardNumber || null,
      paymentCardType: paymentCardType || null,
      paymentToken: paymentToken || null,
      paymentConfirmationCode: paymentConfirmationCode || null,
      lastUpdated: new Date().toISOString(),
    };

    try {
      await client.sync.v1
        .services(syncServiceSid)
        .documents(docName)
        .update({ data });
    } catch (updateError) {
      if (updateError.code === 20404) {
        try {
          await client.sync.v1
            .services(syncServiceSid)
            .documents
            .create({ uniqueName: docName, data, ttl: 86400 });
        } catch (createError) {
          if (createError.code === 54301) {
            await client.sync.v1
              .services(syncServiceSid)
              .documents(docName)
              .update({ data });
          } else {
            console.log(`Sync error: ${createError.message}`);
          }
        }
      } else {
        console.log(`Sync error: ${updateError.message}`);
      }
    }
  }

  const response = new Twilio.Response();
  response.setStatusCode(200);
  response.appendHeader('Content-Type', 'application/json');
  response.setBody(JSON.stringify({ success: true }));
  return callback(null, response);
};
