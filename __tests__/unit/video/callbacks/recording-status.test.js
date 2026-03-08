// ABOUTME: Unit tests for video recording-status callback handler.
// ABOUTME: Tests recording event logging to Sync and error handling.

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

describe('video/callbacks/recording-status callback', () => {
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

    handler = require('../../../../functions/video/callbacks/recording-status.protected').handler;
    callback = jest.fn();
  });

  afterEach(() => {
    delete global.Runtime;
  });

  it('should log recording-completed event to Sync and return success', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      RecordingSid: 'RT1234567890abcdef1234567890abcdef',
      RoomSid: 'RM123',
      RoomName: 'test-room',
      ParticipantSid: 'PA123',
      ParticipantIdentity: 'alice',
      RecordingStatus: 'completed',
      StatusCallbackEvent: 'recording-completed',
      Duration: '60',
      Size: '1048576',
      Container: 'mka',
      Codec: 'opus',
      Type: 'audio',
      AccountSid: 'AC123',
    };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.status).toBe('completed');
    expect(body.event).toBe('recording-completed');
  });

  it('should pass recording data to logToSync', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      RecordingSid: 'RT123',
      RoomSid: 'RM123',
      RoomName: 'test-room',
      ParticipantSid: 'PA123',
      ParticipantIdentity: 'alice',
      TrackSid: 'MT123',
      RecordingStatus: 'completed',
      StatusCallbackEvent: 'recording-completed',
      Duration: '60',
      Container: 'mkv',
      Codec: 'vp8',
      Type: 'video',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'video-recording',
      'RT123',
      expect.objectContaining({
        status: 'completed',
        event: 'recording-completed',
        roomSid: 'RM123',
        roomName: 'test-room',
        participantSid: 'PA123',
        participantIdentity: 'alice',
        trackSid: 'MT123',
        duration: '60',
        container: 'mkv',
        codec: 'vp8',
        type: 'video',
      })
    );
  });

  it('should log duration info when recording completes', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      RecordingSid: 'RT123',
      ParticipantIdentity: 'bob',
      StatusCallbackEvent: 'recording-completed',
      Duration: '45',
    };

    await handler(context, event, callback);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('45s')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('bob')
    );
    consoleSpy.mockRestore();
  });

  it('should return error if RecordingSid is missing', async () => {
    const context = {};
    const event = { StatusCallbackEvent: 'recording-completed' };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [, result] = callback.mock.calls[0];
    expect(result.success).toBe(false);
    expect(result.error).toBe('Missing RecordingSid');
    expect(mockLogToSync).not.toHaveBeenCalled();
  });

  it('should handle logToSync errors gracefully', async () => {
    mockLogToSync.mockRejectedValue(new Error('Sync unavailable'));
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      RecordingSid: 'RT123',
      StatusCallbackEvent: 'recording-completed',
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
      RecordingSid: 'RT123',
      StatusCallbackEvent: 'recording-completed',
    };

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.headers['Content-Type']).toBe('application/json');
  });
});
