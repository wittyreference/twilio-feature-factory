// ABOUTME: Unit tests for the IVR menu handler for the dental office self-service system.
// ABOUTME: Tests routing to appointments, billing, hours, operator, and unrecognized input.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/voice/ivr-menu.protected');

describe('ivr-menu handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    context = global.createTestContext();
    callback = jest.fn();
  });

  describe('DTMF navigation', () => {
    it('should route digit 1 to appointments', async () => {
      const event = global.createTestEvent({ Digits: '1' });
      await handler(context, event, callback);
      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('appointment');
    });

    it('should route digit 2 to billing', async () => {
      const event = global.createTestEvent({ Digits: '2' });
      await handler(context, event, callback);
      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('billing');
    });

    it('should route digit 3 to hours', async () => {
      const event = global.createTestEvent({ Digits: '3' });
      await handler(context, event, callback);
      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('hour');
      expect(twiml).toContain('monday');
    });

    it('should route digit 0 to operator', async () => {
      const event = global.createTestEvent({ Digits: '0' });
      await handler(context, event, callback);
      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('operator');
    });
  });

  describe('speech navigation', () => {
    it('should route "appointments" to appointments info', async () => {
      const event = global.createTestEvent({ SpeechResult: 'I need an appointment' });
      await handler(context, event, callback);
      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('appointment');
      expect(twiml).toContain('schedule');
    });

    it('should route "billing" to billing info', async () => {
      const event = global.createTestEvent({ SpeechResult: 'billing question' });
      await handler(context, event, callback);
      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('billing');
      expect(twiml).toContain('insurance');
    });

    it('should route "hours" to office hours', async () => {
      const event = global.createTestEvent({ SpeechResult: 'what are your hours' });
      await handler(context, event, callback);
      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('monday');
      expect(twiml).toContain('friday');
    });
  });

  describe('unrecognized input', () => {
    it('should redirect back to welcome for unknown input', async () => {
      const event = global.createTestEvent({ SpeechResult: 'pizza delivery' });
      await handler(context, event, callback);
      const twiml = callback.mock.calls[0][1].toString();
      expect(twiml).toContain('<Redirect>');
      expect(twiml).toContain('/voice/ivr-welcome');
    });

    it('should redirect for unknown digit', async () => {
      const event = global.createTestEvent({ Digits: '9' });
      await handler(context, event, callback);
      const twiml = callback.mock.calls[0][1].toString();
      expect(twiml).toContain('<Redirect>');
    });
  });

  describe('all terminal paths include hangup', () => {
    it('should hangup after appointments info', async () => {
      const event = global.createTestEvent({ Digits: '1' });
      await handler(context, event, callback);
      const twiml = callback.mock.calls[0][1].toString();
      expect(twiml).toContain('<Hangup');
    });

    it('should hangup after billing info', async () => {
      const event = global.createTestEvent({ Digits: '2' });
      await handler(context, event, callback);
      const twiml = callback.mock.calls[0][1].toString();
      expect(twiml).toContain('<Hangup');
    });

    it('should hangup after hours info', async () => {
      const event = global.createTestEvent({ Digits: '3' });
      await handler(context, event, callback);
      const twiml = callback.mock.calls[0][1].toString();
      expect(twiml).toContain('<Hangup');
    });
  });
});
