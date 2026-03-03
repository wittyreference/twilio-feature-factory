// ABOUTME: Unit tests for video composition-status callback handler.
// ABOUTME: Tests composition event logging to Sync and error handling.

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

describe('video/callbacks/composition-status callback', () => {
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

    handler = require('../../../../functions/video/callbacks/composition-status.protected').handler;
    callback = jest.fn();
  });

  afterEach(() => {
    delete global.Runtime;
  });

  it('should log composition-available event to Sync and return success', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      CompositionSid: 'CJ1234567890abcdef1234567890abcdef',
      RoomSid: 'RM123',
      CompositionStatus: 'completed',
      StatusCallbackEvent: 'composition-available',
      MediaUri: '/v1/Compositions/CJ123/Media',
      Duration: '120',
      Size: '5242880',
      Resolution: '1280x720',
      Format: 'mp4',
      AccountSid: 'AC123',
    };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.status).toBe('completed');
    expect(body.event).toBe('composition-available');
  });

  it('should pass composition data to logToSync', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      CompositionSid: 'CJ123',
      RoomSid: 'RM123',
      CompositionStatus: 'completed',
      StatusCallbackEvent: 'composition-available',
      MediaUri: '/v1/Compositions/CJ123/Media',
      Duration: '120',
      Resolution: '1280x720',
      Format: 'mp4',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'video-composition',
      'CJ123',
      expect.objectContaining({
        status: 'completed',
        event: 'composition-available',
        roomSid: 'RM123',
        mediaUri: '/v1/Compositions/CJ123/Media',
        duration: '120',
        resolution: '1280x720',
        format: 'mp4',
      })
    );
  });

  it('should log progress percentage for processing events', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      CompositionSid: 'CJ123',
      CompositionStatus: 'processing',
      StatusCallbackEvent: 'composition-progress',
      PercentageDone: '50',
    };

    await handler(context, event, callback);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('50%')
    );
    consoleSpy.mockRestore();
  });

  it('should log error info when composition fails', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      CompositionSid: 'CJfailed',
      CompositionStatus: 'failed',
      StatusCallbackEvent: 'composition-failed',
      ErrorCode: '53001',
      ErrorMessage: 'Insufficient recordings',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'video-composition',
      'CJfailed',
      expect.objectContaining({
        errorCode: '53001',
        errorMessage: 'Insufficient recordings',
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error 53001')
    );
    consoleSpy.mockRestore();
  });

  it('should return error if CompositionSid is missing', async () => {
    const context = {};
    const event = { StatusCallbackEvent: 'composition-available' };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [, result] = callback.mock.calls[0];
    expect(result.success).toBe(false);
    expect(result.error).toBe('Missing CompositionSid');
    expect(mockLogToSync).not.toHaveBeenCalled();
  });

  it('should handle logToSync errors gracefully', async () => {
    mockLogToSync.mockRejectedValue(new Error('Sync unavailable'));
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      CompositionSid: 'CJ123',
      StatusCallbackEvent: 'composition-available',
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
      CompositionSid: 'CJ123',
      StatusCallbackEvent: 'composition-available',
    };

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.headers['Content-Type']).toBe('application/json');
  });
});
