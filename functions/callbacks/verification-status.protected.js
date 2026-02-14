// ABOUTME: Status callback handler for Verify service verification events.
// ABOUTME: Logs all verification status callbacks to Sync for deep validation.

const { logToSync } = require(Runtime.getFunctions()['callbacks/helpers/sync-logger'].path);

/**
 * Handles Verify service status callbacks from Twilio.
 *
 * Verify sends status callbacks when verification status changes:
 * - pending: Verification code sent, waiting for user input
 * - approved: User entered correct code
 * - canceled: Verification was canceled
 * - max_attempts_reached: Too many failed attempts
 * - deleted: Verification was deleted
 * - expired: Verification timed out
 *
 * Callback payload includes:
 * - VerificationSid: The verification SID
 * - ServiceSid: The Verify service SID
 * - To: The phone number or email being verified
 * - Channel: sms, call, email, whatsapp
 * - Status: Current verification status
 * - Valid: Whether verification was successful
 *
 * Note: Verify callbacks are only sent if configured on the Verify Service.
 * The callback URL is set via the Verify Service configuration.
 *
 * @see https://www.twilio.com/docs/verify/api/verification#verification-status-values
 */
exports.handler = async function (context, event, callback) {
  console.log('Verification status callback received:', JSON.stringify(event));

  const {
    VerificationSid,
    ServiceSid,
    To,
    Channel,
    Status,
    Valid,
    AccountSid,
    DateCreated,
    DateUpdated,
  } = event;

  if (!VerificationSid) {
    console.log('Missing VerificationSid in callback');
    return callback(null, { success: false, error: 'Missing VerificationSid' });
  }

  try {
    // Log to Sync for deep validation
    await logToSync(context, 'verification', VerificationSid, {
      status: Status,
      verificationSid: VerificationSid,
      serviceSid: ServiceSid,
      to: To,
      channel: Channel,
      valid: Valid,
      accountSid: AccountSid,
      dateCreated: DateCreated,
      dateUpdated: DateUpdated,
      rawEvent: JSON.parse(JSON.stringify(event)),
    });

    // Log for Function execution logs
    const validInfo = Valid !== undefined ? ` (valid: ${Valid})` : '';
    console.log(`Verification ${VerificationSid} status: ${Status}${validInfo}`);

    // Return success
    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({ success: true, status: Status }));

    return callback(null, response);
  } catch (error) {
    console.error('Error processing verification status callback:', error.message);

    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({
      success: false,
      error: error.message,
      verificationSid: VerificationSid,
    }));

    return callback(null, response);
  }
};
