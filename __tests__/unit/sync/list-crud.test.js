// ABOUTME: Unit tests for the list-crud Sync function.
// ABOUTME: Tests List create and item add/list/update/remove via action-routed handler.

const mockListCreate = jest.fn();
const mockListFetch = jest.fn();
const mockListRemove = jest.fn();
const mockListItemCreate = jest.fn();
const mockListItemList = jest.fn();
const mockListItemUpdate = jest.fn();
const mockListItemRemove = jest.fn();

const mockSyncListItems = jest.fn((_index) => ({
  update: mockListItemUpdate,
  remove: mockListItemRemove,
}));
mockSyncListItems.create = mockListItemCreate;
mockSyncListItems.list = mockListItemList;

const mockSyncLists = jest.fn((_name) => ({
  fetch: mockListFetch,
  remove: mockListRemove,
  syncListItems: mockSyncListItems,
}));
mockSyncLists.create = mockListCreate;

const mockSyncService = { syncLists: mockSyncLists };

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

const { handler } = require('../../../functions/sync/list-crud.protected');

describe('list-crud handler', () => {
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
    it('should create a list with valid name', async () => {
      mockListCreate.mockResolvedValue({
        sid: 'ES0001',
        uniqueName: 'chat-messages',
      });

      const event = {
        action: 'create',
        listName: 'chat-messages',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.sid).toBe('ES0001');
      expect(response.listName).toBe('chat-messages');
    });

    it('should pass TTL to API when provided', async () => {
      mockListCreate.mockResolvedValue({
        sid: 'ES0002',
        uniqueName: 'temp-list',
      });

      const event = {
        action: 'create',
        listName: 'temp-list',
        ttl: '3600',
      };

      await handler(context, event, callback);

      expect(mockListCreate).toHaveBeenCalledWith(
        expect.objectContaining({ ttl: 3600 })
      );
    });
  });

  describe('addItem action', () => {
    it('should add an item to a list', async () => {
      mockListItemCreate.mockResolvedValue({
        index: 0,
        data: { sender: 'user123', text: 'Hello' },
      });

      const event = {
        action: 'addItem',
        listName: 'chat-messages',
        data: JSON.stringify({ sender: 'user123', text: 'Hello' }),
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.index).toBe(0);
      expect(response.data).toEqual({ sender: 'user123', text: 'Hello' });
    });

    it('should pass TTL when adding item', async () => {
      mockListItemCreate.mockResolvedValue({
        index: 1,
        data: { temp: true },
      });

      const event = {
        action: 'addItem',
        listName: 'chat-messages',
        data: JSON.stringify({ temp: true }),
        ttl: '300',
      };

      await handler(context, event, callback);

      expect(mockListItemCreate).toHaveBeenCalledWith(
        expect.objectContaining({ ttl: 300 })
      );
    });
  });

  describe('listItems action', () => {
    it('should list items with default parameters', async () => {
      mockListItemList.mockResolvedValue([
        { index: 0, data: { sender: 'user123', text: 'Hello' } },
        { index: 1, data: { sender: 'user456', text: 'Hi!' } },
      ]);

      const event = {
        action: 'listItems',
        listName: 'chat-messages',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.items).toHaveLength(2);
      expect(response.count).toBe(2);
    });

    it('should pass limit and order when provided', async () => {
      mockListItemList.mockResolvedValue([]);

      const event = {
        action: 'listItems',
        listName: 'chat-messages',
        limit: '10',
        order: 'desc',
      };

      await handler(context, event, callback);

      expect(mockListItemList).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, order: 'desc' })
      );
    });
  });

  describe('updateItem action', () => {
    it('should update an item by index', async () => {
      mockListItemUpdate.mockResolvedValue({
        index: 0,
        data: { sender: 'user123', text: 'Hello (edited)' },
      });

      const event = {
        action: 'updateItem',
        listName: 'chat-messages',
        index: '0',
        data: JSON.stringify({ sender: 'user123', text: 'Hello (edited)' }),
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.index).toBe(0);
      expect(response.data).toEqual({ sender: 'user123', text: 'Hello (edited)' });
    });
  });

  describe('removeItem action', () => {
    it('should remove an item by index', async () => {
      mockListItemRemove.mockResolvedValue(true);

      const event = {
        action: 'removeItem',
        listName: 'chat-messages',
        index: '0',
      };

      await handler(context, event, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const [error, response] = callback.mock.calls[0];
      expect(error).toBeNull();
      expect(response.success).toBe(true);
      expect(response.listName).toBe('chat-messages');
      expect(response.index).toBe(0);
    });
  });

  // --- Validation error tests ---

  describe('validation errors', () => {
    it('should return error when action is missing', async () => {
      const event = { listName: 'test' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('action');
    });

    it('should return error when action is invalid', async () => {
      const event = { action: 'invalid', listName: 'test' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('action');
    });

    it('should return error when listName is missing', async () => {
      const event = { action: 'create' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('listName');
    });

    it('should return error when data is missing on addItem', async () => {
      const event = { action: 'addItem', listName: 'test' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('data');
    });

    it('should return error when index is missing on updateItem', async () => {
      const event = {
        action: 'updateItem',
        listName: 'test',
        data: JSON.stringify({ test: true }),
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('index');
    });

    it('should return error when index is missing on removeItem', async () => {
      const event = { action: 'removeItem', listName: 'test' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('index');
    });

    it('should return error when data is missing on updateItem', async () => {
      const event = { action: 'updateItem', listName: 'test', index: '0' };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('data');
    });

    it('should return error when data is invalid JSON', async () => {
      const event = {
        action: 'addItem',
        listName: 'test',
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
        listName: 'test',
      };

      await handler(contextWithoutSid, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('TWILIO_SYNC_SERVICE_SID not configured');
    });
  });

  // --- Twilio API error tests ---

  describe('Twilio API errors', () => {
    it('should return not found error for list (20404)', async () => {
      const notFoundError = new Error('Not found');
      notFoundError.code = 20404;
      mockListItemList.mockRejectedValue(notFoundError);

      const event = {
        action: 'listItems',
        listName: 'nonexistent',
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should return not found error for list item (20404)', async () => {
      const notFoundError = new Error('Not found');
      notFoundError.code = 20404;
      mockListItemUpdate.mockRejectedValue(notFoundError);

      const event = {
        action: 'updateItem',
        listName: 'chat-messages',
        index: '999',
        data: JSON.stringify({ test: true }),
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should return conflict error for duplicate list (54302)', async () => {
      const conflictError = new Error('Unique name already exists');
      conflictError.code = 54302;
      mockListCreate.mockRejectedValue(conflictError);

      const event = {
        action: 'create',
        listName: 'existing-list',
      };

      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('already exists');
      expect(response.error).toContain('existing-list');
    });
  });
});
