// ABOUTME: Universal fallback handler for when primary webhooks fail.
// ABOUTME: Logs all fallback invocations to Sync and returns safe TwiML.

const { logToSync } = require(Runtime.getFunctions()['callbacks/helpers/sync-logger'].path);

/**
 * Universal fallback handler for Twilio webhooks.
 *
 * This handler is invoked when:
 * - The primary webhook URL fails (timeout, 5xx error, invalid TwiML)
 * - The primary webhook returns non-2xx status code
 * - The primary webhook returns invalid content
 *
 * Fallback payload includes:
 * - ErrorCode: The error that triggered fallback
 * - ErrorUrl: The URL that failed
 * - For calls: CallSid, To, From, Direction
 * - For messages: MessageSid, To, From
 *
 * The fallback handler should:
 * 1. Log the failure for debugging
 * 2. Return appropriate response (TwiML for voice, empty for SMS)
 * 3. NOT fail itself (that would cause a cascade)
 *
 * @see https://www.twilio.com/docs/voice/twiml#fallback-url
 * @see https://www.twilio.com/docs/messaging/twiml#fallback-url
 */
exports.handler = async function (context, event, callback) {
  console.log('Fallback handler invoked:', JSON.stringify(event));

  const {
    ErrorCode,
    ErrorUrl,
    ErrorMessage,
    CallSid,
    MessageSid,
    To,
    From,
    Direction,
    AccountSid,
  } = event;

  // Determine resource type and SID
  const isVoice = !!CallSid;
  const resourceSid = CallSid || MessageSid || 'unknown';
  const resourceType = isVoice ? 'call' : MessageSid ? 'message' : 'unknown';

  try {
    // Log to Sync for deep validation
    // This is critical - fallback invocation means primary webhook failed
    await logToSync(context, `fallback-${resourceType}`, resourceSid, {
      status: 'fallback_invoked',
      errorCode: ErrorCode,
      errorUrl: ErrorUrl,
      errorMessage: ErrorMessage,
      resourceType,
      resourceSid,
      to: To,
      from: From,
      direction: Direction,
      accountSid: AccountSid,
      rawEvent: JSON.parse(JSON.stringify(event)),
    });

    // Log prominently for Function execution logs
    console.log(`FALLBACK: ${resourceType} ${resourceSid}`);
    console.log(`  Error: ${ErrorCode} - ${ErrorMessage || 'No message'}`);
    console.log(`  Failed URL: ${ErrorUrl}`);

    if (isVoice) {
      // Return safe TwiML for voice calls
      // This prevents the call from dropping
      const twiml = new Twilio.twiml.VoiceResponse();
      twiml.say(
        { voice: 'Polly.Amy' },
        'We apologize, but we are experiencing technical difficulties. Please try again later.'
      );
      twiml.hangup();

      const response = new Twilio.Response();
      response.setStatusCode(200);
      response.appendHeader('Content-Type', 'text/xml');
      response.setBody(twiml.toString());

      return callback(null, response);
    } else {
      // For messages, just acknowledge receipt
      // Twilio doesn't expect TwiML for message fallbacks
      const response = new Twilio.Response();
      response.setStatusCode(200);
      response.appendHeader('Content-Type', 'application/json');
      response.setBody(JSON.stringify({
        success: true,
        fallback: true,
        resourceType,
        resourceSid,
        errorCode: ErrorCode,
      }));

      return callback(null, response);
    }
  } catch (error) {
    console.log('Error in fallback handler (this is bad):', error.message);

    // Return something safe even if our logging failed
    if (isVoice) {
      const twiml = new Twilio.twiml.VoiceResponse();
      twiml.say('Please try again later.');
      twiml.hangup();

      const response = new Twilio.Response();
      response.setStatusCode(200);
      response.appendHeader('Content-Type', 'text/xml');
      response.setBody(twiml.toString());

      return callback(null, response);
    } else {
      return callback(null, { success: false, fallback: true });
    }
  }
};
