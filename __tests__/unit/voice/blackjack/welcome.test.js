// ABOUTME: Unit tests for the blackjack welcome voice handler.
// ABOUTME: Verifies deal, narration, gather setup, and natural blackjack detection.

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

const engine = require('../../../../functions/helpers/blackjack-engine.private');
const sync = require('../../../../functions/helpers/blackjack-sync.private');
const handler = require('../../../../functions/voice/blackjack/welcome').handler;

describe('welcome', () => {
  let context, callback;

  beforeEach(() => {
    context = {
      ...global.createTestContext(),
      TWILIO_SYNC_SERVICE_SID: 'IS1234',
      getTwilioClient: jest.fn().mockReturnValue({}),
    };
    callback = global.createTestCallback();
    jest.restoreAllMocks();
  });

  it('creates Sync doc with callSid and status', async () => {
    jest.spyOn(engine, 'createGame').mockReturnValue({
      gameId: 'bj-test', callSid: 'CAxxx', status: 'player_turn', outcome: null,
      playerHand: [{ rank: '7', suit: 'hearts' }, { rank: '9', suit: 'clubs' }],
      dealerHand: [{ rank: 'K', suit: 'spades' }, { rank: '6', suit: 'diamonds' }],
      deck: [], moves: [{ action: 'deal', timestamp: '2024-01-01', detail: 'test' }],
      dealerHoleRevealed: false, startTime: '2024-01-01', endTime: null,
    });

    await handler(context, { CallSid: 'CAxxx' }, callback);
    expect(sync.createGameDoc).toHaveBeenCalledWith(
      expect.anything(), 'IS1234', 'CAxxx', expect.objectContaining({ status: 'player_turn' })
    );
  });

  it('TwiML has Gather with correct action and hints', async () => {
    jest.spyOn(engine, 'createGame').mockReturnValue({
      gameId: 'bj-test', callSid: 'CAxxx', status: 'player_turn', outcome: null,
      playerHand: [{ rank: '7', suit: 'hearts' }, { rank: '9', suit: 'clubs' }],
      dealerHand: [{ rank: 'K', suit: 'spades' }, { rank: '6', suit: 'diamonds' }],
      deck: [], moves: [{ action: 'deal', timestamp: '2024-01-01', detail: 'test' }],
      dealerHoleRevealed: false, startTime: '2024-01-01', endTime: null,
    });

    await handler(context, { CallSid: 'CAxxx' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Gather');
    expect(twiml).toContain('action="/voice/blackjack/action"');
    expect(twiml).toContain('hints="hit, hit me, card, another, stand, stay, hold"');
  });

  it('announces player hand and dealer up card', async () => {
    jest.spyOn(engine, 'createGame').mockReturnValue({
      gameId: 'bj-test', callSid: 'CAxxx', status: 'player_turn', outcome: null,
      playerHand: [{ rank: '7', suit: 'hearts' }, { rank: '9', suit: 'clubs' }],
      dealerHand: [{ rank: 'K', suit: 'spades' }, { rank: '6', suit: 'diamonds' }],
      deck: [], moves: [{ action: 'deal', timestamp: '2024-01-01', detail: 'test' }],
      dealerHoleRevealed: false, startTime: '2024-01-01', endTime: null,
    });

    await handler(context, { CallSid: 'CAxxx' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('7 of Hearts');
    expect(twiml).toContain('9 of Clubs');
    expect(twiml).toContain('King of Spades');
  });

  it('has no-input fallback containing "did not receive"', async () => {
    jest.spyOn(engine, 'createGame').mockReturnValue({
      gameId: 'bj-test', callSid: 'CAxxx', status: 'player_turn', outcome: null,
      playerHand: [{ rank: '7', suit: 'hearts' }, { rank: '9', suit: 'clubs' }],
      dealerHand: [{ rank: 'K', suit: 'spades' }, { rank: '6', suit: 'diamonds' }],
      deck: [], moves: [{ action: 'deal', timestamp: '2024-01-01', detail: 'test' }],
      dealerHoleRevealed: false, startTime: '2024-01-01', endTime: null,
    });

    await handler(context, { CallSid: 'CAxxx' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('did not receive');
  });

  it('natural player blackjack redirects to game-over', async () => {
    jest.spyOn(engine, 'createGame').mockReturnValue({
      gameId: 'bj-test', callSid: 'CAxxx', status: 'complete', outcome: 'player_blackjack',
      playerHand: [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }],
      dealerHand: [{ rank: '10', suit: 'clubs' }, { rank: '9', suit: 'diamonds' }],
      deck: [], moves: [{ action: 'deal', timestamp: '2024-01-01', detail: 'test' }],
      dealerHoleRevealed: false, startTime: '2024-01-01', endTime: '2024-01-01',
    });

    await handler(context, { CallSid: 'CAxxx' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml.toLowerCase()).toContain('blackjack');
    expect(twiml).toContain('<Redirect>/voice/blackjack/game-over</Redirect>');
  });

  it('dealer blackjack redirects to game-over', async () => {
    jest.spyOn(engine, 'createGame').mockReturnValue({
      gameId: 'bj-test', callSid: 'CAxxx', status: 'complete', outcome: 'dealer_blackjack',
      playerHand: [{ rank: '10', suit: 'clubs' }, { rank: '9', suit: 'diamonds' }],
      dealerHand: [{ rank: 'A', suit: 'clubs' }, { rank: 'Q', suit: 'diamonds' }],
      deck: [], moves: [{ action: 'deal', timestamp: '2024-01-01', detail: 'test' }],
      dealerHoleRevealed: false, startTime: '2024-01-01', endTime: '2024-01-01',
    });

    await handler(context, { CallSid: 'CAxxx' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml.toLowerCase()).toContain('dealer');
    expect(twiml.toLowerCase()).toContain('blackjack');
    expect(twiml).toContain('<Redirect>/voice/blackjack/game-over</Redirect>');
  });
});
