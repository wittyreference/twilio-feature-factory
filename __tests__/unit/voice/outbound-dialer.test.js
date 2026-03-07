// ABOUTME: Unit tests for the outbound-dialer voice function.
// ABOUTME: Tests parameter validation, client.calls.create invocation, and error handling.

// Mock the Twilio client
jest.mock('twilio', () => {
  const mockCallsCreate = jest.fn();

  const TwilioMock = jest.fn(() => ({
    calls: {
      create: mockCallsCreate
    }
  }));

  // Expose mock for test assertions
  TwilioMock.mockCallsCreate = mockCallsCreate;

  // Keep Response class
  TwilioMock.Response = class {
    constructor() {
      this.statusCode = 200;
      this.body = '';
      this.headers = {};
    }
    setStatusCode(code) { this.statusCode = code; }
    setBody(body) { this.body = typeof body === 'object' ? JSON.stringify(body) : body; }
    appendHeader(key, value) { this.headers[key] = value; }
  };

  return TwilioMock;
});

global.Twilio = require('twilio');

const { handler } = require('../../../functions/voice/outbound-dialer');

describe('outbound-dialer handler', () => {
  let context;
  let callback;
  let mockCallsCreate;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCallsCreate = require('twilio').mockCallsCreate;

    context = {
      TWILIO_PHONE_NUMBER: '+15551234567',
      DOMAIN_NAME: 'prototype-2504-dev.twil.io',
      getTwilioClient: () => new (require('twilio'))()
    };
    callback = jest.fn();
  });

  it('should return 400 when CustomerNumber is missing', async () => {
    const event = {};

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Missing CustomerNumber');
  });

  it('should accept To as alias for CustomerNumber', async () => {
    mockCallsCreate.mockResolvedValue({ sid: 'CA1234567890' });

    const event = { To: '+15559876543' };

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(200);
    expect(mockCallsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+15559876543',
      })
    );
  });

  it('should call client.calls.create with correct params', async () => {
    mockCallsCreate.mockResolvedValue({ sid: 'CA1234567890' });

    const event = { CustomerNumber: '+15559876543' };

    await handler(context, event, callback);

    expect(mockCallsCreate).toHaveBeenCalledTimes(1);
    const createArgs = mockCallsCreate.mock.calls[0][0];

    expect(createArgs.to).toBe('+15559876543');
    expect(createArgs.from).toBe('+15551234567');
    expect(createArgs.machineDetection).toBe('DetectMessageEnd');
    expect(createArgs.timeout).toBe(30);
    expect(createArgs.url).toContain('prototype-2504-dev.twil.io/voice/outbound-customer-leg');
    expect(createArgs.statusCallback).toContain('prototype-2504-dev.twil.io/callbacks/call-status');
    expect(createArgs.statusCallbackEvent).toEqual(['initiated', 'ringing', 'answered', 'completed']);
  });

  it('should include conference name in customer leg URL', async () => {
    mockCallsCreate.mockResolvedValue({ sid: 'CA1234567890' });

    const event = { CustomerNumber: '+15559876543' };

    await handler(context, event, callback);

    const createArgs = mockCallsCreate.mock.calls[0][0];
    expect(createArgs.url).toContain('ConferenceName=');
  });

  it('should return conference name and call SID on success', async () => {
    mockCallsCreate.mockResolvedValue({ sid: 'CA1234567890' });

    const event = { CustomerNumber: '+15559876543' };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.conferenceName).toMatch(/^outbound-\d+-[a-z0-9]+$/);
    expect(body.customerCallSid).toBe('CA1234567890');
    expect(body.agentNumber).toBe('+15551234567');
  });

  it('should use custom From number when provided', async () => {
    mockCallsCreate.mockResolvedValue({ sid: 'CA1234567890' });

    const event = {
      CustomerNumber: '+15559876543',
      From: '+15550000000',
    };

    await handler(context, event, callback);

    expect(mockCallsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '+15550000000',
      })
    );
  });

  it('should use custom AgentNumber when provided', async () => {
    mockCallsCreate.mockResolvedValue({ sid: 'CA1234567890' });

    const event = {
      CustomerNumber: '+15559876543',
      AgentNumber: '+15558888888',
    };

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const body = JSON.parse(response.body);
    expect(body.agentNumber).toBe('+15558888888');
  });

  it('should return error response on API failure', async () => {
    const apiError = new Error('Invalid phone number');
    apiError.status = 400;
    mockCallsCreate.mockRejectedValue(apiError);

    const event = { CustomerNumber: 'invalid-number' };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid phone number');
  });

  it('should default to 500 when API error has no status', async () => {
    const apiError = new Error('Network failure');
    mockCallsCreate.mockRejectedValue(apiError);

    const event = { CustomerNumber: '+15559876543' };

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(500);
  });

  it('should set Content-Type to application/json', async () => {
    mockCallsCreate.mockResolvedValue({ sid: 'CA1234567890' });

    const event = { CustomerNumber: '+15559876543' };

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.headers['Content-Type']).toBe('application/json');
  });
});
