// ABOUTME: Unit tests for the start-verification protected function.
// ABOUTME: Tests verification initiation via Twilio Verify API with mocked responses.

// Mock the Twilio client
const mockVerificationsCreate = jest.fn();

jest.mock('twilio', () => {
  const TwilioMock = jest.fn(() => ({
    verify: {
      v2: {
        services: jest.fn(() => ({
          verifications: {
            create: mockVerificationsCreate,
          },
        })),
      },
    },
  }));

  return TwilioMock;
});

const Twilio = require('twilio');

const { handler } = require('../../../functions/verify/start-verification.protected');

describe('start-verification handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock successful verification
    mockVerificationsCreate.mockResolvedValue({
      status: 'pending',
      channel: 'sms',
      to: '+15551234567',
    });

    context = {
      TWILIO_VERIFY_SERVICE_SID: 'VA1234567890abcdef1234567890abcdef',
      getTwilioClient: () => new Twilio(),
    };

    callback = jest.fn();
  });

  it('should return error when "to" parameter is missing', async () => {
    const event = {
      channel: 'sms',
    };

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.success).toBe(false);
    expect(response.error).toContain('Missing required parameter: to');
  });

  it('should return error when TWILIO_VERIFY_SERVICE_SID is not configured', async () => {
    const contextWithoutService = {
      ...context,
      TWILIO_VERIFY_SERVICE_SID: undefined,
    };

    const event = {
      to: '+15551234567',
    };

    await handler(contextWithoutService, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.success).toBe(false);
    expect(response.error).toContain('TWILIO_VERIFY_SERVICE_SID not configured');
  });

  it('should return error for invalid channel', async () => {
    const event = {
      to: '+15551234567',
      channel: 'invalid_channel',
    };

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.success).toBe(false);
    expect(response.error).toContain('Invalid channel');
  });

  it('should default to SMS channel when not specified', async () => {
    const event = {
      to: '+15551234567',
    };

    await handler(context, event, callback);

    expect(mockVerificationsCreate).toHaveBeenCalledWith({
      to: '+15551234567',
      channel: 'sms',
    });

    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.success).toBe(true);
    expect(response.channel).toBe('sms');
  });

  it('should start verification with SMS channel', async () => {
    const event = {
      to: '+15551234567',
      channel: 'sms',
    };

    await handler(context, event, callback);

    expect(mockVerificationsCreate).toHaveBeenCalledWith({
      to: '+15551234567',
      channel: 'sms',
    });

    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.success).toBe(true);
    expect(response.status).toBe('pending');
  });

  it('should start verification with call channel', async () => {
    mockVerificationsCreate.mockResolvedValue({
      status: 'pending',
      channel: 'call',
      to: '+15551234567',
    });

    const event = {
      to: '+15551234567',
      channel: 'call',
    };

    await handler(context, event, callback);

    expect(mockVerificationsCreate).toHaveBeenCalledWith({
      to: '+15551234567',
      channel: 'call',
    });

    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.success).toBe(true);
  });

  it('should start verification with email channel', async () => {
    mockVerificationsCreate.mockResolvedValue({
      status: 'pending',
      channel: 'email',
      to: 'test@example.com',
    });

    const event = {
      to: 'test@example.com',
      channel: 'email',
    };

    await handler(context, event, callback);

    expect(mockVerificationsCreate).toHaveBeenCalledWith({
      to: 'test@example.com',
      channel: 'email',
    });

    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.success).toBe(true);
  });

  it('should return the full verification response', async () => {
    mockVerificationsCreate.mockResolvedValue({
      status: 'pending',
      channel: 'sms',
      to: '+15551234567',
    });

    const event = {
      to: '+15551234567',
      channel: 'sms',
    };

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.success).toBe(true);
    expect(response.status).toBe('pending');
    expect(response.channel).toBe('sms');
    expect(response.to).toBe('+15551234567');
  });
});
