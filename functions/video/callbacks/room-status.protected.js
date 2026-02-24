// ABOUTME: Status callback handler for video room lifecycle events.
// ABOUTME: Logs all room status callbacks to Sync for deep validation.

const { logToSync } = require(Runtime.getFunctions()['callbacks/helpers/sync-logger'].path);

/**
 * Handles video room status callbacks from Twilio.
 *
 * Twilio sends status callbacks for room lifecycle events:
 * - room-created: Room was created
 * - room-ended: Room ended (all participants left or timeout)
 * - participant-connected: Participant joined the room
 * - participant-disconnected: Participant left the room
 * - recording-started: Recording began
 * - recording-completed: Recording finished
 * - recording-failed: Recording failed
 *
 * @see https://www.twilio.com/docs/video/api/status-callbacks
 */
exports.handler = async function (context, event, callback) {
  console.log('Room status callback received:', JSON.stringify(event));

  const {
    RoomSid,
    RoomName,
    RoomStatus,
    RoomType,
    StatusCallbackEvent,
    SequenceNumber,
    Timestamp,
    AccountSid,
    Duration,
    ParticipantSid,
    ParticipantIdentity,
    ParticipantStatus,
    ParticipantDuration,
    TrackSid,
    TrackKind,
    RecordingSid,
    RecordingStatus,
    RecordingDuration,
  } = event;

  if (!RoomSid) {
    console.log('Missing RoomSid in callback');
    return callback(null, { success: false, error: 'Missing RoomSid' });
  }

  try {
    const safeEvent = JSON.parse(JSON.stringify(event));

    await logToSync(context, 'video-room', RoomSid, {
      status: RoomStatus,
      event: StatusCallbackEvent,
      roomName: RoomName,
      roomType: RoomType,
      duration: Duration,
      sequenceNumber: SequenceNumber,
      timestamp: Timestamp,
      accountSid: AccountSid,
      participantSid: ParticipantSid,
      participantIdentity: ParticipantIdentity,
      participantStatus: ParticipantStatus,
      participantDuration: ParticipantDuration,
      trackSid: TrackSid,
      trackKind: TrackKind,
      recordingSid: RecordingSid,
      recordingStatus: RecordingStatus,
      recordingDuration: RecordingDuration,
      rawEvent: safeEvent,
    });

    if (StatusCallbackEvent.startsWith('participant-')) {
      console.log(`Room ${RoomName}: ${StatusCallbackEvent} - ${ParticipantIdentity}`);
    } else if (StatusCallbackEvent.startsWith('recording-')) {
      console.log(`Room ${RoomName}: ${StatusCallbackEvent} - Recording ${RecordingSid}`);
    } else {
      console.log(`Room ${RoomName} (${RoomSid}): ${StatusCallbackEvent} - status: ${RoomStatus}`);
    }

    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({ success: true, event: StatusCallbackEvent }));

    return callback(null, response);
  } catch (error) {
    console.log('Error processing room status callback:', error.message);

    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({
      success: false,
      error: error.message,
      roomSid: RoomSid,
    }));

    return callback(null, response);
  }
};
