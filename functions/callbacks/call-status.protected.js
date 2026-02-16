// ABOUTME: Status callback handler for voice call status updates.
// ABOUTME: Logs all call status callbacks to Sync for deep validation.

const { logToSync } = require(Runtime.getFunctions()['callbacks/helpers/sync-logger'].path);

/**
 * Handles call status callbacks from Twilio.
 *
 * Twilio sends status callbacks for each call state transition:
 * - queued: Call is queued
 * - ringing: Call is ringing
 * - in-progress: Call is connected
 * - completed: Call ended normally
 * - busy: Called party was busy
 * - failed: Call could not be completed
 * - no-answer: No answer within timeout
 * - canceled: Call was canceled
 *
 * Callback payload includes:
 * - CallSid: The call SID
 * - CallStatus: Current status
 * - To: Called number
 * - From: Caller number
 * - Direction: inbound or outbound-api
 * - CallDuration: Duration in seconds (when completed)
 * - RecordingUrl: Recording URL (if recorded)
 * - ErrorCode: SIP error code (if failed)
 * - ErrorMessage: Error description (if failed)
 *
 * @see https://www.twilio.com/docs/voice/api/call-resource#call-status-values
 */
exports.handler = async function (context, event, callback) {
  console.log('Call status callback received:', JSON.stringify(event));

  const {
    CallSid,
    CallStatus,
    To,
    From,
    Direction,
    CallDuration,
    RecordingUrl,
    RecordingSid,
    ErrorCode,
    ErrorMessage,
    AccountSid,
    ApiVersion,
    Timestamp,
  } = event;

  if (!CallSid) {
    console.log('Missing CallSid in callback');
    return callback(null, { success: false, error: 'Missing CallSid' });
  }

  try {
    // Log to Sync for deep validation
    // Serialize the event to strip non-serializable properties (e.g., request object)
    // that cause Buffer TypeError when the Sync SDK processes the data.
    const safeEvent = JSON.parse(JSON.stringify(event));

    await logToSync(context, 'call', CallSid, {
      status: CallStatus,
      to: To,
      from: From,
      direction: Direction,
      duration: CallDuration,
      recordingUrl: RecordingUrl,
      recordingSid: RecordingSid,
      errorCode: ErrorCode,
      errorMessage: ErrorMessage,
      accountSid: AccountSid,
      apiVersion: ApiVersion,
      timestamp: Timestamp,
      rawEvent: safeEvent,
    });

    // Log for Function execution logs
    if (ErrorCode) {
      console.log(`Call ${CallSid} ${CallStatus}: Error ${ErrorCode} - ${ErrorMessage}`);
    } else {
      const durationInfo = CallDuration ? ` (${CallDuration}s)` : '';
      console.log(`Call ${CallSid} status: ${CallStatus}${durationInfo}`);
    }

    // Return success
    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({ success: true, status: CallStatus }));

    return callback(null, response);
  } catch (error) {
    console.log('Error processing call status callback:', error.message);

    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({
      success: false,
      error: error.message,
      callSid: CallSid,
    }));

    return callback(null, response);
  }
};
