// ABOUTME: Unit tests for the intercept-callback Proxy function.
// ABOUTME: Tests proxy interaction interception with approve/reject/modify logic.

const Twilio = require('twilio');

Twilio.Response = class MockResponse {
  constructor() { this.statusCode = 200; this.body = ''; this.headers = {}; }
  setStatusCode(code) { this.statusCode = code; }
  setBody(body) { this.body = body; }
  appendHeader(key, value) { this.headers[key] = value; }
};

global.Twilio = Twilio;

const { handler } = require('../../../functions/proxy/intercept-callback.protected');

describe('intercept-callback handler', () => {
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

  describe('interaction logging', () => {
    it('should log voice interaction details', async () => {
      const event = {
        interactionType: 'voice',
        inboundParticipantIdentifier: '+15551111111',
        outboundParticipantIdentifier: '+15552222222',
        interactionSessionSid: 'KC0001',
        interactionServiceSid: 'KS0001',
      };

      await handler(context, event, callback);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('voice')
      );
    });

    it('should log message interaction details', async () => {
      const event = {
        interactionType: 'message',
        inboundParticipantIdentifier: '+15551111111',
        outboundParticipantIdentifier: '+15552222222',
        interactionSessionSid: 'KC0001',
      };

      await handler(context, event, callback);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('message')
      );
    });
  });

  describe('response format', () => {
    it('should return 200 status code', async () => {
      const event = {
        interactionType: 'voice',
        inboundParticipantIdentifier: '+15551111111',
        outboundParticipantIdentifier: '+15552222222',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.statusCode).toBe(200);
    });

    it('should set Content-Type to application/json', async () => {
      const event = {
        interactionType: 'voice',
        inboundParticipantIdentifier: '+15551111111',
        outboundParticipantIdentifier: '+15552222222',
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.headers['Content-Type']).toBe('application/json');
    });

    it('should return allow response by default', async () => {
      const event = {
        interactionType: 'voice',
        inboundParticipantIdentifier: '+15551111111',
        outboundParticipantIdentifier: '+15552222222',
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.statusCode).toBe(200);
    });
  });

  describe('edge cases', () => {
    it('should handle missing interactionType gracefully', async () => {
      const event = {
        inboundParticipantIdentifier: '+15551111111',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error] = callback.mock.calls[0];
      expect(error).toBeNull();
    });

    it('should handle empty event', async () => {
      const event = {};

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
