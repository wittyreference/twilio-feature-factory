// ABOUTME: Unit tests for the blackjack dealer-turn handler.
// ABOUTME: Verifies hole card reveal, dealer draw narration, and Sync state update.

const Twilio = require('twilio');
const path = require('path');

global.Twilio = Twilio;
global.Runtime = {
  getFunctions: () => ({
    'helpers/blackjack-engine': { path: path.resolve(__dirname, '../../../../functions/helpers/blackjack-engine.private') },
    'helpers/blackjack-sync': { path: path.resolve(__dirname, '../../../../functions/helpers/blackjack-sync.private') },
  }),
};

jest.mock('../../../../functions/helpers/blackjack-sync.private', () => ({
  createGameDoc: jest.fn().mockResolvedValue({}),
  fetchGameDoc: jest.fn(),
  updateGameDoc: jest.fn().mockResolvedValue({}),
}));

const sync = require('../../../../functions/helpers/blackjack-sync.private');
const handler = require('../../../../functions/voice/blackjack/dealer-turn.protected').handler;

describe('dealer-turn', () => {
  let context, callback;

  beforeEach(() => {
    context = {
      ...global.createTestContext(),
      TWILIO_SYNC_SERVICE_SID: 'IS1234',
      getTwilioClient: jest.fn().mockReturnValue({}),
    };
    callback = global.createTestCallback();
    sync.fetchGameDoc.mockReset();
    sync.updateGameDoc.mockClear();
  });

  it('game not found → redirect to welcome', async () => {
    sync.fetchGameDoc.mockResolvedValue(null);
    await handler(context, { CallSid: 'CAxxx' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Redirect>/voice/blackjack/welcome</Redirect>');
  });

  it('reveals hole card', async () => {
    sync.fetchGameDoc.mockResolvedValue({
      gameId: 'bj-test', callSid: 'CAxxx', status: 'dealer_turn', outcome: null,
      playerHand: [{ rank: '10', suit: 'hearts' }, { rank: '8', suit: 'clubs' }],
      dealerHand: [{ rank: '10', suit: 'spades' }, { rank: '7', suit: 'diamonds' }],
      deck: [], moves: [{ action: 'deal', timestamp: '2024-01-01', detail: 'test' }],
      dealerHoleRevealed: false, startTime: '2024-01-01', endTime: null,
    });
    await handler(context, { CallSid: 'CAxxx' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml.toLowerCase()).toContain('reveal');
    expect(twiml).toContain('7 of Diamonds');
  });

  it('stands at 17 — dealer keeps 2 cards', async () => {
    sync.fetchGameDoc.mockResolvedValue({
      gameId: 'bj-test', callSid: 'CAxxx', status: 'dealer_turn', outcome: null,
      playerHand: [{ rank: '10', suit: 'hearts' }, { rank: '8', suit: 'clubs' }],
      dealerHand: [{ rank: '10', suit: 'spades' }, { rank: '7', suit: 'diamonds' }],
      deck: [{ rank: '3', suit: 'clubs' }],
      moves: [{ action: 'deal', timestamp: '2024-01-01', detail: 'test' }],
      dealerHoleRevealed: false, startTime: '2024-01-01', endTime: null,
    });
    await handler(context, { CallSid: 'CAxxx' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Redirect>/voice/blackjack/game-over</Redirect>');
    // Verify updateGameDoc was called with completed state
    const updatedState = sync.updateGameDoc.mock.calls[0][3];
    expect(updatedState.dealerHand).toHaveLength(2);
  });

  it('updates Sync with completed state', async () => {
    sync.fetchGameDoc.mockResolvedValue({
      gameId: 'bj-test', callSid: 'CAxxx', status: 'dealer_turn', outcome: null,
      playerHand: [{ rank: '10', suit: 'hearts' }, { rank: '8', suit: 'clubs' }],
      dealerHand: [{ rank: '10', suit: 'spades' }, { rank: '7', suit: 'diamonds' }],
      deck: [],
      moves: [{ action: 'deal', timestamp: '2024-01-01', detail: 'test' }],
      dealerHoleRevealed: false, startTime: '2024-01-01', endTime: null,
    });
    await handler(context, { CallSid: 'CAxxx' }, callback);
    expect(sync.updateGameDoc).toHaveBeenCalled();
    const updatedState = sync.updateGameDoc.mock.calls[0][3];
    expect(updatedState.status).toBe('complete');
    expect(updatedState.outcome).toBeDefined();
    expect(updatedState.dealerHoleRevealed).toBe(true);
  });
});
