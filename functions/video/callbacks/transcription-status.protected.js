// ABOUTME: Status callback handler for video room transcription events.
// ABOUTME: Logs all transcription callbacks to Sync for deep validation.

const { logToSync } = require(Runtime.getFunctions()['callbacks/helpers/sync-logger'].path);

/**
 * Handles video room transcription status callbacks from Twilio.
 *
 * Twilio sends transcription callbacks for speech-to-text events:
 * - transcription-started: Transcription service activated for room
 * - transcription-stopped: Transcription service deactivated
 * - transcription-sentence: Speech transcribed (partial or final)
 *
 * Sentence types:
 * - partial: Interim transcription, may change
 * - final: Confirmed transcription with speaker attribution
 *
 * @see https://www.twilio.com/docs/video/api/status-callbacks#transcription-callbacks
 */
exports.handler = async function (context, event, callback) {
  console.log('Transcription callback received:', JSON.stringify(event));

  const {
    RoomSid,
    RoomName,
    StatusCallbackEvent,
    SequenceNumber,
    Timestamp,
    AccountSid,
    // Transcription-specific fields
    TranscriptionSid,
    TranscriptSid,
    ParticipantSid,
    ParticipantIdentity,
    TrackSid,
    // Sentence fields (for transcription-sentence events)
    SentenceIndex,
    SentenceStatus, // 'partial' or 'final'
    TranscriptionText,
    LanguageCode,
    Confidence,
    StartTime,
    EndTime,
  } = event;

  if (!RoomSid) {
    console.log('Missing RoomSid in transcription callback');
    return callback(null, { success: false, error: 'Missing RoomSid' });
  }

  try {
    const safeEvent = JSON.parse(JSON.stringify(event));

    // Log to Sync using room-based document for correlation with other callbacks
    await logToSync(context, 'video-transcription', RoomSid, {
      event: StatusCallbackEvent,
      roomName: RoomName,
      sequenceNumber: SequenceNumber,
      timestamp: Timestamp,
      accountSid: AccountSid,
      transcriptionSid: TranscriptionSid,
      transcriptSid: TranscriptSid,
      participantSid: ParticipantSid,
      participantIdentity: ParticipantIdentity,
      trackSid: TrackSid,
      sentenceIndex: SentenceIndex,
      sentenceStatus: SentenceStatus,
      text: TranscriptionText,
      languageCode: LanguageCode,
      confidence: Confidence,
      startTime: StartTime,
      endTime: EndTime,
      rawEvent: safeEvent,
    });

    // Log based on event type
    if (StatusCallbackEvent === 'transcription-sentence') {
      const statusLabel = SentenceStatus === 'final' ? '[FINAL]' : '[partial]';
      console.log(
        `Room ${RoomName}: ${statusLabel} ${ParticipantIdentity || 'unknown'}: "${TranscriptionText || ''}"`
      );
    } else {
      console.log(`Room ${RoomName} (${RoomSid}): ${StatusCallbackEvent}`);
    }

    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({
      success: true,
      event: StatusCallbackEvent,
      sentenceStatus: SentenceStatus,
    }));

    return callback(null, response);
  } catch (error) {
    console.log('Error processing transcription callback:', error.message);

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
