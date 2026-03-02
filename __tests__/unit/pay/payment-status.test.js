// ABOUTME: Unit tests for the payment-status callback handler.
// ABOUTME: Tests payment progress event logging during DTMF collection.

const Twilio = require('twilio');

Twilio.Response = class MockResponse {
  constructor() { this.statusCode = 200; this.body = ''; this.headers = {}; }
  setStatusCode(code) { this.statusCode = code; }
  setBody(body) { this.body = body; }
  appendHeader(key, value) { this.headers[key] = value; }
};

global.Twilio = Twilio;

const { handler } = require('../../../functions/pay/payment-status.protected');

describe('payment-status handler', () => {
  let context;
  let callback;
  let consoleSpy;

  beforeEach(() => {
    context = {};
    callback = jest.fn();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('status logging', () => {
    it('should log payment status event', async () => {
      const event = {
        CallSid: 'CA1234',
        PaymentSid: 'PK5678',
        Result: 'success',
        PaymentCardNumber: '1234',
      };

      await handler(context, event, callback);

      expect(consoleSpy).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should log capture events during collection', async () => {
      const event = {
        CallSid: 'CA1234',
        PaymentSid: 'PK5678',
        Capture: 'payment-card-number',
        Result: '',
      };

      await handler(context, event, callback);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('payment-card-number')
      );
    });

    it('should log error codes when present', async () => {
      const event = {
        CallSid: 'CA1234',
        PaymentSid: 'PK5678',
        Result: 'payment-connector-error',
        ErrorCode: '10001',
        ErrorMessage: 'Connector failed',
      };

      await handler(context, event, callback);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('10001')
      );
    });
  });

  describe('response', () => {
    it('should return success response', async () => {
      const event = {
        CallSid: 'CA1234',
        PaymentSid: 'PK5678',
        Result: 'success',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should return 200 status code', async () => {
      const event = { CallSid: 'CA1234', PaymentSid: 'PK5678' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.statusCode).toBe(200);
    });

    it('should set Content-Type to application/json', async () => {
      const event = { CallSid: 'CA1234', PaymentSid: 'PK5678' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.headers['Content-Type']).toBe('application/json');
    });
  });
});
