// ABOUTME: Unit tests for the manage-number phone management function.
// ABOUTME: Tests list/configure/release owned numbers via action-routed handler.

const mockNumbersList = jest.fn();
const mockNumberUpdate = jest.fn();
const mockNumberRemove = jest.fn();

const mockIncomingPhoneNumbers = jest.fn((_sid) => ({
  update: mockNumberUpdate,
  remove: mockNumberRemove,
}));
mockIncomingPhoneNumbers.list = mockNumbersList;

jest.mock('twilio', () => {
  const TwilioMock = jest.fn(() => ({
    incomingPhoneNumbers: mockIncomingPhoneNumbers,
  }));
  return TwilioMock;
});

const Twilio = require('twilio');

const { handler } = require('../../../functions/phone-numbers/manage-number.protected');

describe('manage-number handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    jest.clearAllMocks();

    context = {
      getTwilioClient: () => new Twilio(),
    };

    callback = jest.fn();
  });

  // --- Happy path ---

  describe('list action', () => {
    it('should list owned phone numbers', async () => {
      mockNumbersList.mockResolvedValue([
        {
          sid: 'PN0001',
          phoneNumber: '+15551111111',
          friendlyName: 'Main Line',
          capabilities: { voice: true, SMS: true },
          voiceUrl: 'https://example.com/voice',
          smsUrl: 'https://example.com/sms',
        },
        {
          sid: 'PN0002',
          phoneNumber: '+15552222222',
          friendlyName: 'Support',
          capabilities: { voice: true, SMS: true },
          voiceUrl: '',
          smsUrl: '',
        },
      ]);

      const event = { action: 'list' };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.numbers).toHaveLength(2);
      expect(response.count).toBe(2);
    });

    it('should include webhook URLs in listing', async () => {
      mockNumbersList.mockResolvedValue([
        {
          sid: 'PN0001',
          phoneNumber: '+15551111111',
          friendlyName: 'Main',
          capabilities: {},
          voiceUrl: 'https://example.com/voice',
          smsUrl: 'https://example.com/sms',
        },
      ]);

      const event = { action: 'list' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.numbers[0].voiceUrl).toBe('https://example.com/voice');
      expect(response.numbers[0].smsUrl).toBe('https://example.com/sms');
    });
  });

  describe('configure action', () => {
    it('should configure voice webhook', async () => {
      mockNumberUpdate.mockResolvedValue({
        sid: 'PN0001',
        phoneNumber: '+15551111111',
        voiceUrl: 'https://example.com/new-voice',
        smsUrl: '',
      });

      const event = {
        action: 'configure',
        phoneNumberSid: 'PN0001',
        voiceUrl: 'https://example.com/new-voice',
      };

      await handler(context, event, callback);

      expect(mockNumberUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ voiceUrl: 'https://example.com/new-voice' })
      );
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.voiceUrl).toBe('https://example.com/new-voice');
    });

    it('should configure SMS webhook', async () => {
      mockNumberUpdate.mockResolvedValue({
        sid: 'PN0001',
        phoneNumber: '+15551111111',
        voiceUrl: '',
        smsUrl: 'https://example.com/new-sms',
      });

      const event = {
        action: 'configure',
        phoneNumberSid: 'PN0001',
        smsUrl: 'https://example.com/new-sms',
      };

      await handler(context, event, callback);

      expect(mockNumberUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ smsUrl: 'https://example.com/new-sms' })
      );
    });

    it('should configure both webhooks at once', async () => {
      mockNumberUpdate.mockResolvedValue({
        sid: 'PN0001',
        phoneNumber: '+15551111111',
        voiceUrl: 'https://example.com/voice',
        smsUrl: 'https://example.com/sms',
      });

      const event = {
        action: 'configure',
        phoneNumberSid: 'PN0001',
        voiceUrl: 'https://example.com/voice',
        smsUrl: 'https://example.com/sms',
      };

      await handler(context, event, callback);

      expect(mockNumberUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          voiceUrl: 'https://example.com/voice',
          smsUrl: 'https://example.com/sms',
        })
      );
    });

    it('should configure statusCallback', async () => {
      mockNumberUpdate.mockResolvedValue({
        sid: 'PN0001',
        phoneNumber: '+15551111111',
        voiceUrl: '',
        smsUrl: '',
        statusCallback: 'https://example.com/status',
      });

      const event = {
        action: 'configure',
        phoneNumberSid: 'PN0001',
        statusCallback: 'https://example.com/status',
      };

      await handler(context, event, callback);

      expect(mockNumberUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ statusCallback: 'https://example.com/status' })
      );
    });
  });

  describe('release action', () => {
    it('should release a phone number', async () => {
      mockNumberRemove.mockResolvedValue(true);

      const event = {
        action: 'release',
        phoneNumberSid: 'PN0001',
      };

      await handler(context, event, callback);

      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.phoneNumberSid).toBe('PN0001');
    });
  });

  // --- Validation errors ---

  describe('validation errors', () => {
    it('should return error when action is missing', async () => {
      const event = {};

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('action');
    });

    it('should return error when action is invalid', async () => {
      const event = { action: 'buy' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('action');
    });

    it('should return error when phoneNumberSid missing on configure', async () => {
      const event = { action: 'configure', voiceUrl: 'https://example.com' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('phoneNumberSid');
    });

    it('should return error when phoneNumberSid missing on release', async () => {
      const event = { action: 'release' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('phoneNumberSid');
    });
  });

  // --- API errors ---

  describe('Twilio API errors', () => {
    it('should return not found for 20404', async () => {
      const notFoundError = new Error('Not found');
      notFoundError.code = 20404;
      mockNumberUpdate.mockRejectedValue(notFoundError);

      const event = { action: 'configure', phoneNumberSid: 'PNnonexistent', voiceUrl: 'https://x.com' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should pass through unexpected errors', async () => {
      const unexpectedError = new Error('Permission denied');
      unexpectedError.code = 20003;
      mockNumbersList.mockRejectedValue(unexpectedError);

      const event = { action: 'list' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toBe('Permission denied');
    });
  });
});
