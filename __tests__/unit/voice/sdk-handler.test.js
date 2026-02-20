// ABOUTME: Unit tests for the Voice SDK call handler function.
// ABOUTME: Tests TwiML generation for PSTN dial, client dial, and missing To scenarios.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/voice/sdk-handler');

describe('voice/sdk-handler', () => {
  let context;
  let event;
  let callback;

  beforeEach(() => {
    context = {
      ...global.createTestContext(),
      TWILIO_PHONE_NUMBER: '+15550001111'
    };
    event = global.createTestEvent();
    callback = jest.fn();
  });

  describe('PSTN outbound calls', () => {
    it('should dial a phone number when To starts with +', async () => {
      event.To = '+15559876543';
      await handler(context, event, callback);

      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      const twiml = response.toString();
      expect(twiml).toContain('<Dial');
      expect(twiml).toContain('<Number>+15559876543</Number>');
    });

    it('should use TWILIO_PHONE_NUMBER as callerId for PSTN', async () => {
      event.To = '+15559876543';
      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('callerId="+15550001111"');
    });
  });

  describe('client-to-client calls', () => {
    it('should dial a client when To starts with client:', async () => {
      event.To = 'client:agent-bob';
      await handler(context, event, callback);

      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      const twiml = response.toString();
      expect(twiml).toContain('<Dial');
      expect(twiml).toContain('<Client>agent-bob</Client>');
    });

    it('should use TWILIO_PHONE_NUMBER as callerId for client calls', async () => {
      event.To = 'client:agent-bob';
      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('callerId="+15550001111"');
    });
  });

  describe('missing or invalid To', () => {
    it('should return Say with error message when To is empty', async () => {
      event.To = '';
      await handler(context, event, callback);

      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      const twiml = response.toString();
      expect(twiml).toContain('<Say');
      expect(twiml).toContain('No destination was provided');
    });

    it('should return Say with error message when To is undefined', async () => {
      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('<Say');
      expect(twiml).toContain('No destination was provided');
    });

    it('should return Say with error for invalid format', async () => {
      event.To = 'some-invalid-value';
      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('<Say');
      expect(twiml).toContain('Invalid destination format');
    });
  });
});
