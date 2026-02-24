// ABOUTME: Status callback handler for video composition completion events.
// ABOUTME: Logs composition status to Sync for tracking when compositions complete.

const { logToSync } = require(Runtime.getFunctions()['callbacks/helpers/sync-logger'].path);

/**
 * Handles video composition status callbacks from Twilio.
 *
 * Twilio sends status callbacks for composition lifecycle:
 * - composition-enqueued: Composition queued for processing
 * - composition-hook-failed: Composition hook failed
 * - composition-started: Composition processing started
 * - composition-progress: Composition progress update
 * - composition-available: Composition completed successfully
 * - composition-failed: Composition failed
 *
 * Note: Compositions can only be created AFTER a room ends.
 *
 * @see https://www.twilio.com/docs/video/api/compositions-resource#statuscallback
 */
exports.handler = async function (context, event, callback) {
  console.log('Composition status callback received:', JSON.stringify(event));

  const {
    CompositionSid,
    RoomSid,
    CompositionStatus,
    StatusCallbackEvent,
    MediaUri,
    Duration,
    Size,
    Resolution,
    Format,
    PercentageDone,
    ErrorCode,
    ErrorMessage,
    Timestamp,
    AccountSid,
  } = event;

  if (!CompositionSid) {
    console.log('Missing CompositionSid in callback');
    return callback(null, { success: false, error: 'Missing CompositionSid' });
  }

  try {
    const safeEvent = JSON.parse(JSON.stringify(event));

    await logToSync(context, 'video-composition', CompositionSid, {
      status: CompositionStatus,
      event: StatusCallbackEvent,
      roomSid: RoomSid,
      mediaUri: MediaUri,
      duration: Duration,
      size: Size,
      resolution: Resolution,
      format: Format,
      percentageDone: PercentageDone,
      errorCode: ErrorCode,
      errorMessage: ErrorMessage,
      timestamp: Timestamp,
      accountSid: AccountSid,
      rawEvent: safeEvent,
    });

    if (ErrorCode) {
      console.log(`Composition ${CompositionSid} ${CompositionStatus}: Error ${ErrorCode} - ${ErrorMessage}`);
    } else {
      const progress = PercentageDone ? ` (${PercentageDone}%)` : '';
      console.log(`Composition ${CompositionSid} status: ${CompositionStatus}${progress}`);
    }

    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({
      success: true,
      status: CompositionStatus,
      event: StatusCallbackEvent
    }));

    return callback(null, response);
  } catch (error) {
    console.log('Error processing composition status callback:', error.message);

    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({
      success: false,
      error: error.message,
      compositionSid: CompositionSid,
    }));

    return callback(null, response);
  }
};
