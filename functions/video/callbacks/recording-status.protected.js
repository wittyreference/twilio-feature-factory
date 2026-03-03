// ABOUTME: Status callback handler for video recording events.
// ABOUTME: Logs track recording status to Sync for deep validation.

const { logToSync } = require(Runtime.getFunctions()['callbacks/helpers/sync-logger'].path);

/**
 * Handles video recording status callbacks from Twilio.
 *
 * Twilio sends status callbacks for track recordings:
 * - recording-started: Recording began for a track
 * - recording-completed: Recording finished
 * - recording-failed: Recording failed
 *
 * Track recordings are per-participant, per-track (audio/video).
 * Use Compositions to combine recordings into a single file.
 *
 * @see https://www.twilio.com/docs/video/api/recording-resource
 */
exports.handler = async function (context, event, callback) {
  console.log('Recording status callback received:', JSON.stringify(event));

  const {
    RecordingSid,
    RoomSid,
    RoomName,
    ParticipantSid,
    ParticipantIdentity,
    TrackSid,
    RecordingStatus,
    StatusCallbackEvent,
    Container,
    Codec,
    Duration,
    Size,
    MediaUri,
    Type,
    SourceSid,
    Timestamp,
    AccountSid,
  } = event;

  if (!RecordingSid) {
    console.log('Missing RecordingSid in callback');
    return callback(null, { success: false, error: 'Missing RecordingSid' });
  }

  try {
    const safeEvent = JSON.parse(JSON.stringify(event));

    await logToSync(context, 'video-recording', RecordingSid, {
      status: RecordingStatus,
      event: StatusCallbackEvent,
      roomSid: RoomSid,
      roomName: RoomName,
      participantSid: ParticipantSid,
      participantIdentity: ParticipantIdentity,
      trackSid: TrackSid,
      container: Container,
      codec: Codec,
      duration: Duration,
      size: Size,
      mediaUri: MediaUri,
      type: Type,
      sourceSid: SourceSid,
      timestamp: Timestamp,
      accountSid: AccountSid,
      rawEvent: safeEvent,
    });

    const durationInfo = Duration ? ` (${Duration}s)` : '';
    console.log(`Recording ${RecordingSid} for ${ParticipantIdentity}: ${StatusCallbackEvent}${durationInfo}`);

    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({
      success: true,
      status: RecordingStatus,
      event: StatusCallbackEvent
    }));

    return callback(null, response);
  } catch (error) {
    console.log('Error processing recording status callback:', error.message);

    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({
      success: false,
      error: error.message,
      recordingSid: RecordingSid,
    }));

    return callback(null, response);
  }
};
