// ABOUTME: Unit tests for the participant-manager Proxy function.
// ABOUTME: Tests participant add/list/remove via action-routed handler.

const mockParticipantCreate = jest.fn();
const mockParticipantList = jest.fn();
const mockParticipantRemove = jest.fn();

const mockParticipants = jest.fn((_sid) => ({
  remove: mockParticipantRemove,
}));
mockParticipants.create = mockParticipantCreate;
mockParticipants.list = mockParticipantList;

const mockSessions = jest.fn((_sid) => ({
  participants: mockParticipants,
}));

const mockServices = jest.fn((_sid) => ({
  sessions: mockSessions,
}));

jest.mock('twilio', () => {
  const TwilioMock = jest.fn(() => ({
    proxy: { v1: { services: mockServices } },
  }));
  return TwilioMock;
});

const Twilio = require('twilio');

const { handler } = require('../../../functions/proxy/participant-manager.protected');

describe('participant-manager handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    jest.clearAllMocks();

    context = {
      TWILIO_PROXY_SERVICE_SID: 'KStest123',
      getTwilioClient: () => new Twilio(),
    };

    callback = jest.fn();
  });

  // --- Happy path ---

  describe('add action', () => {
    it('should add a participant to a session', async () => {
      mockParticipantCreate.mockResolvedValue({
        sid: 'KP0001',
        sessionSid: 'KC0001',
        identifier: '+15551234567',
        proxyIdentifier: '+15559876543',
        friendlyName: 'Rider',
      });

      const event = {
        action: 'add',
        sessionSid: 'KC0001',
        identifier: '+15551234567',
        friendlyName: 'Rider',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.participantSid).toBe('KP0001');
      expect(response.identifier).toBe('+15551234567');
      expect(response.proxyIdentifier).toBe('+15559876543');
    });

    it('should pass friendlyName to API', async () => {
      mockParticipantCreate.mockResolvedValue({
        sid: 'KP0001',
        identifier: '+15551234567',
        proxyIdentifier: '+15559876543',
        friendlyName: 'Driver',
      });

      const event = {
        action: 'add',
        sessionSid: 'KC0001',
        identifier: '+15551234567',
        friendlyName: 'Driver',
      };

      await handler(context, event, callback);

      expect(mockParticipantCreate).toHaveBeenCalledWith(
        expect.objectContaining({ friendlyName: 'Driver' })
      );
    });
  });

  describe('list action', () => {
    it('should list participants in a session', async () => {
      mockParticipantList.mockResolvedValue([
        { sid: 'KP0001', identifier: '+15551111111', proxyIdentifier: '+15559999999', friendlyName: 'Rider' },
        { sid: 'KP0002', identifier: '+15552222222', proxyIdentifier: '+15558888888', friendlyName: 'Driver' },
      ]);

      const event = { action: 'list', sessionSid: 'KC0001' };

      await handler(context, event, callback);

      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.participants).toHaveLength(2);
      expect(response.count).toBe(2);
    });
  });

  describe('remove action', () => {
    it('should remove a participant from a session', async () => {
      mockParticipantRemove.mockResolvedValue(true);

      const event = {
        action: 'remove',
        sessionSid: 'KC0001',
        participantSid: 'KP0001',
      };

      await handler(context, event, callback);

      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.participantSid).toBe('KP0001');
    });
  });

  // --- Validation errors ---

  describe('validation errors', () => {
    it('should return error when action is missing', async () => {
      const event = {};

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('action');
    });

    it('should return error when action is invalid', async () => {
      const event = { action: 'invalid' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('action');
    });

    it('should return error when sessionSid missing', async () => {
      const event = { action: 'add', identifier: '+15551234567' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('sessionSid');
    });

    it('should return error when identifier missing on add', async () => {
      const event = { action: 'add', sessionSid: 'KC0001' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('identifier');
    });

    it('should return error when participantSid missing on remove', async () => {
      const event = { action: 'remove', sessionSid: 'KC0001' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('participantSid');
    });

    it('should return error when TWILIO_PROXY_SERVICE_SID not configured', async () => {
      const contextWithoutSid = { ...context, TWILIO_PROXY_SERVICE_SID: undefined };
      const event = { action: 'list', sessionSid: 'KC0001' };

      await handler(contextWithoutSid, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('TWILIO_PROXY_SERVICE_SID not configured');
    });
  });

  // --- API errors ---

  describe('Twilio API errors', () => {
    it('should return not found for 20404', async () => {
      const notFoundError = new Error('Not found');
      notFoundError.code = 20404;
      mockParticipantRemove.mockRejectedValue(notFoundError);

      const event = { action: 'remove', sessionSid: 'KC0001', participantSid: 'KPnonexistent' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should pass through unexpected errors', async () => {
      const unexpectedError = new Error('Rate limit exceeded');
      unexpectedError.code = 42900;
      mockParticipantList.mockRejectedValue(unexpectedError);

      const event = { action: 'list', sessionSid: 'KC0001' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toBe('Rate limit exceeded');
    });
  });
});
