// ABOUTME: Unit tests for the universal fallback callback handler.
// ABOUTME: Tests voice TwiML generation, message handling, and Sync logging.

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

describe('fallback callback', () => {
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

    handler = require('../../../functions/callbacks/fallback.protected').handler;
    callback = jest.fn();
  });

  afterEach(() => {
    delete global.Runtime;
  });

  it('should return TwiML for voice call fallback', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      CallSid: 'CA1234567890abcdef1234567890abcdef',
      ErrorCode: '11200',
      ErrorUrl: 'https://example.com/handler',
      ErrorMessage: 'HTTP retrieval failure',
      To: '+15559876543',
      From: '+15551234567',
      Direction: 'inbound',
    };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.headers['Content-Type']).toBe('text/xml');
    expect(response.body).toContain('<Say');
    expect(response.body).toContain('technical difficulties');
    expect(response.body).toContain('<Hangup');
  });

  it('should log fallback to Sync with resource type call', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      CallSid: 'CA1234567890abcdef1234567890abcdef',
      ErrorCode: '11200',
      ErrorUrl: 'https://example.com/handler',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'fallback-call',
      'CA1234567890abcdef1234567890abcdef',
      expect.objectContaining({
        status: 'fallback_invoked',
        errorCode: '11200',
        resourceType: 'call',
      })
    );
  });

  it('should return JSON for message fallback', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      MessageSid: 'SM1234567890abcdef1234567890abcdef',
      ErrorCode: '11200',
      ErrorUrl: 'https://example.com/handler',
    };

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.fallback).toBe(true);
    expect(body.resourceType).toBe('message');
  });

  it('should handle unknown resource type', async () => {
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      ErrorCode: '11200',
      ErrorUrl: 'https://example.com/handler',
    };

    await handler(context, event, callback);

    expect(mockLogToSync).toHaveBeenCalledWith(
      context,
      'fallback-unknown',
      'unknown',
      expect.objectContaining({ resourceType: 'unknown' })
    );
  });

  it('should return safe TwiML when Sync logging fails for voice', async () => {
    mockLogToSync.mockRejectedValue(new Error('Sync unavailable'));
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      CallSid: 'CA1234567890abcdef1234567890abcdef',
      ErrorCode: '11200',
    };

    await handler(context, event, callback);

    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.body).toContain('<Say');
    expect(response.body).toContain('<Hangup');
  });

  it('should return fallback JSON when Sync logging fails for message', async () => {
    mockLogToSync.mockRejectedValue(new Error('Sync unavailable'));
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      MessageSid: 'SM1234567890abcdef1234567890abcdef',
      ErrorCode: '11200',
    };

    await handler(context, event, callback);

    const [, result] = callback.mock.calls[0];
    expect(result.success).toBe(false);
    expect(result.fallback).toBe(true);
  });

  it('should log fallback details prominently', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const context = { TWILIO_SYNC_SERVICE_SID: 'IS123' };
    const event = {
      CallSid: 'CAfallback',
      ErrorCode: '11200',
      ErrorUrl: 'https://example.com/broken',
      ErrorMessage: 'Timeout',
    };

    await handler(context, event, callback);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('FALLBACK'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('11200'));
    consoleSpy.mockRestore();
  });
});
