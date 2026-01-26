// ABOUTME: Unit tests for the end-conference function.
// ABOUTME: Tests conference termination by SID and friendly name.

const Twilio = require('twilio');

global.Twilio = Twilio;

// Mock the Twilio client
jest.mock('twilio', () => {
  const mockConferenceUpdate = jest.fn();
  const mockConferencesList = jest.fn();

  const mockConferences = jest.fn((sidOrName) => ({
    update: mockConferenceUpdate
  }));
  mockConferences.list = mockConferencesList;

  const TwilioMock = jest.fn(() => ({
    conferences: mockConferences
  }));

  TwilioMock.mockConferences = mockConferences;
  TwilioMock.mockConferenceUpdate = mockConferenceUpdate;
  TwilioMock.mockConferencesList = mockConferencesList;

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

const { handler } = require('../../../functions/voice/end-conference.protected');

describe('end-conference handler', () => {
  let context;
  let callback;
  let mockConferenceUpdate;
  let mockConferencesList;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConferenceUpdate = require('twilio').mockConferenceUpdate;
    mockConferencesList = require('twilio').mockConferencesList;

    context = {
      getTwilioClient: () => new (require('twilio'))()
    };
    callback = jest.fn();
  });

  it('should return 400 when no identifier is provided', async () => {
    const event = {};

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Missing required parameter: ConferenceSid or ConferenceName');
  });

  it('should end conference by SID', async () => {
    mockConferenceUpdate.mockResolvedValue({
      sid: 'CFabc123',
      friendlyName: 'test-conference',
      status: 'completed'
    });

    const event = { ConferenceSid: 'CFabc123' };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.conferenceSid).toBe('CFabc123');
    expect(body.status).toBe('completed');
  });

  it('should end conference by friendly name', async () => {
    mockConferencesList.mockResolvedValue([{
      sid: 'CFdef456',
      friendlyName: 'my-conference',
      status: 'in-progress'
    }]);

    mockConferenceUpdate.mockResolvedValue({
      sid: 'CFdef456',
      friendlyName: 'my-conference',
      status: 'completed'
    });

    const event = { ConferenceName: 'my-conference' };

    await handler(context, event, callback);

    expect(mockConferencesList).toHaveBeenCalledWith({
      friendlyName: 'my-conference',
      status: 'in-progress',
      limit: 1
    });

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.friendlyName).toBe('my-conference');
  });

  it('should return 404 when conference not found by name', async () => {
    mockConferencesList.mockResolvedValue([]);

    const event = { ConferenceName: 'non-existent' };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toBe('Conference not found or not in progress');
  });

  it('should handle API errors gracefully', async () => {
    const apiError = new Error('Conference already completed');
    apiError.status = 400;
    apiError.code = 20409;
    mockConferenceUpdate.mockRejectedValue(apiError);

    const event = { ConferenceSid: 'CFabc123' };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Conference already completed');
  });
});
