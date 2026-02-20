// ABOUTME: Unit tests for message-status callback handler.
// ABOUTME: Tests SMS/MMS delivery status logging to Sync and error handling.

const path = require('path');
const Twilio = require('twilio');

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

describe('message-status callback', () => {
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

    handler = require('../../../functions/callbacks/message-status.protected').handler;
    callback = jest.fn();
  });

  afterEach(() => {
    delete global.Runtime;
  });

  it('should log message status to Sync and return success', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      MessageSid: 'SM1234567890abcdef1234567890abcdef',
      MessageStatus: 'delivered',
      To: '+15559876543',
      From: '+15551234567',
      AccountSid: 'AC123',
    };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.status).toBe('delivered');
  });

  it('should pass message data to logToSync', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      MessageSid: 'SM1234567890abcdef1234567890abcdef',
      MessageStatus: 'sent',
      To: '+15559876543',
      From: '+15551234567',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'message',
      'SM1234567890abcdef1234567890abcdef',
      expect.objectContaining({
        status: 'sent',
        to: '+15559876543',
        from: '+15551234567',
      })
    );
  });

  it('should return error if MessageSid is missing', async () => {
    const context = {};
    const event = { MessageStatus: 'delivered' };

    await handler(context, event, callback);

    const [, result] = callback.mock.calls[0];
    expect(result.success).toBe(false);
    expect(result.error).toBe('Missing MessageSid');
    expect(mockLogToSync).not.toHaveBeenCalled();
  });

  it('should log error info when ErrorCode present', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      MessageSid: 'SMfailed',
      MessageStatus: 'failed',
      ErrorCode: '30001',
      ErrorMessage: 'Queue overflow',
    };

    await handler(context, event, callback);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error 30001')
    );
    consoleSpy.mockRestore();
  });

  it('should handle logToSync errors gracefully', async () => {
    mockLogToSync.mockRejectedValue(new Error('Sync down'));
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      MessageSid: 'SM1234567890abcdef1234567890abcdef',
      MessageStatus: 'delivered',
    };

    await handler(context, event, callback);

    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.messageSid).toBe('SM1234567890abcdef1234567890abcdef');
  });

  it('should log status without error when no ErrorCode', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      MessageSid: 'SMok',
      MessageStatus: 'delivered',
    };

    await handler(context, event, callback);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('status: delivered')
    );
    consoleSpy.mockRestore();
  });
});
