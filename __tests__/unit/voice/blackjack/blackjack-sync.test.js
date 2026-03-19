// ABOUTME: Unit tests for the blackjack Sync CRUD helper.
// ABOUTME: Verifies update-first pattern, 20404 fallback, and graceful null-syncSid handling.

const sync = require('../../../../functions/helpers/blackjack-sync.private');

function makeMockClient({ fetchData, fetchError, createError } = {}) {
  const mockUpdate = jest.fn();
  const mockFetch = jest.fn();
  const mockCreate = jest.fn();

  if (fetchData) {
    mockFetch.mockResolvedValue({ data: fetchData });
  } else if (fetchError) {
    mockFetch.mockRejectedValue(fetchError);
  }

  mockUpdate.mockResolvedValue({});
  mockCreate.mockResolvedValue({});

  if (createError) {
    mockCreate.mockRejectedValue(createError);
  }

  const documentsChain = jest.fn().mockReturnValue({
    update: mockUpdate,
    fetch: mockFetch,
  });
  documentsChain.create = mockCreate;

  const client = {
    sync: {
      v1: {
        services: jest.fn().mockReturnValue({
          documents: documentsChain,
        }),
      },
    },
  };

  return { client, mockCreate, mockFetch, mockUpdate, documentsChain };
}

describe('blackjack-sync', () => {
  describe('createGameDoc', () => {
    it('uses update first — no create called when update succeeds', async () => {
      const { client, mockCreate, mockUpdate } = makeMockClient();
      await sync.createGameDoc(client, 'ISxxx', 'CAxxx', { test: true });
      expect(mockUpdate).toHaveBeenCalledWith({ data: { test: true } });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('falls back to create on 20404', async () => {
      const error = new Error('Not found');
      error.code = 20404;
      const { client, mockCreate, mockUpdate } = makeMockClient();
      mockUpdate.mockRejectedValue(error);
      await sync.createGameDoc(client, 'ISxxx', 'CAxxx', { test: true });
      expect(mockCreate).toHaveBeenCalledWith({
        uniqueName: 'blackjack-CAxxx',
        data: { test: true },
        ttl: 86400,
      });
    });

    it('returns null when syncSid is null', async () => {
      const result = await sync.createGameDoc({}, null, 'CAxxx', {});
      expect(result).toBeNull();
    });

    it('throws on unexpected error', async () => {
      const error = new Error('Server error');
      error.code = 500;
      const { client, mockUpdate } = makeMockClient();
      mockUpdate.mockRejectedValue(error);
      await expect(sync.createGameDoc(client, 'ISxxx', 'CAxxx', {})).rejects.toThrow('Server error');
    });
  });

  describe('fetchGameDoc', () => {
    it('returns doc.data', async () => {
      const { client } = makeMockClient({ fetchData: { gameId: 'bj-123' } });
      const result = await sync.fetchGameDoc(client, 'ISxxx', 'CAxxx');
      expect(result).toEqual({ gameId: 'bj-123' });
    });

    it('returns null when syncSid is null', async () => {
      const result = await sync.fetchGameDoc({}, null, 'CAxxx');
      expect(result).toBeNull();
    });

    it('returns null on 20404', async () => {
      const error = new Error('Not found');
      error.code = 20404;
      const { client } = makeMockClient({ fetchError: error });
      const result = await sync.fetchGameDoc(client, 'ISxxx', 'CAxxx');
      expect(result).toBeNull();
    });

    it('throws on unexpected error', async () => {
      const error = new Error('Server error');
      error.code = 500;
      const { client } = makeMockClient({ fetchError: error });
      await expect(sync.fetchGameDoc(client, 'ISxxx', 'CAxxx')).rejects.toThrow('Server error');
    });
  });

  describe('updateGameDoc', () => {
    it('calls update with data', async () => {
      const { client, mockUpdate } = makeMockClient();
      await sync.updateGameDoc(client, 'ISxxx', 'CAxxx', { status: 'complete' });
      expect(mockUpdate).toHaveBeenCalledWith({ data: { status: 'complete' } });
    });

    it('returns null when syncSid is null', async () => {
      const result = await sync.updateGameDoc({}, null, 'CAxxx', {});
      expect(result).toBeNull();
    });
  });
});
