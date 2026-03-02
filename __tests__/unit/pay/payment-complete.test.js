// ABOUTME: Unit tests for the payment-complete action handler.
// ABOUTME: Tests payment result processing and confirmation TwiML responses.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/pay/payment-complete.protected');

describe('payment-complete handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    context = {};
    callback = jest.fn();
  });

  describe('successful payment', () => {
    it('should return success TwiML when Result is success', async () => {
      const event = {
        Result: 'success',
        PaymentToken: 'tok_abc123',
        PaymentCardNumber: '1234',
        PaymentCardType: 'visa',
        PaymentConfirmationCode: 'conf_xyz',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      const twiml = response.toString();
      expect(twiml).toContain('<Say');
      expect(twiml).toContain('success');
    });

    it('should include last 4 digits in confirmation message', async () => {
      const event = {
        Result: 'success',
        PaymentToken: 'tok_abc123',
        PaymentCardNumber: '5678',
        PaymentCardType: 'mastercard',
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('5678');
    });
  });

  describe('failed payment', () => {
    it('should return failure TwiML when Result is not success', async () => {
      const event = {
        Result: 'payment-connector-error',
        PaymentToken: '',
        PaymentCardNumber: '',
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('<Say');
    });

    it('should handle user-hung-up result', async () => {
      const event = {
        Result: 'caller-interrupted',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error] = callback.mock.calls[0];
      expect(error).toBeNull();
    });
  });

  describe('TwiML format', () => {
    it('should return valid VoiceResponse', async () => {
      const event = { Result: 'success', PaymentCardNumber: '1234' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(twiml).toContain('<Response>');
      expect(twiml).toContain('</Response>');
    });

    it('should hang up after confirmation', async () => {
      const event = { Result: 'success', PaymentCardNumber: '1234' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('<Hangup');
    });
  });
});
