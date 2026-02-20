// ABOUTME: Unit tests for verification-status callback handler.
// ABOUTME: Tests Verify service status logging to Sync and error handling.

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

describe('verification-status callback', () => {
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

    handler = require('../../../functions/callbacks/verification-status.protected').handler;
    callback = jest.fn();
  });

  afterEach(() => {
    delete global.Runtime;
  });

  it('should log verification status to Sync and return success', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      VerificationSid: 'VE1234567890abcdef1234567890abcdef',
      ServiceSid: 'VA123',
      To: '+15559876543',
      Channel: 'sms',
      Status: 'approved',
      Valid: true,
      AccountSid: 'AC123',
    };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.status).toBe('approved');
  });

  it('should pass verification data to logToSync', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      VerificationSid: 'VE123',
      ServiceSid: 'VA123',
      To: '+15559876543',
      Channel: 'call',
      Status: 'pending',
      Valid: false,
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'verification',
      'VE123',
      expect.objectContaining({
        status: 'pending',
        channel: 'call',
        valid: false,
        to: '+15559876543',
      })
    );
  });

  it('should return error if VerificationSid is missing', async () => {
    const context = {};
    const event = { Status: 'approved' };

    await handler(context, event, callback);

    const [, result] = callback.mock.calls[0];
    expect(result.success).toBe(false);
    expect(result.error).toBe('Missing VerificationSid');
    expect(mockLogToSync).not.toHaveBeenCalled();
  });

  it('should include validity info in log when Valid present', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      VerificationSid: 'VE123',
      Status: 'approved',
      Valid: true,
    };

    await handler(context, event, callback);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('valid: true')
    );
    consoleSpy.mockRestore();
  });

  it('should log status without valid info when Valid not present', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      VerificationSid: 'VE123',
      Status: 'pending',
    };

    await handler(context, event, callback);

    const statusLogs = consoleSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('VE123 status:')
    );
    expect(statusLogs.length).toBe(1);
    expect(statusLogs[0][0]).not.toContain('valid:');
    consoleSpy.mockRestore();
  });

  it('should handle logToSync errors gracefully', async () => {
    mockLogToSync.mockRejectedValue(new Error('Sync down'));
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      VerificationSid: 'VE123',
      Status: 'approved',
    };

    await handler(context, event, callback);

    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.verificationSid).toBe('VE123');
  });
});
