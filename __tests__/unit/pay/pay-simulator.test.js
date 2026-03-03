// ABOUTME: Unit tests for the payment simulator endpoint.
// ABOUTME: Tests simple/robust mode charge and tokenize responses.

const Twilio = require('twilio');

Twilio.Response = class MockResponse {
  constructor() { this.statusCode = 200; this.body = ''; this.headers = {}; }
  setStatusCode(code) { this.statusCode = code; }
  setBody(body) { this.body = body; }
  appendHeader(key, value) { this.headers[key] = value; }
};

global.Twilio = Twilio;

const { handler } = require('../../../functions/pay/pay-simulator');

describe('pay-simulator handler', () => {
  let callback;
  let consoleSpy;

  beforeEach(() => {
    callback = jest.fn();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('simple mode', () => {
    const context = { PAY_SIMULATOR_MODE: 'simple' };

    it('should return charge_id for charge requests', async () => {
      const event = { Method: 'charge', Amount: '9.99', CardNumber: '4242424242424242' };

      await handler(context, event, callback);

      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();

      const body = JSON.parse(response.body);
      expect(body.charge_id).toBeTruthy();
      expect(body.error_code).toBeNull();
      expect(body.error_message).toBeNull();
    });

    it('should return token_id for tokenize requests', async () => {
      const event = { Method: 'tokenize', CardNumber: '4242424242424242' };

      await handler(context, event, callback);

      const body = JSON.parse(callback.mock.calls[0][1].body);
      expect(body.token_id).toBeTruthy();
      expect(body.error_code).toBeNull();
    });

    it('should succeed regardless of card number', async () => {
      const event = { Method: 'charge', CardNumber: '4000000000000002' };

      await handler(context, event, callback);

      const body = JSON.parse(callback.mock.calls[0][1].body);
      expect(body.charge_id).toBeTruthy();
      expect(body.error_code).toBeNull();
    });

    it('should default to simple mode when not configured', async () => {
      const event = { Method: 'charge', CardNumber: '4000000000000002' };

      await handler({}, event, callback);

      const body = JSON.parse(callback.mock.calls[0][1].body);
      expect(body.charge_id).toBeTruthy();
    });
  });

  describe('robust mode', () => {
    const context = { PAY_SIMULATOR_MODE: 'robust' };

    it('should approve valid Visa test card (4242)', async () => {
      const event = { Method: 'charge', CardNumber: '4242424242424242' };

      await handler(context, event, callback);

      const body = JSON.parse(callback.mock.calls[0][1].body);
      expect(body.charge_id).toBeTruthy();
      expect(body.error_code).toBeNull();
    });

    it('should decline card ending in 0002', async () => {
      const event = { Method: 'charge', CardNumber: '4000000000000002' };

      await handler(context, event, callback);

      const body = JSON.parse(callback.mock.calls[0][1].body);
      expect(body.charge_id).toBeNull();
      expect(body.error_code).toBe('card_declined');
      expect(body.error_message).toContain('declined');
    });

    it('should decline expired card ending in 0069', async () => {
      const event = { Method: 'charge', CardNumber: '4000000000000069' };

      await handler(context, event, callback);

      const body = JSON.parse(callback.mock.calls[0][1].body);
      expect(body.charge_id).toBeNull();
      expect(body.error_code).toBe('expired_card');
    });

    it('should decline insufficient funds card ending in 9995', async () => {
      const event = { Method: 'charge', CardNumber: '4000000000009995' };

      await handler(context, event, callback);

      const body = JSON.parse(callback.mock.calls[0][1].body);
      expect(body.charge_id).toBeNull();
      expect(body.error_code).toBe('insufficient_funds');
    });

    it('should approve unknown card numbers by default', async () => {
      const event = { Method: 'charge', CardNumber: '5555555555554444' };

      await handler(context, event, callback);

      const body = JSON.parse(callback.mock.calls[0][1].body);
      expect(body.charge_id).toBeTruthy();
      expect(body.error_code).toBeNull();
    });

    it('should return token_id for tokenize with valid card', async () => {
      const event = { Method: 'tokenize', CardNumber: '4242424242424242' };

      await handler(context, event, callback);

      const body = JSON.parse(callback.mock.calls[0][1].body);
      expect(body.token_id).toBeTruthy();
    });

    it('should decline tokenize for declined card', async () => {
      const event = { Method: 'tokenize', CardNumber: '4000000000000002' };

      await handler(context, event, callback);

      const body = JSON.parse(callback.mock.calls[0][1].body);
      expect(body.token_id).toBeNull();
      expect(body.error_code).toBe('card_declined');
    });
  });

  describe('response format', () => {
    it('should return 200 status code', async () => {
      const event = { Method: 'charge' };

      await handler({}, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.statusCode).toBe(200);
    });

    it('should set Content-Type to application/json', async () => {
      const event = { Method: 'charge' };

      await handler({}, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.headers['Content-Type']).toBe('application/json');
    });
  });
});
