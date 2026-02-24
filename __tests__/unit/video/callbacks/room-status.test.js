// ABOUTME: Unit tests for video room-status callback handler.
// ABOUTME: Tests room event logging to Sync and error handling.

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

describe('video/callbacks/room-status callback', () => {
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

    handler = require('../../../../functions/video/callbacks/room-status.protected').handler;
    callback = jest.fn();
  });

  afterEach(() => {
    delete global.Runtime;
  });

  it('should log room-created event to Sync and return success', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      RoomSid: 'RM1234567890abcdef1234567890abcdef',
      RoomName: 'test-room',
      RoomStatus: 'in-progress',
      RoomType: 'group',
      StatusCallbackEvent: 'room-created',
      AccountSid: 'AC123',
    };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.event).toBe('room-created');
  });

  it('should log room-ended event to Sync', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      RoomSid: 'RM1234567890abcdef1234567890abcdef',
      RoomName: 'test-room',
      RoomStatus: 'completed',
      RoomType: 'group',
      StatusCallbackEvent: 'room-ended',
      Duration: '300',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'video-room',
      'RM1234567890abcdef1234567890abcdef',
      expect.objectContaining({
        status: 'completed',
        event: 'room-ended',
        roomName: 'test-room',
        roomType: 'group',
        duration: '300',
      })
    );
  });

  it('should log participant-connected event with identity', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      RoomSid: 'RM123',
      RoomName: 'test-room',
      RoomStatus: 'in-progress',
      StatusCallbackEvent: 'participant-connected',
      ParticipantSid: 'PA123',
      ParticipantIdentity: 'alice',
      ParticipantStatus: 'connected',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'video-room',
      'RM123',
      expect.objectContaining({
        event: 'participant-connected',
        participantSid: 'PA123',
        participantIdentity: 'alice',
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('alice')
    );
    consoleSpy.mockRestore();
  });

  it('should log recording events', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      RoomSid: 'RM123',
      RoomName: 'test-room',
      StatusCallbackEvent: 'recording-started',
      RecordingSid: 'RT123',
      RecordingStatus: 'processing',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'video-room',
      'RM123',
      expect.objectContaining({
        event: 'recording-started',
        recordingSid: 'RT123',
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Recording RT123')
    );
    consoleSpy.mockRestore();
  });

  it('should return error if RoomSid is missing', async () => {
    const context = {};
    const event = { StatusCallbackEvent: 'room-created' };

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
      StatusCallbackEvent: 'room-created',
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
      StatusCallbackEvent: 'room-created',
    };

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.headers['Content-Type']).toBe('application/json');
  });
});
