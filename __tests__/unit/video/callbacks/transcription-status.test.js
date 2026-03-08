// ABOUTME: Unit tests for video transcription-status callback handler.
// ABOUTME: Tests transcription event logging to Sync and error handling.

const path = require('path');
const Twilio = require('twilio');

// Add Response class (normally provided by Twilio serverless runtime)
Twilio.Response = class MockResponse {
  constructor() { this.statusCode = 200; this.body = ''; this.headers = {}; }
  setStatusCode(code) { this.statusCode = code; }
  setBody(body) { this.body = body; }
  appendHeader(key, value) { this.headers[key] = value; }
};

global.Twilio = Twilio;

const SYNC_LOGGER_PATH = path.resolve(
  __dirname,
  '../../../../functions/callbacks/helpers/sync-logger.private'
);

describe('video/callbacks/transcription-status callback', () => {
  let handler;
  let mockLogToSync;
  let callback;

  beforeEach(() => {
    jest.resetModules();
    mockLogToSync = jest.fn().mockResolvedValue({});

    global.Runtime = {
      getFunctions: () => ({
        'callbacks/helpers/sync-logger': { path: SYNC_LOGGER_PATH },
      }),
    };

    jest.doMock(SYNC_LOGGER_PATH, () => ({
      logToSync: mockLogToSync,
    }));

    handler = require('../../../../functions/video/callbacks/transcription-status.protected').handler;
    callback = jest.fn();
  });

  afterEach(() => {
    delete global.Runtime;
  });

  it('should log transcription-started event to Sync and return success', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      RoomSid: 'RM1234567890abcdef1234567890abcdef',
      RoomName: 'test-room',
      StatusCallbackEvent: 'transcription-started',
      SequenceNumber: '1',
      Timestamp: '2024-01-01T00:00:00Z',
      AccountSid: 'AC123',
      TranscriptionSid: 'GT123',
      TranscriptSid: 'TR123',
      ParticipantSid: 'PA123',
      ParticipantIdentity: 'alice',
      TrackSid: 'MT123',
    };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.event).toBe('transcription-started');
  });

  it('should pass transcription data to logToSync', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      RoomSid: 'RM123',
      RoomName: 'test-room',
      StatusCallbackEvent: 'transcription-started',
      SequenceNumber: '1',
      Timestamp: '2024-01-01T00:00:00Z',
      AccountSid: 'AC123',
      TranscriptionSid: 'GT123',
      TranscriptSid: 'TR123',
      ParticipantSid: 'PA123',
      ParticipantIdentity: 'alice',
      TrackSid: 'MT123',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'video-transcription',
      'RM123',
      expect.objectContaining({
        event: 'transcription-started',
        roomName: 'test-room',
        sequenceNumber: '1',
        timestamp: '2024-01-01T00:00:00Z',
        accountSid: 'AC123',
        transcriptionSid: 'GT123',
        transcriptSid: 'TR123',
        participantSid: 'PA123',
        participantIdentity: 'alice',
        trackSid: 'MT123',
      })
    );
  });

  it('should log transcription-sentence with final status', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      RoomSid: 'RM123',
      RoomName: 'test-room',
      StatusCallbackEvent: 'transcription-sentence',
      TranscriptionSid: 'GT123',
      ParticipantSid: 'PA123',
      ParticipantIdentity: 'bob',
      SentenceIndex: '3',
      SentenceStatus: 'final',
      TranscriptionText: 'Hello world',
      LanguageCode: 'en-US',
      Confidence: '0.95',
      StartTime: '1.0',
      EndTime: '2.5',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'video-transcription',
      'RM123',
      expect.objectContaining({
        event: 'transcription-sentence',
        sentenceIndex: '3',
        sentenceStatus: 'final',
        text: 'Hello world',
        languageCode: 'en-US',
        confidence: '0.95',
        startTime: '1.0',
        endTime: '2.5',
      })
    );

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.success).toBe(true);
    expect(body.event).toBe('transcription-sentence');
    expect(body.sentenceStatus).toBe('final');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[FINAL]')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('bob')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Hello world')
    );
    consoleSpy.mockRestore();
  });

  it('should log transcription-sentence with partial status', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      RoomSid: 'RM123',
      RoomName: 'test-room',
      StatusCallbackEvent: 'transcription-sentence',
      ParticipantIdentity: 'alice',
      SentenceStatus: 'partial',
      TranscriptionText: 'Hello',
    };

    await handler(context, event, callback);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[partial]')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('alice')
    );
    consoleSpy.mockRestore();
  });

  it('should log non-sentence events with room info', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      RoomSid: 'RM123',
      RoomName: 'test-room',
      StatusCallbackEvent: 'transcription-stopped',
    };

    await handler(context, event, callback);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('transcription-stopped')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('RM123')
    );
    consoleSpy.mockRestore();
  });

  it('should return error if RoomSid is missing', async () => {
    const context = {};
    const event = { StatusCallbackEvent: 'transcription-started' };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [, result] = callback.mock.calls[0];
    expect(result.success).toBe(false);
    expect(result.error).toBe('Missing RoomSid');
    expect(mockLogToSync).not.toHaveBeenCalled();
  });

  it('should handle logToSync errors gracefully', async () => {
    mockLogToSync.mockRejectedValue(new Error('Sync unavailable'));
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      RoomSid: 'RM123',
      StatusCallbackEvent: 'transcription-started',
    };

    await handler(context, event, callback);

    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Sync unavailable');
  });

  it('should set Content-Type to application/json', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      RoomSid: 'RM123',
      StatusCallbackEvent: 'transcription-started',
    };

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.headers['Content-Type']).toBe('application/json');
  });
});
