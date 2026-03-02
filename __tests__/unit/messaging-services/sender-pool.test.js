// ABOUTME: Unit tests for the sender-pool Messaging Services function.
// ABOUTME: Tests sender pool management (list/add/remove phone numbers) via action-routed handler.

const mockPhoneNumbersList = jest.fn();
const mockPhoneNumbersCreate = jest.fn();
const mockPhoneNumberRemove = jest.fn();

const mockPhoneNumbers = jest.fn((_sid) => ({
  remove: mockPhoneNumberRemove,
}));
mockPhoneNumbers.list = mockPhoneNumbersList;
mockPhoneNumbers.create = mockPhoneNumbersCreate;

const mockServices = jest.fn((_sid) => ({
  phoneNumbers: mockPhoneNumbers,
}));

jest.mock('twilio', () => {
  const TwilioMock = jest.fn(() => ({
    messaging: {
      v1: {
        services: mockServices,
      },
    },
  }));
  return TwilioMock;
});

const Twilio = require('twilio');

const { handler } = require('../../../functions/messaging-services/sender-pool.protected');

describe('sender-pool handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    jest.clearAllMocks();

    context = {
      TWILIO_MESSAGING_SERVICE_SID: 'MGtest123',
      getTwilioClient: () => new Twilio(),
    };

    callback = jest.fn();
  });

  // --- Happy path tests ---

  describe('list action', () => {
    it('should list phone numbers in the sender pool', async () => {
      mockPhoneNumbersList.mockResolvedValue([
        { sid: 'PN0001', phoneNumber: '+15551111111' },
        { sid: 'PN0002', phoneNumber: '+15552222222' },
      ]);

      const event = { action: 'list' };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.phoneNumbers).toHaveLength(2);
      expect(response.count).toBe(2);
    });

    it('should return empty list when no numbers in pool', async () => {
      mockPhoneNumbersList.mockResolvedValue([]);

      const event = { action: 'list' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(true);
      expect(response.phoneNumbers).toHaveLength(0);
      expect(response.count).toBe(0);
    });
  });

  describe('add action', () => {
    it('should add a phone number to the sender pool', async () => {
      mockPhoneNumbersCreate.mockResolvedValue({
        sid: 'PN0001',
        phoneNumber: '+15551111111',
      });

      const event = {
        action: 'add',
        phoneNumberSid: 'PN0001',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.phoneNumberSid).toBe('PN0001');
    });

    it('should pass phoneNumberSid to API', async () => {
      mockPhoneNumbersCreate.mockResolvedValue({
        sid: 'PN0001',
        phoneNumber: '+15551111111',
      });

      const event = {
        action: 'add',
        phoneNumberSid: 'PNabcdef1234567890abcdef1234567890',
      };

      await handler(context, event, callback);

      expect(mockPhoneNumbersCreate).toHaveBeenCalledWith({
        phoneNumberSid: 'PNabcdef1234567890abcdef1234567890',
      });
    });
  });

  describe('remove action', () => {
    it('should remove a phone number from the sender pool', async () => {
      mockPhoneNumberRemove.mockResolvedValue(true);

      const event = {
        action: 'remove',
        phoneNumberSid: 'PN0001',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.phoneNumberSid).toBe('PN0001');
    });
  });

  // --- Validation error tests ---

  describe('validation errors', () => {
    it('should return error when action is missing', async () => {
      const event = {};

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('action');
    });

    it('should return error when action is invalid', async () => {
      const event = { action: 'invalid' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('action');
    });

    it('should return error when phoneNumberSid is missing on add', async () => {
      const event = { action: 'add' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('phoneNumberSid');
    });

    it('should return error when phoneNumberSid is missing on remove', async () => {
      const event = { action: 'remove' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('phoneNumberSid');
    });

    it('should return error when TWILIO_MESSAGING_SERVICE_SID is not configured', async () => {
      const contextWithoutSid = {
        ...context,
        TWILIO_MESSAGING_SERVICE_SID: undefined,
      };
      const event = { action: 'list' };

      await handler(contextWithoutSid, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('TWILIO_MESSAGING_SERVICE_SID not configured');
    });
  });

  // --- Twilio API error tests ---

  describe('Twilio API errors', () => {
    it('should return not found error for 20404', async () => {
      const notFoundError = new Error('Not found');
      notFoundError.code = 20404;
      mockPhoneNumberRemove.mockRejectedValue(notFoundError);

      const event = { action: 'remove', phoneNumberSid: 'PNnonexistent' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should pass through unexpected error messages', async () => {
      const unexpectedError = new Error('Internal error');
      unexpectedError.code = 50000;
      mockPhoneNumbersList.mockRejectedValue(unexpectedError);

      const event = { action: 'list' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toBe('Internal error');
    });
  });
});
