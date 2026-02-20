// ABOUTME: Unit tests for call-status callback handler.
// ABOUTME: Tests call status logging to Sync and error handling.

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
  '../../../functions/callbacks/helpers/sync-logger.private'
);

describe('call-status callback', () => {
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

    handler = require('../../../functions/callbacks/call-status.protected').handler;
    callback = jest.fn();
  });

  afterEach(() => {
    delete global.Runtime;
  });

  it('should log call status to Sync and return success', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      CallSid: 'CA1234567890abcdef1234567890abcdef',
      CallStatus: 'completed',
      To: '+15559876543',
      From: '+15551234567',
      Direction: 'inbound',
      CallDuration: '30',
      AccountSid: 'AC123',
    };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.status).toBe('completed');
  });

  it('should pass call data to logToSync', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      CallSid: 'CA1234567890abcdef1234567890abcdef',
      CallStatus: 'in-progress',
      To: '+15559876543',
      From: '+15551234567',
      Direction: 'outbound-api',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledTimes(1);
    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'call',
      'CA1234567890abcdef1234567890abcdef',
      expect.objectContaining({
        status: 'in-progress',
        to: '+15559876543',
        from: '+15551234567',
        direction: 'outbound-api',
      })
    );
  });

  it('should return error if CallSid is missing', async () => {
    const context = {};
    const event = { CallStatus: 'completed' };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [, result] = callback.mock.calls[0];
    expect(result.success).toBe(false);
    expect(result.error).toBe('Missing CallSid');
    expect(mockLogToSync).not.toHaveBeenCalled();
  });

  it('should include error info in log when ErrorCode present', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      CallSid: 'CAfailed',
      CallStatus: 'failed',
      ErrorCode: '31005',
      ErrorMessage: 'Connection error',
    };

    await handler(context, event, callback);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error 31005')
    );
    consoleSpy.mockRestore();
  });

  it('should log duration when call completes', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      CallSid: 'CAdone',
      CallStatus: 'completed',
      CallDuration: '45',
    };

    await handler(context, event, callback);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('45s')
    );
    consoleSpy.mockRestore();
  });

  it('should handle logToSync errors gracefully', async () => {
    mockLogToSync.mockRejectedValue(new Error('Sync unavailable'));
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      CallSid: 'CA1234567890abcdef1234567890abcdef',
      CallStatus: 'completed',
    };

    await handler(context, event, callback);

    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Sync unavailable');
  });

  it('should include recording info when present', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      CallSid: 'CArec',
      CallStatus: 'completed',
      RecordingUrl: 'https://api.twilio.com/recordings/RE123',
      RecordingSid: 'RE123',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'call',
      'CArec',
      expect.objectContaining({
        recordingUrl: 'https://api.twilio.com/recordings/RE123',
        recordingSid: 'RE123',
      })
    );
  });
});
