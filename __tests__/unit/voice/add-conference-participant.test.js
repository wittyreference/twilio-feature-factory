// ABOUTME: Unit tests for the add-conference-participant function.
// ABOUTME: Tests parameter validation and participant addition logic.

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

  TwilioMock.mockConferences = mockConferences;
  TwilioMock.mockParticipantCreate = mockParticipantCreate;

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

const { handler } = require('../../../functions/voice/add-conference-participant.protected');

describe('add-conference-participant handler', () => {
  let context;
  let callback;
  let mockParticipantCreate;

  beforeEach(() => {
    jest.clearAllMocks();
    mockParticipantCreate = require('twilio').mockParticipantCreate;

    context = {
      TWILIO_PHONE_NUMBER: '+15551234567',
      getTwilioClient: () => new (require('twilio'))()
    };
    callback = jest.fn();
  });

  it('should return 400 when ConferenceName is missing', async () => {
    const event = { To: '+15559876543' };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Missing required parameter: ConferenceName');
  });

  it('should return 400 when To is missing', async () => {
    const event = { ConferenceName: 'test-conference' };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Missing required parameter: To');
  });

  it('should add participant to conference', async () => {
    mockParticipantCreate.mockResolvedValue({
      callSid: 'CA9876543210',
      status: 'queued'
    });

    const event = {
      ConferenceName: 'test-conference',
      To: '+15559876543'
    };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.conferenceName).toBe('test-conference');
    expect(body.callSid).toBe('CA9876543210');
  });

  it('should pass muted option correctly', async () => {
    mockParticipantCreate.mockResolvedValue({
      callSid: 'CA9876543210',
      status: 'queued'
    });

    const event = {
      ConferenceName: 'test-conference',
      To: '+15559876543',
      Muted: 'true'
    };

    await handler(context, event, callback);

    expect(mockParticipantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        muted: true
      })
    );
  });

  it('should pass endConferenceOnExit option correctly', async () => {
    mockParticipantCreate.mockResolvedValue({
      callSid: 'CA9876543210',
      status: 'queued'
    });

    const event = {
      ConferenceName: 'test-conference',
      To: '+15559876543',
      EndOnExit: 'true'
    };

    await handler(context, event, callback);

    expect(mockParticipantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        endConferenceOnExit: true
      })
    );
  });

  it('should handle API errors', async () => {
    const apiError = new Error('Conference not found');
    apiError.status = 404;
    apiError.code = 20404;
    mockParticipantCreate.mockRejectedValue(apiError);

    const event = {
      ConferenceName: 'non-existent',
      To: '+15559876543'
    };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toBe('Conference not found');
  });
});
