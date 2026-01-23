// ABOUTME: Status callback handler for SMS/MMS message delivery updates.
// ABOUTME: Logs all message status callbacks to Sync for deep validation.

const { logToSync } = require(Runtime.getFunctions()['callbacks/helpers/sync-logger'].path);

/**
 * Handles message status callbacks from Twilio.
 *
 * Twilio sends status callbacks for each message state transition:
 * - queued: Message is queued for delivery
 * - sending: Message is being sent to carrier
 * - sent: Message accepted by carrier
 * - delivered: Message delivered to recipient (if DLR available)
 * - undelivered: Message could not be delivered
 * - failed: Message failed to send
 * - read: Message was read (WhatsApp only)
 *
 * Callback payload includes:
 * - MessageSid: The message SID
 * - MessageStatus: Current status
 * - To: Recipient number
 * - From: Sender number
 * - ErrorCode: Error code (if failed/undelivered)
 * - ErrorMessage: Human-readable error (if failed/undelivered)
 *
 * @see https://www.twilio.com/docs/sms/api/message-resource#message-status-values
 */
exports.handler = async function (context, event, callback) {
  console.log('Message status callback received:', JSON.stringify(event));

  const {
    MessageSid,
    MessageStatus,
    To,
    From,
    ErrorCode,
    ErrorMessage,
    AccountSid,
    ApiVersion,
  } = event;

  if (!MessageSid) {
    console.error('Missing MessageSid in callback');
    return callback(null, { success: false, error: 'Missing MessageSid' });
  }

  try {
    // Log to Sync for deep validation
    await logToSync(context, 'message', MessageSid, {
      status: MessageStatus,
      to: To,
      from: From,
      errorCode: ErrorCode,
      errorMessage: ErrorMessage,
      accountSid: AccountSid,
      apiVersion: ApiVersion,
      rawEvent: event,
    });

    // Log for Function execution logs (also checked by deep validator)
    if (ErrorCode) {
      console.error(`Message ${MessageSid} ${MessageStatus}: Error ${ErrorCode} - ${ErrorMessage}`);
    } else {
      console.log(`Message ${MessageSid} status: ${MessageStatus}`);
    }

    // Return success - Twilio expects 2xx response
    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.setBody({ success: true, status: MessageStatus });

    return callback(null, response);
  } catch (error) {
    console.error('Error processing message status callback:', error.message);

    // Still return 200 to prevent Twilio retries
    // The error is logged and can be detected via Function logs
    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.setBody({
      success: false,
      error: error.message,
      messageSid: MessageSid,
    });

    return callback(null, response);
  }
};
