// ABOUTME: Unit tests for the create-conference function.
// ABOUTME: Tests parameter validation and conference creation logic.

const Twilio = require('twilio');

global.Twilio = Twilio;

// Mock the Twilio client
jest.mock('twilio', () => {
  const mockParticipantCreate = jest.fn();
  const mockConferences = jest.fn(() => ({
    participants: {
      create: mockParticipantCreate
    }
  }));

  const TwilioMock = jest.fn(() => ({
    conferences: mockConferences
  }));

  // Expose mocks for test assertions
  TwilioMock.mockConferences = mockConferences;
  TwilioMock.mockParticipantCreate = mockParticipantCreate;

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

const { handler } = require('../../../functions/voice/create-conference.protected');

describe('create-conference handler', () => {
  let context;
  let callback;
  let mockParticipantCreate;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockParticipantCreate = require('twilio').mockParticipantCreate;

    context = {
      TWILIO_PHONE_NUMBER: '+15551234567',
      getTwilioClient: () => new (require('twilio'))()
    };
    callback = jest.fn();
  });

  it('should return 400 when To parameter is missing', async () => {
    const event = {};

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Missing required parameter: To');
  });

  it('should create conference with default options', async () => {
    mockParticipantCreate.mockResolvedValue({
      callSid: 'CA1234567890',
      accountSid: 'AC1234567890',
      status: 'queued'
    });

    const event = { To: '+15559876543' };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.callSid).toBe('CA1234567890');
    // Conference name should be auto-generated
    expect(body.conferenceName).toMatch(/^conf-\d+-[a-z0-9]+$/);
  });

  it('should use provided conference name', async () => {
    mockParticipantCreate.mockResolvedValue({
      callSid: 'CA1234567890',
      accountSid: 'AC1234567890',
      status: 'queued'
    });

    const event = {
      To: '+15559876543',
      ConferenceName: 'my-custom-conference'
    };

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const body = JSON.parse(response.body);
    expect(body.conferenceName).toBe('my-custom-conference');
  });

  it('should pass timeout and time limit settings', async () => {
    mockParticipantCreate.mockResolvedValue({
      callSid: 'CA1234567890',
      accountSid: 'AC1234567890',
      status: 'queued'
    });

    const event = {
      To: '+15559876543',
      Timeout: '20',
      TimeLimit: '300'
    };

    await handler(context, event, callback);

    expect(mockParticipantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 20,
        timeLimit: 300
      })
    );
  });

  it('should handle API errors gracefully', async () => {
    const apiError = new Error('Invalid phone number');
    apiError.status = 400;
    apiError.code = 21211;
    mockParticipantCreate.mockRejectedValue(apiError);

    const event = { To: 'invalid-number' };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Invalid phone number');
    expect(JSON.parse(response.body).code).toBe(21211);
  });

  it('should use context phone number as default From', async () => {
    mockParticipantCreate.mockResolvedValue({
      callSid: 'CA1234567890',
      accountSid: 'AC1234567890',
      status: 'queued'
    });

    const event = { To: '+15559876543' };

    await handler(context, event, callback);

    expect(mockParticipantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '+15551234567'
      })
    );
  });

  it('should allow custom From number', async () => {
    mockParticipantCreate.mockResolvedValue({
      callSid: 'CA1234567890',
      accountSid: 'AC1234567890',
      status: 'queued'
    });

    const event = {
      To: '+15559876543',
      From: '+15550000000'
    };

    await handler(context, event, callback);

    expect(mockParticipantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '+15550000000'
      })
    );
  });
});
