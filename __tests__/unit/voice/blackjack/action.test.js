// ABOUTME: Unit tests for the blackjack action handler (hit/stand loop).
// ABOUTME: Verifies input classification, game state transitions, and Sync updates.

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
const handler = require('../../../../functions/voice/blackjack/action.protected').handler;

const baseGame = {
  gameId: 'bj-test', callSid: 'CAxxx', status: 'player_turn', outcome: null,
  playerHand: [{ rank: '7', suit: 'hearts' }, { rank: '5', suit: 'clubs' }],
  dealerHand: [{ rank: 'K', suit: 'spades' }, { rank: '6', suit: 'diamonds' }],
  deck: [{ rank: '2', suit: 'spades' }, { rank: '9', suit: 'diamonds' }, { rank: '3', suit: 'clubs' }],
  moves: [{ action: 'deal', timestamp: '2024-01-01', detail: 'test' }],
  dealerHoleRevealed: false, startTime: '2024-01-01', endTime: null,
};

describe('action', () => {
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

  it('unknown input (Digits=9) → re-gather with "did not understand"', async () => {
    sync.fetchGameDoc.mockResolvedValue({ ...baseGame });
    await handler(context, { CallSid: 'CAxxx', Digits: '9' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml.toLowerCase()).toContain('did not understand');
    expect(twiml).toContain('<Gather');
  });

  it('stand (Digits=2) → "stand" + redirect to dealer-turn + updateGameDoc called', async () => {
    sync.fetchGameDoc.mockResolvedValue({ ...baseGame });
    await handler(context, { CallSid: 'CAxxx', Digits: '2' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml.toLowerCase()).toContain('stand');
    expect(twiml).toContain('<Redirect>/voice/blackjack/dealer-turn</Redirect>');
    expect(sync.updateGameDoc).toHaveBeenCalled();
  });

  it('hit (Digits=1, 2♠ on deck top) → "drew" + Gather + updateGameDoc called', async () => {
    sync.fetchGameDoc.mockResolvedValue({ ...baseGame });
    await handler(context, { CallSid: 'CAxxx', Digits: '1' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml.toLowerCase()).toContain('drew');
    expect(twiml).toContain('<Gather');
    expect(sync.updateGameDoc).toHaveBeenCalled();
  });

  it('bust (hand=10♥6♣, K♠ on deck) → "busted" + redirect to game-over', async () => {
    const bustGame = {
      ...baseGame,
      playerHand: [{ rank: '10', suit: 'hearts' }, { rank: '6', suit: 'clubs' }],
      deck: [{ rank: 'K', suit: 'spades' }],
    };
    sync.fetchGameDoc.mockResolvedValue(bustGame);
    await handler(context, { CallSid: 'CAxxx', Digits: '1' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml.toLowerCase()).toContain('bust');
    expect(twiml).toContain('<Redirect>/voice/blackjack/game-over</Redirect>');
  });

  it('21 (hand=10♥5♣, 6♠ on deck) → "21" + redirect to dealer-turn', async () => {
    const game21 = {
      ...baseGame,
      playerHand: [{ rank: '10', suit: 'hearts' }, { rank: '5', suit: 'clubs' }],
      deck: [{ rank: '6', suit: 'spades' }],
    };
    sync.fetchGameDoc.mockResolvedValue(game21);
    await handler(context, { CallSid: 'CAxxx', Digits: '1' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('21');
    expect(twiml).toContain('<Redirect>/voice/blackjack/dealer-turn</Redirect>');
  });

  it('speech "hit me" works', async () => {
    sync.fetchGameDoc.mockResolvedValue({ ...baseGame });
    await handler(context, { CallSid: 'CAxxx', SpeechResult: 'hit me' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml.toLowerCase()).toContain('drew');
  });

  it('speech "stand" works', async () => {
    sync.fetchGameDoc.mockResolvedValue({ ...baseGame });
    await handler(context, { CallSid: 'CAxxx', SpeechResult: 'stand' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml.toLowerCase()).toContain('stand');
    expect(twiml).toContain('<Redirect>/voice/blackjack/dealer-turn</Redirect>');
  });
});
