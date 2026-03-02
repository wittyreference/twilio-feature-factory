// ABOUTME: Unit tests for the map-crud Sync function.
// ABOUTME: Tests Map create and item set/get/update/remove/list via action-routed handler.

const mockMapCreate = jest.fn();
const mockMapFetch = jest.fn();
const mockMapRemove = jest.fn();
const mockMapItemCreate = jest.fn();
const mockMapItemFetch = jest.fn();
const mockMapItemList = jest.fn();
const mockMapItemUpdate = jest.fn();
const mockMapItemRemove = jest.fn();

const mockSyncMapItems = jest.fn((_key) => ({
  fetch: mockMapItemFetch,
  update: mockMapItemUpdate,
  remove: mockMapItemRemove,
}));
mockSyncMapItems.create = mockMapItemCreate;
mockSyncMapItems.list = mockMapItemList;

const mockSyncMaps = jest.fn((_name) => ({
  fetch: mockMapFetch,
  remove: mockMapRemove,
  syncMapItems: mockSyncMapItems,
}));
mockSyncMaps.create = mockMapCreate;

const mockSyncService = { syncMaps: mockSyncMaps };

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

const { handler } = require('../../../functions/sync/map-crud.protected');

describe('map-crud handler', () => {
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
    it('should create a map with valid name', async () => {
      mockMapCreate.mockResolvedValue({
        sid: 'MP0001',
        uniqueName: 'user-sessions',
      });

      const event = {
        action: 'create',
        mapName: 'user-sessions',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.sid).toBe('MP0001');
      expect(response.mapName).toBe('user-sessions');
    });

    it('should pass TTL to API when provided', async () => {
      mockMapCreate.mockResolvedValue({
        sid: 'MP0002',
        uniqueName: 'temp-map',
      });

      const event = {
        action: 'create',
        mapName: 'temp-map',
        ttl: '3600',
      };

      await handler(context, event, callback);

      expect(mockMapCreate).toHaveBeenCalledWith(
        expect.objectContaining({ ttl: 3600 })
      );
    });
  });

  describe('setItem action', () => {
    it('should set a map item by key', async () => {
      mockMapItemCreate.mockResolvedValue({
        key: 'user-123',
        data: { status: 'online', lastSeen: '2026-03-01T10:00:00.000Z' },
      });

      const event = {
        action: 'setItem',
        mapName: 'user-sessions',
        key: 'user-123',
        data: JSON.stringify({ status: 'online', lastSeen: '2026-03-01T10:00:00.000Z' }),
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.key).toBe('user-123');
      expect(response.data).toEqual({ status: 'online', lastSeen: '2026-03-01T10:00:00.000Z' });
    });

    it('should pass TTL when setting item', async () => {
      mockMapItemCreate.mockResolvedValue({
        key: 'user-123',
        data: { status: 'online' },
      });

      const event = {
        action: 'setItem',
        mapName: 'user-sessions',
        key: 'user-123',
        data: JSON.stringify({ status: 'online' }),
        ttl: '300',
      };

      await handler(context, event, callback);

      expect(mockMapItemCreate).toHaveBeenCalledWith(
        expect.objectContaining({ ttl: 300 })
      );
    });
  });

  describe('getItem action', () => {
    it('should get a map item by key', async () => {
      mockMapItemFetch.mockResolvedValue({
        key: 'user-123',
        data: { status: 'online' },
        dateUpdated: '2026-03-01T10:00:00.000Z',
      });

      const event = {
        action: 'getItem',
        mapName: 'user-sessions',
        key: 'user-123',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.key).toBe('user-123');
      expect(response.data).toEqual({ status: 'online' });
      expect(response.dateUpdated).toBe('2026-03-01T10:00:00.000Z');
    });
  });

  describe('updateItem action', () => {
    it('should update a map item by key', async () => {
      mockMapItemUpdate.mockResolvedValue({
        key: 'user-123',
        data: { status: 'away' },
        dateUpdated: '2026-03-01T10:05:00.000Z',
      });

      const event = {
        action: 'updateItem',
        mapName: 'user-sessions',
        key: 'user-123',
        data: JSON.stringify({ status: 'away' }),
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.key).toBe('user-123');
      expect(response.data).toEqual({ status: 'away' });
      expect(response.dateUpdated).toBe('2026-03-01T10:05:00.000Z');
    });
  });

  describe('removeItem action', () => {
    it('should remove a map item by key', async () => {
      mockMapItemRemove.mockResolvedValue(true);

      const event = {
        action: 'removeItem',
        mapName: 'user-sessions',
        key: 'user-123',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.mapName).toBe('user-sessions');
      expect(response.key).toBe('user-123');
    });
  });

  describe('listItems action', () => {
    it('should list map items with defaults', async () => {
      mockMapItemList.mockResolvedValue([
        { key: 'user-123', data: { status: 'online' } },
        { key: 'user-456', data: { status: 'away' } },
      ]);

      const event = {
        action: 'listItems',
        mapName: 'user-sessions',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.items).toHaveLength(2);
      expect(response.count).toBe(2);
    });

    it('should pass limit when provided', async () => {
      mockMapItemList.mockResolvedValue([]);

      const event = {
        action: 'listItems',
        mapName: 'user-sessions',
        limit: '5',
      };

      await handler(context, event, callback);

      expect(mockMapItemList).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5 })
      );
    });
  });

  // --- Validation error tests ---

  describe('validation errors', () => {
    it('should return error when action is missing', async () => {
      const event = { mapName: 'test' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('action');
    });

    it('should return error when action is invalid', async () => {
      const event = { action: 'invalid', mapName: 'test' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('action');
    });

    it('should return error when mapName is missing', async () => {
      const event = { action: 'create' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('mapName');
    });

    it('should return error when key is missing on setItem', async () => {
      const event = {
        action: 'setItem',
        mapName: 'test',
        data: JSON.stringify({ test: true }),
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('key');
    });

    it('should return error when data is missing on setItem', async () => {
      const event = {
        action: 'setItem',
        mapName: 'test',
        key: 'test-key',
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('data');
    });

    it('should return error when key is missing on getItem', async () => {
      const event = { action: 'getItem', mapName: 'test' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('key');
    });

    it('should return error when key is missing on updateItem', async () => {
      const event = {
        action: 'updateItem',
        mapName: 'test',
        data: JSON.stringify({ test: true }),
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('key');
    });

    it('should return error when data is missing on updateItem', async () => {
      const event = {
        action: 'updateItem',
        mapName: 'test',
        key: 'test-key',
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('data');
    });

    it('should return error when key is missing on removeItem', async () => {
      const event = { action: 'removeItem', mapName: 'test' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('key');
    });

    it('should return error when data is invalid JSON', async () => {
      const event = {
        action: 'setItem',
        mapName: 'test',
        key: 'test-key',
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
        action: 'create',
        mapName: 'test',
      };

      await handler(contextWithoutSid, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('TWILIO_SYNC_SERVICE_SID not configured');
    });
  });

  // --- Twilio API error tests ---

  describe('Twilio API errors', () => {
    it('should return not found error for map (20404)', async () => {
      const notFoundError = new Error('Not found');
      notFoundError.code = 20404;
      mockMapItemList.mockRejectedValue(notFoundError);

      const event = {
        action: 'listItems',
        mapName: 'nonexistent',
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should return not found error for map item (20404)', async () => {
      const notFoundError = new Error('Not found');
      notFoundError.code = 20404;
      mockMapItemFetch.mockRejectedValue(notFoundError);

      const event = {
        action: 'getItem',
        mapName: 'user-sessions',
        key: 'nonexistent-key',
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should return conflict error for duplicate map (54302)', async () => {
      const conflictError = new Error('Unique name already exists');
      conflictError.code = 54302;
      mockMapCreate.mockRejectedValue(conflictError);

      const event = {
        action: 'create',
        mapName: 'existing-map',
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('already exists');
      expect(response.error).toContain('existing-map');
    });
  });
});
