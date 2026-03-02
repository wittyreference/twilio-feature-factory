// ABOUTME: Unit tests for the incoming-handler Messaging Services function.
// ABOUTME: Tests inbound message webhook with keyword routing and TwiML responses.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/messaging-services/incoming-handler');

describe('incoming-handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    context = {};
    callback = jest.fn();
  });

  describe('keyword routing', () => {
    it('should respond to HELP keyword with support info', async () => {
      const event = { Body: 'HELP', From: '+15551234567' };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      const twiml = response.toString();
      expect(twiml).toContain('<Message>');
      expect(twiml).toContain('STOP');
    });

    it('should handle lowercase help', async () => {
      const event = { Body: 'help', From: '+15551234567' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('<Message>');
      expect(twiml).toContain('STOP');
    });

    it('should respond to INFO keyword', async () => {
      const event = { Body: 'INFO', From: '+15551234567' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('<Message>');
    });
  });

  describe('default response', () => {
    it('should acknowledge regular messages', async () => {
      const event = { Body: 'Hello there', From: '+15551234567' };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      const twiml = response.toString();
      expect(twiml).toContain('<?xml');
      expect(twiml).toContain('<Response>');
      expect(twiml).toContain('<Message>');
    });

    it('should handle empty body gracefully', async () => {
      const event = { From: '+15551234567' };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      const twiml = response.toString();
      expect(twiml).toContain('<Message>');
    });
  });

  describe('TwiML format', () => {
    it('should return valid MessagingResponse TwiML', async () => {
      const event = { Body: 'Test', From: '+15551234567' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const twiml = response.toString();
      expect(twiml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(twiml).toContain('<Response>');
      expect(twiml).toContain('</Response>');
    });
  });
});
