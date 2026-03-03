// ABOUTME: Unit tests for the payment-status-sync handler.
// ABOUTME: Tests payment event logging to both console and Sync documents.

const Twilio = require('twilio');

Twilio.Response = class MockResponse {
  constructor() { this.statusCode = 200; this.body = ''; this.headers = {}; }
  setStatusCode(code) { this.statusCode = code; }
  setBody(body) { this.body = body; }
  appendHeader(key, value) { this.headers[key] = value; }
};

global.Twilio = Twilio;

// Mock Sync client
const mockSyncUpdate = jest.fn().mockResolvedValue({});
const mockSyncCreate = jest.fn().mockResolvedValue({});
const mockSyncDocuments = jest.fn((_name) => ({
  update: mockSyncUpdate,
}));
mockSyncDocuments.create = mockSyncCreate;

const mockSyncService = jest.fn(() => ({
  documents: Object.assign(mockSyncDocuments, { create: mockSyncCreate }),
}));

const mockClient = {
  sync: { v1: { services: mockSyncService } },
};

const { handler } = require('../../../functions/pay/payment-status-sync.protected');

describe('payment-status-sync handler', () => {
  let context;
  let callback;
  let consoleSpy;

  beforeEach(() => {
    context = {
      TWILIO_SYNC_SERVICE_SID: 'IS1234567890',
      getTwilioClient: () => mockClient,
    };
    callback = jest.fn();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('console logging', () => {
    it('should log capture events', async () => {
      const event = {
        CallSid: 'CA1234',
        PaymentSid: 'PK5678',
        Capture: 'payment-card-number',
      };

      await handler(context, event, callback);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('payment-card-number')
      );
    });

    it('should log error codes', async () => {
      const event = {
        CallSid: 'CA1234',
        PaymentSid: 'PK5678',
        ErrorCode: '10001',
        ErrorMessage: 'Connector error',
      };

      await handler(context, event, callback);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('10001')
      );
    });

    it('should log payment results', async () => {
      const event = {
        CallSid: 'CA1234',
        PaymentSid: 'PK5678',
        Result: 'success',
      };

      await handler(context, event, callback);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('result=success')
      );
    });
  });

  describe('Sync document writing', () => {
    it('should update Sync document with payment state', async () => {
      const event = {
        CallSid: 'CA1234',
        PaymentSid: 'PK5678',
        Result: 'success',
      };

      await handler(context, event, callback);

      expect(mockSyncService).toHaveBeenCalledWith('IS1234567890');
      expect(mockSyncDocuments).toHaveBeenCalledWith('payment-PK5678');
      expect(mockSyncUpdate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          callSid: 'CA1234',
          paymentSid: 'PK5678',
          result: 'success',
        }),
      });
    });

    it('should create Sync document if it does not exist', async () => {
      mockSyncUpdate.mockRejectedValueOnce({ code: 20404 });

      const event = {
        CallSid: 'CA1234',
        PaymentSid: 'PK5678',
        Result: 'success',
      };

      await handler(context, event, callback);

      expect(mockSyncCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          uniqueName: 'payment-PK5678',
          ttl: 86400,
        })
      );
    });

    it('should skip Sync write when no Sync service configured', async () => {
      context.TWILIO_SYNC_SERVICE_SID = undefined;

      const event = {
        CallSid: 'CA1234',
        PaymentSid: 'PK5678',
        Result: 'success',
      };

      await handler(context, event, callback);

      expect(mockSyncService).not.toHaveBeenCalled();
    });

    it('should skip Sync write when no PaymentSid', async () => {
      const event = { CallSid: 'CA1234' };

      await handler(context, event, callback);

      expect(mockSyncService).not.toHaveBeenCalled();
    });
  });

  describe('response', () => {
    it('should return success response', async () => {
      const event = { CallSid: 'CA1234', PaymentSid: 'PK5678', Result: 'success' };

      await handler(context, event, callback);

      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(JSON.parse(response.body).success).toBe(true);
    });

    it('should return 200 status code', async () => {
      const event = { CallSid: 'CA1234', PaymentSid: 'PK5678' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.statusCode).toBe(200);
    });
  });
});
