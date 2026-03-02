// ABOUTME: Unit tests for the collect-payment voice webhook.
// ABOUTME: Tests TwiML generation with Pay verb for PCI-compliant DTMF payment collection.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/pay/collect-payment');

describe('collect-payment handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    context = {
      PAYMENT_CONNECTOR: 'Default',
      PAYMENT_CHARGE_AMOUNT: '9.99',
      PAYMENT_CURRENCY: 'usd',
    };
    callback = jest.fn();
  });

  describe('TwiML generation', () => {
    it('should return valid VoiceResponse TwiML', async () => {
      const event = {};

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      const twiml = response.toString();
      expect(twiml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(twiml).toContain('<Response>');
    });

    it('should include Say greeting before Pay', async () => {
      const event = {};

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('<Say');
    });

    it('should include Pay verb', async () => {
      const event = {};

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('<Pay');
    });

    it('should set paymentConnector from context', async () => {
      const event = {};

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('paymentConnector="Default"');
    });

    it('should set chargeAmount from context', async () => {
      const event = {};

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('chargeAmount="9.99"');
    });

    it('should allow event to override chargeAmount', async () => {
      const event = { chargeAmount: '19.99' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('chargeAmount="19.99"');
    });

    it('should set action URL for payment completion', async () => {
      const event = {};

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('action=');
      expect(twiml).toContain('payment-complete');
    });

    it('should set statusCallback URL', async () => {
      const event = {};

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('statusCallback=');
      expect(twiml).toContain('payment-status');
    });

    it('should use credit-card as payment method', async () => {
      const event = {};

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('credit-card');
    });
  });

  describe('default values', () => {
    it('should use Default connector when PAYMENT_CONNECTOR not set', async () => {
      const contextNoConnector = { ...context, PAYMENT_CONNECTOR: undefined };
      const event = {};

      await handler(contextNoConnector, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('paymentConnector="Default"');
    });
  });
});
