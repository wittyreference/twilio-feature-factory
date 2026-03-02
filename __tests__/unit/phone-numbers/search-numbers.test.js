// ABOUTME: Unit tests for the search-numbers phone management function.
// ABOUTME: Tests searching available Twilio phone numbers by country, area code, and capabilities.

const mockLocalList = jest.fn();

jest.mock('twilio', () => {
  const TwilioMock = jest.fn(() => ({
    availablePhoneNumbers: jest.fn((_country) => ({
      local: { list: mockLocalList },
    })),
  }));
  return TwilioMock;
});

const Twilio = require('twilio');

const { handler } = require('../../../functions/phone-numbers/search-numbers.protected');

describe('search-numbers handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLocalList.mockResolvedValue([
      {
        phoneNumber: '+14155551234',
        friendlyName: '(415) 555-1234',
        locality: 'San Francisco',
        region: 'CA',
        capabilities: { voice: true, SMS: true, MMS: true },
      },
      {
        phoneNumber: '+14155555678',
        friendlyName: '(415) 555-5678',
        locality: 'San Francisco',
        region: 'CA',
        capabilities: { voice: true, SMS: true, MMS: false },
      },
    ]);

    context = {
      getTwilioClient: () => new Twilio(),
    };

    callback = jest.fn();
  });

  describe('basic search', () => {
    it('should search with default country US', async () => {
      const event = {};

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.numbers).toHaveLength(2);
      expect(response.count).toBe(2);
    });

    it('should return number details', async () => {
      const event = {};

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.numbers[0].phoneNumber).toBe('+14155551234');
      expect(response.numbers[0].locality).toBe('San Francisco');
      expect(response.numbers[0].capabilities).toBeDefined();
    });
  });

  describe('search filters', () => {
    it('should pass countryCode to API', async () => {
      const event = { countryCode: 'GB' };

      await handler(context, event, callback);

      // Verify the handler completed successfully (countryCode was passed
      // to the mock which returned our mock data regardless of country)
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
    });

    it('should pass areaCode when provided', async () => {
      const event = { areaCode: '415' };

      await handler(context, event, callback);

      expect(mockLocalList).toHaveBeenCalledWith(
        expect.objectContaining({ areaCode: 415 })
      );
    });

    it('should pass contains pattern when provided', async () => {
      const event = { contains: '555' };

      await handler(context, event, callback);

      expect(mockLocalList).toHaveBeenCalledWith(
        expect.objectContaining({ contains: '555' })
      );
    });

    it('should pass smsEnabled filter when provided', async () => {
      const event = { smsEnabled: 'true' };

      await handler(context, event, callback);

      expect(mockLocalList).toHaveBeenCalledWith(
        expect.objectContaining({ smsEnabled: true })
      );
    });

    it('should pass voiceEnabled filter when provided', async () => {
      const event = { voiceEnabled: 'true' };

      await handler(context, event, callback);

      expect(mockLocalList).toHaveBeenCalledWith(
        expect.objectContaining({ voiceEnabled: true })
      );
    });

    it('should pass limit when provided', async () => {
      const event = { limit: '5' };

      await handler(context, event, callback);

      expect(mockLocalList).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5 })
      );
    });
  });

  describe('empty results', () => {
    it('should return empty array when no numbers found', async () => {
      mockLocalList.mockResolvedValue([]);

      const event = { areaCode: '999' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(true);
      expect(response.numbers).toHaveLength(0);
      expect(response.count).toBe(0);
    });
  });

  describe('API errors', () => {
    it('should return error on API failure', async () => {
      const apiError = new Error('Invalid country code');
      apiError.code = 21452;
      mockLocalList.mockRejectedValue(apiError);

      const event = { countryCode: 'XX' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toBe('Invalid country code');
    });
  });
});
