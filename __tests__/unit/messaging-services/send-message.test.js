// ABOUTME: Unit tests for the send-message Messaging Services function.
// ABOUTME: Tests sending SMS/MMS via Messaging Service with scheduling and status callbacks.

const mockMessagesCreate = jest.fn();

jest.mock('twilio', () => {
  const TwilioMock = jest.fn(() => ({
    messages: {
      create: mockMessagesCreate,
    },
  }));
  return TwilioMock;
});

const Twilio = require('twilio');

const { handler } = require('../../../functions/messaging-services/send-message.protected');

describe('send-message handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMessagesCreate.mockResolvedValue({
      sid: 'SM0001',
      status: 'queued',
    });

    context = {
      TWILIO_MESSAGING_SERVICE_SID: 'MGtest123',
      getTwilioClient: () => new Twilio(),
    };

    callback = jest.fn();
  });

  // --- Happy path tests ---

  describe('basic send', () => {
    it('should send a message with valid to and body', async () => {
      const event = { to: '+15551234567', body: 'Hello from Messaging Service' };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.messageSid).toBe('SM0001');
      expect(response.status).toBe('queued');
    });

    it('should use messagingServiceSid not from', async () => {
      const event = { to: '+15551234567', body: 'Test' };

      await handler(context, event, callback);

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messagingServiceSid: 'MGtest123',
        })
      );
      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.not.objectContaining({ from: expect.anything() })
      );
    });
  });

  describe('MMS with media', () => {
    it('should include mediaUrl when provided', async () => {
      const event = {
        to: '+15551234567',
        body: 'Check this out',
        mediaUrl: 'https://example.com/image.jpg',
      };

      await handler(context, event, callback);

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaUrl: ['https://example.com/image.jpg'],
        })
      );
    });
  });

  describe('scheduled messages', () => {
    it('should schedule a message when scheduleAt is provided', async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      const event = {
        to: '+15551234567',
        body: 'Scheduled reminder',
        scheduleAt: futureDate,
      };

      await handler(context, event, callback);

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleType: 'fixed',
          sendAt: futureDate,
        })
      );
    });

    it('should reject scheduleAt more than 7 days in the future', async () => {
      const tooFar = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
      const event = {
        to: '+15551234567',
        body: 'Too far out',
        scheduleAt: tooFar,
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('7 days');
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });
  });

  describe('status callback', () => {
    it('should include statusCallback when provided', async () => {
      const event = {
        to: '+15551234567',
        body: 'Track this',
        statusCallback: 'https://example.com/status',
      };

      await handler(context, event, callback);

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCallback: 'https://example.com/status',
        })
      );
    });
  });

  // --- Validation error tests ---

  describe('validation errors', () => {
    it('should return error when to is missing', async () => {
      const event = { body: 'Hello' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('to');
    });

    it('should return error when body is missing', async () => {
      const event = { to: '+15551234567' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('body');
    });

    it('should return error when TWILIO_MESSAGING_SERVICE_SID is not configured', async () => {
      const contextWithoutSid = {
        ...context,
        TWILIO_MESSAGING_SERVICE_SID: undefined,
      };
      const event = { to: '+15551234567', body: 'Hello' };

      await handler(contextWithoutSid, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('TWILIO_MESSAGING_SERVICE_SID not configured');
    });
  });

  // --- Twilio API error tests ---

  describe('Twilio API errors', () => {
    it('should return opt-out error for 21610', async () => {
      const optOutError = new Error('Attempt to send to unsubscribed recipient');
      optOutError.code = 21610;
      mockMessagesCreate.mockRejectedValue(optOutError);

      const event = { to: '+15551234567', body: 'Hello' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('opted out');
    });

    it('should return no-numbers error for 21611', async () => {
      const noNumbersError = new Error('No phone numbers');
      noNumbersError.code = 21611;
      mockMessagesCreate.mockRejectedValue(noNumbersError);

      const event = { to: '+15551234567', body: 'Hello' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('sender pool');
    });

    it('should return service-not-found error for 21617', async () => {
      const notFoundError = new Error('Service not found');
      notFoundError.code = 21617;
      mockMessagesCreate.mockRejectedValue(notFoundError);

      const event = { to: '+15551234567', body: 'Hello' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should pass through unexpected error messages', async () => {
      const unexpectedError = new Error('Network timeout');
      unexpectedError.code = 50000;
      mockMessagesCreate.mockRejectedValue(unexpectedError);

      const event = { to: '+15551234567', body: 'Hello' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toBe('Network timeout');
    });
  });
});
