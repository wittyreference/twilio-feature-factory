// ABOUTME: Unit tests for the blackjack Sync helper (create, fetch, update game docs).
// ABOUTME: Verifies Sync operations with error handling for 20404 and 54302 error codes.

const { createGameDoc, fetchGameDoc, updateGameDoc } = require('../../../../functions/helpers/blackjack-sync.private');

function makeMockClient({ fetchData = null, fetchError = null, createError = null } = {}) {
  const mockUpdate = jest.fn().mockResolvedValue({ data: {} });
  const mockFetch = fetchError
    ? jest.fn().mockRejectedValue(fetchError)
    : jest.fn().mockResolvedValue({ data: fetchData });
  const mockCreate = createError
    ? jest.fn().mockRejectedValue(createError)
    : jest.fn().mockResolvedValue({ data: {} });
  const mockRemove = jest.fn().mockResolvedValue();

  const documentsChain = jest.fn((_name) => ({
    fetch: mockFetch,
    update: mockUpdate,
    remove: mockRemove,
  }));
  documentsChain.create = mockCreate;

  const client = {
    sync: {
      v1: {
        services: jest.fn(() => ({
          documents: documentsChain,
        })),
      },
    },
  };

  return { client, mockCreate, mockFetch, mockUpdate, documentsChain };
}

const SYNC_SID = 'IS1234567890';

describe('blackjack-sync', () => {
  describe('createGameDoc', () => {
    it('creates a document when it does not exist (20404 on update)', async () => {
      const notFoundError = new Error('Not found');
      notFoundError.code = 20404;
      // Update fails with 20404, then create succeeds
      const { client, mockCreate, mockUpdate } = makeMockClient({ fetchError: notFoundError });
      mockUpdate.mockRejectedValueOnce(notFoundError);
      const gameState = { gameId: 'bj-123', status: 'player_turn' };

      await createGameDoc(client, SYNC_SID, 'CAxxx', gameState);

      expect(mockCreate).toHaveBeenCalledWith({
        uniqueName: 'blackjack-CAxxx',
        data: gameState,
        ttl: 86400,
      });
    });

    it('returns null if syncServiceSid is not set', async () => {
      const { client } = makeMockClient();
      const result = await createGameDoc(client, null, 'CAxxx', {});
      expect(result).toBeNull();
    });

    it('overwrites existing document on replay (update succeeds)', async () => {
      const { client, mockUpdate, mockCreate } = makeMockClient();

      await createGameDoc(client, SYNC_SID, 'CAxxx', { status: 'player_turn' });
      expect(mockUpdate).toHaveBeenCalledWith({ data: { status: 'player_turn' } });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('throws on unexpected update errors', async () => {
      const unexpectedError = new Error('Network error');
      unexpectedError.code = 500;
      const { client, mockUpdate } = makeMockClient();
      mockUpdate.mockRejectedValueOnce(unexpectedError);

      await expect(createGameDoc(client, SYNC_SID, 'CAxxx', {})).rejects.toThrow('Network error');
    });
  });

  describe('fetchGameDoc', () => {
    it('returns document data', async () => {
      const { client } = makeMockClient({ fetchData: { status: 'player_turn' } });

      const result = await fetchGameDoc(client, SYNC_SID, 'CAxxx');
      expect(result).toEqual({ status: 'player_turn' });
    });

    it('returns null if syncServiceSid is not set', async () => {
      const { client } = makeMockClient();
      const result = await fetchGameDoc(client, null, 'CAxxx');
      expect(result).toBeNull();
    });

    it('returns null on 20404 (not found)', async () => {
      const notFoundError = new Error('Not found');
      notFoundError.code = 20404;
      const { client } = makeMockClient({ fetchError: notFoundError });

      const result = await fetchGameDoc(client, SYNC_SID, 'CAxxx');
      expect(result).toBeNull();
    });

    it('throws on unexpected errors', async () => {
      const unexpectedError = new Error('Server error');
      unexpectedError.code = 500;
      const { client } = makeMockClient({ fetchError: unexpectedError });

      await expect(fetchGameDoc(client, SYNC_SID, 'CAxxx')).rejects.toThrow('Server error');
    });
  });

  describe('updateGameDoc', () => {
    it('updates the document with new state', async () => {
      const { client, mockUpdate } = makeMockClient();
      const newState = { status: 'dealer_turn' };

      await updateGameDoc(client, SYNC_SID, 'CAxxx', newState);
      expect(mockUpdate).toHaveBeenCalledWith({ data: newState });
    });

    it('returns null if syncServiceSid is not set', async () => {
      const { client } = makeMockClient();
      const result = await updateGameDoc(client, null, 'CAxxx', {});
      expect(result).toBeNull();
    });
  });
});
