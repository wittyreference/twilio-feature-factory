// ABOUTME: Unit tests for the session-manager Proxy function.
// ABOUTME: Tests session create/get/close via action-routed handler.

const mockSessionCreate = jest.fn();
const mockSessionFetch = jest.fn();
const mockSessionUpdate = jest.fn();

const mockSessions = jest.fn((_sid) => ({
  fetch: mockSessionFetch,
  update: mockSessionUpdate,
}));
mockSessions.create = mockSessionCreate;

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

const { handler } = require('../../../functions/proxy/session-manager.protected');

describe('session-manager handler', () => {
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

  describe('create action', () => {
    it('should create a session with defaults', async () => {
      mockSessionCreate.mockResolvedValue({
        sid: 'KC0001',
        serviceSid: 'KStest123',
        status: 'open',
        mode: 'voice-and-message',
        ttl: 0,
        dateCreated: '2026-03-01T10:00:00.000Z',
      });

      const event = { action: 'create' };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.sessionSid).toBe('KC0001');
      expect(response.status).toBe('open');
    });

    it('should pass uniqueName when provided', async () => {
      mockSessionCreate.mockResolvedValue({
        sid: 'KC0002',
        serviceSid: 'KStest123',
        uniqueName: 'ride-123',
        status: 'open',
        mode: 'voice-and-message',
      });

      const event = { action: 'create', uniqueName: 'ride-123' };

      await handler(context, event, callback);

      expect(mockSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ uniqueName: 'ride-123' })
      );
    });

    it('should pass mode and ttl when provided', async () => {
      mockSessionCreate.mockResolvedValue({
        sid: 'KC0003',
        serviceSid: 'KStest123',
        status: 'open',
        mode: 'voice-only',
        ttl: 3600,
      });

      const event = { action: 'create', mode: 'voice-only', ttl: '3600' };

      await handler(context, event, callback);

      expect(mockSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'voice-only', ttl: 3600 })
      );
    });
  });

  describe('get action', () => {
    it('should get session details', async () => {
      mockSessionFetch.mockResolvedValue({
        sid: 'KC0001',
        serviceSid: 'KStest123',
        status: 'in-progress',
        mode: 'voice-and-message',
        ttl: 3600,
        dateCreated: '2026-03-01T10:00:00.000Z',
      });

      const event = { action: 'get', sessionSid: 'KC0001' };

      await handler(context, event, callback);

      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.sessionSid).toBe('KC0001');
      expect(response.status).toBe('in-progress');
    });
  });

  describe('close action', () => {
    it('should close an open session', async () => {
      mockSessionUpdate.mockResolvedValue({
        sid: 'KC0001',
        status: 'closed',
        dateUpdated: '2026-03-01T11:00:00.000Z',
      });

      const event = { action: 'close', sessionSid: 'KC0001' };

      await handler(context, event, callback);

      expect(mockSessionUpdate).toHaveBeenCalledWith({ status: 'closed' });
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.status).toBe('closed');
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

    it('should return error when sessionSid missing on get', async () => {
      const event = { action: 'get' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('sessionSid');
    });

    it('should return error when sessionSid missing on close', async () => {
      const event = { action: 'close' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('sessionSid');
    });

    it('should return error when TWILIO_PROXY_SERVICE_SID not configured', async () => {
      const contextWithoutSid = { ...context, TWILIO_PROXY_SERVICE_SID: undefined };
      const event = { action: 'create' };

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
      mockSessionFetch.mockRejectedValue(notFoundError);

      const event = { action: 'get', sessionSid: 'KCnonexistent' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should pass through unexpected errors', async () => {
      const unexpectedError = new Error('Service unavailable');
      unexpectedError.code = 50000;
      mockSessionCreate.mockRejectedValue(unexpectedError);

      const event = { action: 'create' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toBe('Service unavailable');
    });
  });
});
