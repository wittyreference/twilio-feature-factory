// ABOUTME: Unit tests for the document-crud Sync function.
// ABOUTME: Tests Document create/read/update/delete via action-routed handler.

const mockDocCreate = jest.fn();
const mockDocFetch = jest.fn();
const mockDocUpdate = jest.fn();
const mockDocRemove = jest.fn();

const mockDocuments = jest.fn((_name) => ({
  fetch: mockDocFetch,
  update: mockDocUpdate,
  remove: mockDocRemove,
}));
mockDocuments.create = mockDocCreate;

const mockSyncService = { documents: mockDocuments };

jest.mock('twilio', () => {
  const TwilioMock = jest.fn(() => ({
    sync: {
      v1: {
        services: jest.fn(() => mockSyncService),
      },
    },
  }));
  return TwilioMock;
});

const Twilio = require('twilio');

const { handler } = require('../../../functions/sync/document-crud.protected');

describe('document-crud handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    jest.clearAllMocks();

    context = {
      TWILIO_SYNC_SERVICE_SID: 'IStest123',
      getTwilioClient: () => new Twilio(),
    };

    callback = jest.fn();
  });

  // --- Happy path tests ---

  describe('create action', () => {
    it('should create a document with valid name and data', async () => {
      mockDocCreate.mockResolvedValue({
        sid: 'ET0001',
        uniqueName: 'app-config',
        data: { theme: 'dark' },
      });

      const event = {
        action: 'create',
        documentName: 'app-config',
        data: JSON.stringify({ theme: 'dark' }),
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.sid).toBe('ET0001');
      expect(response.documentName).toBe('app-config');
      expect(response.data).toEqual({ theme: 'dark' });
    });

    it('should pass TTL to API when provided', async () => {
      mockDocCreate.mockResolvedValue({
        sid: 'ET0002',
        uniqueName: 'temp-doc',
        data: { temp: true },
      });

      const event = {
        action: 'create',
        documentName: 'temp-doc',
        data: JSON.stringify({ temp: true }),
        ttl: '3600',
      };

      await handler(context, event, callback);

      expect(mockDocCreate).toHaveBeenCalledWith(
        expect.objectContaining({ ttl: 3600 })
      );
    });
  });

  describe('read action', () => {
    it('should read an existing document', async () => {
      mockDocFetch.mockResolvedValue({
        sid: 'ET0001',
        uniqueName: 'app-config',
        data: { theme: 'dark' },
        dateUpdated: '2026-03-01T10:00:00.000Z',
      });

      const event = {
        action: 'read',
        documentName: 'app-config',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.sid).toBe('ET0001');
      expect(response.data).toEqual({ theme: 'dark' });
      expect(response.dateUpdated).toBe('2026-03-01T10:00:00.000Z');
    });
  });

  describe('update action', () => {
    it('should update an existing document', async () => {
      mockDocUpdate.mockResolvedValue({
        sid: 'ET0001',
        uniqueName: 'app-config',
        data: { theme: 'light' },
        dateUpdated: '2026-03-01T10:05:00.000Z',
      });

      const event = {
        action: 'update',
        documentName: 'app-config',
        data: JSON.stringify({ theme: 'light' }),
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.data).toEqual({ theme: 'light' });
      expect(response.dateUpdated).toBe('2026-03-01T10:05:00.000Z');
    });

    it('should pass TTL to API on update when provided', async () => {
      mockDocUpdate.mockResolvedValue({
        sid: 'ET0001',
        uniqueName: 'app-config',
        data: { theme: 'light' },
        dateUpdated: '2026-03-01T10:05:00.000Z',
      });

      const event = {
        action: 'update',
        documentName: 'app-config',
        data: JSON.stringify({ theme: 'light' }),
        ttl: '7200',
      };

      await handler(context, event, callback);

      expect(mockDocUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ ttl: 7200 })
      );
    });
  });

  describe('delete action', () => {
    it('should delete an existing document', async () => {
      mockDocRemove.mockResolvedValue(true);

      const event = {
        action: 'delete',
        documentName: 'app-config',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.documentName).toBe('app-config');
    });
  });

  // --- Validation error tests ---

  describe('validation errors', () => {
    it('should return error when action is missing', async () => {
      const event = { documentName: 'test' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('action');
    });

    it('should return error when action is invalid', async () => {
      const event = { action: 'invalid', documentName: 'test' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('action');
    });

    it('should return error when documentName is missing', async () => {
      const event = { action: 'read' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('documentName');
    });

    it('should return error when data is missing on create', async () => {
      const event = { action: 'create', documentName: 'test' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('data');
    });

    it('should return error when data is missing on update', async () => {
      const event = { action: 'update', documentName: 'test' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('data');
    });

    it('should return error when data is invalid JSON', async () => {
      const event = {
        action: 'create',
        documentName: 'test',
        data: '{not valid json}',
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('Invalid JSON');
    });

    it('should return error when TWILIO_SYNC_SERVICE_SID is not configured', async () => {
      const contextWithoutSid = {
        ...context,
        TWILIO_SYNC_SERVICE_SID: undefined,
      };

      const event = {
        action: 'read',
        documentName: 'test',
      };

      await handler(contextWithoutSid, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('TWILIO_SYNC_SERVICE_SID not configured');
    });
  });

  // --- Twilio API error tests ---

  describe('Twilio API errors', () => {
    it('should return not found error for Twilio 20404', async () => {
      const notFoundError = new Error('Not found');
      notFoundError.code = 20404;
      mockDocFetch.mockRejectedValue(notFoundError);

      const event = {
        action: 'read',
        documentName: 'nonexistent',
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
      expect(response.error).toContain('nonexistent');
    });

    it('should return conflict error for Twilio 54302', async () => {
      const conflictError = new Error('Unique name already exists');
      conflictError.code = 54302;
      mockDocCreate.mockRejectedValue(conflictError);

      const event = {
        action: 'create',
        documentName: 'existing-doc',
        data: JSON.stringify({ test: true }),
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('already exists');
      expect(response.error).toContain('existing-doc');
    });

    it('should pass through unexpected Twilio error messages', async () => {
      const unexpectedError = new Error('Service temporarily unavailable');
      unexpectedError.code = 50000;
      mockDocFetch.mockRejectedValue(unexpectedError);

      const event = {
        action: 'read',
        documentName: 'test',
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toBe('Service temporarily unavailable');
    });
  });
});
