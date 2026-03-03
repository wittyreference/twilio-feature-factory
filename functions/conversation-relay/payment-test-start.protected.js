// ABOUTME: Orchestrates the agent-assisted payment test by creating a 3-participant conference.
// ABOUTME: Adds Payment Agent, Customer Agent, and DTMF Injector to a conference for payment testing.

/**
 * Payment Test Orchestrator
 *
 * Creates a conference and adds three participants:
 *   1. Payment Agent (ConversationRelay) — guides payment flow
 *   2. Customer Agent (ConversationRelay) — provides card details
 *   3. DTMF Injector (listener-only) — injects card digits via <Play digits>
 *
 * POST /conversation-relay/payment-test-start
 * Body:
 *   sessionId - Unique test session ID (optional, auto-generated)
 *   chargeAmount - Payment amount (default: "49.99")
 *   timeout - Max call duration in seconds (default: 180)
 *
 * Environment Variables:
 *   PAYMENT_AGENT_PHONE_NUMBER - Payment Agent's phone number
 *   CUSTOMER_AGENT_PHONE_NUMBER - Customer Agent's phone number
 *   DTMF_INJECTOR_PHONE_NUMBER - DTMF Injector's phone number
 *   TWILIO_PHONE_NUMBER - From number for conference participants
 *   TWILIO_SYNC_SERVICE_SID - Sync Service SID for state storage
 */

exports.handler = async function (context, event, callback) {
  const client = context.getTwilioClient();

  const paymentAgentPhone = context.PAYMENT_AGENT_PHONE_NUMBER;
  const customerAgentPhone = context.CUSTOMER_AGENT_PHONE_NUMBER;
  const dtmfInjectorPhone = context.DTMF_INJECTOR_PHONE_NUMBER;
  const fromNumber = context.TWILIO_PHONE_NUMBER;
  const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;

  const sessionId = event.sessionId || `pay-test-${Date.now()}`;
  const conferenceName = `pay-conf-${sessionId}`;
  const timeout = parseInt(event.timeout || '180', 10);
  const chargeAmount = event.chargeAmount || '49.99';

  console.log('=== Starting Payment Test ===');
  console.log(`Session: ${sessionId}`);
  console.log(`Conference: ${conferenceName}`);
  console.log(`Amount: $${chargeAmount}`);

  if (!paymentAgentPhone || !customerAgentPhone || !dtmfInjectorPhone) {
    const response = new Twilio.Response();
    response.setStatusCode(400);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({
      success: false,
      error: 'Missing phone number configuration. Set PAYMENT_AGENT_PHONE_NUMBER, CUSTOMER_AGENT_PHONE_NUMBER, DTMF_INJECTOR_PHONE_NUMBER.',
    }));
    return callback(null, response);
  }

  try {
    // Add Payment Agent to conference (starts the conference)
    // The phone's webhook (payment-agent-inbound.protected.js) returns ConversationRelay TwiML
    const paymentAgent = await client.conferences(conferenceName)
      .participants.create({
        from: fromNumber,
        to: paymentAgentPhone,
        startConferenceOnEnter: true,
        endConferenceOnExit: false,
        timeout: 30,
        timeLimit: timeout,
        beep: false,
        conferenceRecord: 'record-from-start',
        conferenceRecordingStatusCallback: `https://${context.DOMAIN_NAME}/conversation-relay/recording-complete`,
        conferenceRecordingStatusCallbackMethod: 'POST',
      });

    console.log(`Payment Agent joined: ${paymentAgent.callSid}`);

    // Add Customer Agent to conference
    const customerAgent = await client.conferences(conferenceName)
      .participants.create({
        from: fromNumber,
        to: customerAgentPhone,
        startConferenceOnEnter: true,
        endConferenceOnExit: false,
        timeout: 30,
        timeLimit: timeout,
        beep: false,
      });

    console.log(`Customer Agent joined: ${customerAgent.callSid}`);

    // Add DTMF Injector to conference (muted, listener-only)
    // The phone's webhook (dtmf-hold.protected.js) returns <Pause> TwiML
    const dtmfInjector = await client.conferences(conferenceName)
      .participants.create({
        from: fromNumber,
        to: dtmfInjectorPhone,
        startConferenceOnEnter: true,
        endConferenceOnExit: false,
        muted: true,
        timeout: 30,
        timeLimit: timeout,
        beep: false,
      });

    console.log(`DTMF Injector joined: ${dtmfInjector.callSid}`);

    // Store session state in Sync for orchestration and validation
    if (syncServiceSid) {
      try {
        await client.sync.v1
          .services(syncServiceSid)
          .documents
          .create({
            uniqueName: `payment-session-${sessionId}`,
            data: {
              sessionId,
              conferenceName,
              chargeAmount,
              paymentAgentCallSid: paymentAgent.callSid,
              customerAgentCallSid: customerAgent.callSid,
              dtmfInjectorCallSid: dtmfInjector.callSid,
              status: 'started',
              createdAt: new Date().toISOString(),
            },
            ttl: 86400,
          });
        console.log(`Sync doc created: payment-session-${sessionId}`);
      } catch (syncError) {
        console.log(`Sync doc creation failed: ${syncError.message}`);
      }
    }

    const result = {
      success: true,
      sessionId,
      conferenceName,
      chargeAmount,
      participants: {
        paymentAgent: { callSid: paymentAgent.callSid, phone: paymentAgentPhone },
        customerAgent: { callSid: customerAgent.callSid, phone: customerAgentPhone },
        dtmfInjector: { callSid: dtmfInjector.callSid, phone: dtmfInjectorPhone },
      },
      syncDocuments: {
        session: `payment-session-${sessionId}`,
      },
    };

    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify(result, null, 2));
    return callback(null, response);

  } catch (error) {
    console.log('Error starting payment test:', error.message);

    const response = new Twilio.Response();
    response.setStatusCode(500);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({
      success: false,
      error: error.message,
      sessionId,
    }));
    return callback(null, response);
  }
};
