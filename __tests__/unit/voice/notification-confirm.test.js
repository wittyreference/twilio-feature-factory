// ABOUTME: Unit tests for the notification-confirm protected voice function.
// ABOUTME: Tests TwiML generation for processing appointment confirmation input.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/voice/notification-confirm.protected');

describe('notification-confirm handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    context = global.createTestContext();
    callback = jest.fn();
  });

  describe('DTMF confirmation', () => {
    it('should confirm when digit 1 is pressed', async () => {
      const event = global.createTestEvent({
        CallSid: 'CA1234567890abcdef1234567890abcdef',
        Digits: '1',
      });

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();

      const twiml = response.toString();
      expect(twiml.toLowerCase()).toContain('confirmed');
    });

    it('should reschedule when digit 2 is pressed', async () => {
      const event = global.createTestEvent({
        CallSid: 'CA1234567890abcdef1234567890abcdef',
        Digits: '2',
      });

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml.toLowerCase()).toContain('reschedule');
    });
  });

  describe('speech confirmation', () => {
    it('should confirm when caller says "yes"', async () => {
      const event = global.createTestEvent({
        CallSid: 'CA1234567890abcdef1234567890abcdef',
        SpeechResult: 'yes',
        Confidence: '0.92',
      });

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml.toLowerCase()).toContain('confirmed');
    });

    it('should confirm when caller says "confirm my appointment"', async () => {
      const event = global.createTestEvent({
        CallSid: 'CA1234567890abcdef1234567890abcdef',
        SpeechResult: 'confirm my appointment',
        Confidence: '0.88',
      });

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml.toLowerCase()).toContain('confirmed');
    });

    it('should confirm when caller says "affirmative"', async () => {
      const event = global.createTestEvent({
        CallSid: 'CA1234567890abcdef1234567890abcdef',
        SpeechResult: 'affirmative',
        Confidence: '0.85',
      });

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml.toLowerCase()).toContain('confirmed');
    });

    it('should reschedule when caller says "no"', async () => {
      const event = global.createTestEvent({
        CallSid: 'CA1234567890abcdef1234567890abcdef',
        SpeechResult: 'no',
        Confidence: '0.95',
      });

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml.toLowerCase()).toContain('reschedule');
    });

    it('should reschedule when caller says "cancel"', async () => {
      const event = global.createTestEvent({
        CallSid: 'CA1234567890abcdef1234567890abcdef',
        SpeechResult: 'I need to cancel',
        Confidence: '0.90',
      });

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml.toLowerCase()).toContain('reschedule');
    });

    it('should reschedule when caller says "reschedule"', async () => {
      const event = global.createTestEvent({
        CallSid: 'CA1234567890abcdef1234567890abcdef',
        SpeechResult: 'I would like to reschedule please',
        Confidence: '0.91',
      });

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml.toLowerCase()).toContain('reschedule');
    });
  });

  describe('unrecognized input', () => {
    it('should return unrecognized response when no input provided', async () => {
      const event = global.createTestEvent({
        CallSid: 'CA1234567890abcdef1234567890abcdef',
      });

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml.toLowerCase()).toContain('unable to understand');
    });

    it('should return unrecognized response for unexpected speech', async () => {
      const event = global.createTestEvent({
        CallSid: 'CA1234567890abcdef1234567890abcdef',
        SpeechResult: 'what time is my appointment',
        Confidence: '0.80',
      });

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml.toLowerCase()).toContain('unable to understand');
    });

    it('should return unrecognized response for unexpected digit', async () => {
      const event = global.createTestEvent({
        CallSid: 'CA1234567890abcdef1234567890abcdef',
        Digits: '9',
      });

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml.toLowerCase()).toContain('unable to understand');
    });
  });

  describe('all responses end with hangup', () => {
    it('should hangup after confirmation', async () => {
      const event = global.createTestEvent({
        CallSid: 'CA1234567890abcdef1234567890abcdef',
        Digits: '1',
      });

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('<Hangup');
    });

    it('should hangup after reschedule', async () => {
      const event = global.createTestEvent({
        CallSid: 'CA1234567890abcdef1234567890abcdef',
        Digits: '2',
      });

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('<Hangup');
    });

    it('should hangup after unrecognized input', async () => {
      const event = global.createTestEvent({
        CallSid: 'CA1234567890abcdef1234567890abcdef',
      });

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('<Hangup');
    });
  });

  describe('TwiML structure', () => {
    it('should return valid TwiML', async () => {
      const event = global.createTestEvent({
        CallSid: 'CA1234567890abcdef1234567890abcdef',
        Digits: '1',
      });

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('<?xml');
      expect(twiml).toContain('<Response>');
    });

    it('should use Polly.Amy voice', async () => {
      const event = global.createTestEvent({
        CallSid: 'CA1234567890abcdef1234567890abcdef',
        Digits: '1',
      });

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('voice="Polly.Amy"');
    });
  });
});
