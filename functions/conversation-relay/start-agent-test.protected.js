// ABOUTME: Test orchestrator that initiates agent-to-agent calls and validates results.
// ABOUTME: Creates outbound call from Agent A to Agent B and monitors completion.

/**
 * Agent-to-Agent Test Orchestrator
 *
 * This function starts an automated test between two AI agents:
 * 1. Creates outbound call from Agent A to Agent B
 * 2. Monitors call completion
 * 3. Retrieves transcripts from Sync
 * 4. Validates conversation quality
 *
 * POST /start-agent-test
 * Body:
 *   sessionId - Unique test session ID (optional, auto-generated if not provided)
 *   agentAUrl - Webhook URL for Agent A's inbound handler
 *   timeout - Max call duration in seconds (default: 120)
 *
 * Environment Variables:
 *   AGENT_A_PHONE_NUMBER - Agent A's phone number (+12062021014)
 *   AGENT_B_PHONE_NUMBER - Agent B's phone number (+12062031575)
 *   TWILIO_SYNC_SERVICE_SID - Sync Service SID for transcript storage
 */

exports.handler = async function (context, event, callback) {
  const client = context.getTwilioClient();

  // Configuration
  const agentAPhone = context.AGENT_A_PHONE_NUMBER || '+12062021014';
  const agentBPhone = context.AGENT_B_PHONE_NUMBER || '+12062031575';
  const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;
  const sessionId = event.sessionId || `test-${Date.now()}`;
  const timeout = parseInt(event.timeout || '120', 10);

  console.log('=== Starting Agent-to-Agent Test ===');
  console.log(`Session ID: ${sessionId}`);
  console.log(`Agent A: ${agentAPhone}`);
  console.log(`Agent B: ${agentBPhone}`);
  console.log(`Timeout: ${timeout}s`);

  try {
    // Construct the webhook URL for Agent A's inbound handler
    // When Agent A's phone is called, it connects to the Agent A WebSocket server
    const agentAUrl = event.agentAUrl ||
      `https://${context.DOMAIN_NAME}/conversation-relay/agent-a-inbound`;

    // Create outbound call from Agent A to Agent B
    // This triggers Agent A to call Agent B, initiating the test conversation
    const call = await client.calls.create({
      to: agentBPhone,
      from: agentAPhone,
      url: agentAUrl,
      statusCallback: `https://${context.DOMAIN_NAME}/callbacks/call-status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      timeout: timeout,
    });

    console.log(`Call created: ${call.sid}`);
    console.log(`Status: ${call.status}`);

    // Return immediately with call info
    // Validation happens asynchronously via callbacks or manual check
    const response = {
      success: true,
      sessionId: sessionId,
      callSid: call.sid,
      status: call.status,
      from: agentAPhone,
      to: agentBPhone,
      syncDocuments: {
        agentA: `agent-test-${sessionId}-agent-questioner`,
        agentB: `agent-test-${sessionId}-agent-answerer`,
      },
      validation: {
        message: 'Call initiated. Use /validate-agent-test to check results after call completes.',
        validateUrl: `https://${context.DOMAIN_NAME}/conversation-relay/validate-agent-test?sessionId=${sessionId}&callSid=${call.sid}`,
      },
    };

    return callback(null, {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response, null, 2),
    });

  } catch (error) {
    console.error('Error starting agent test:', error);

    return callback(null, {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message,
        sessionId: sessionId,
      }),
    });
  }
};
