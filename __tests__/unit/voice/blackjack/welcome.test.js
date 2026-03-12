// ABOUTME: Unit tests for the blackjack welcome handler (entry point, deal, initial gather).
// ABOUTME: Tests TwiML output, Sync document creation, and natural blackjack detection.

const Twilio = require('twilio');
const path = require('path');

global.Twilio = Twilio;

global.Runtime = {
  getFunctions: () => ({
    'helpers/blackjack-engine': {
      path: path.resolve(__dirname, '../../../../functions/helpers/blackjack-engine.private'),
    },
    'helpers/blackjack-sync': {
      path: path.resolve(__dirname, '../../../../functions/helpers/blackjack-sync.private'),
    },
  }),
};

jest.mock('../../../../functions/helpers/blackjack-sync.private', () => ({
  createGameDoc: jest.fn().mockResolvedValue({}),
  fetchGameDoc: jest.fn(),
  updateGameDoc: jest.fn().mockResolvedValue({}),
}));

const engine = require('../../../../functions/helpers/blackjack-engine.private');
const { handler } = require('../../../../functions/voice/blackjack/welcome');
const sync = require('../../../../functions/helpers/blackjack-sync.private');

// Deterministic game state for tests that need the normal (non-blackjack) flow
function makeNormalGame() {
  return {
    gameId: 'bj-test-123',
    callSid: 'CA123',
    deck: engine.createDeck().slice(4),
    playerHand: [
      { rank: '7', suit: 'hearts' },
      { rank: '9', suit: 'clubs' },
    ],
    dealerHand: [
      { rank: 'K', suit: 'spades' },
      { rank: '6', suit: 'diamonds' },
    ],
    dealerHoleRevealed: false,
    status: 'player_turn',
    outcome: null,
    moves: [{ action: 'deal', timestamp: new Date().toISOString(), detail: 'test deal' }],
    startTime: new Date().toISOString(),
    endTime: null,
  };
}

describe('blackjack/welcome handler', () => {
  let context;
  let callback;
  let createGameSpy;

  beforeEach(() => {
    context = {
      ...global.createTestContext(),
      TWILIO_SYNC_SERVICE_SID: 'IS1234',
      getTwilioClient: jest.fn().mockReturnValue({}),
    };
    callback = jest.fn();
    jest.clearAllMocks();
    // Default: return a non-blackjack game for deterministic tests
    createGameSpy = jest.spyOn(engine, 'createGame').mockReturnValue(makeNormalGame());
  });

  afterEach(() => {
    createGameSpy.mockRestore();
  });

  it('creates a Sync document for the game', async () => {
    const event = global.createTestEvent({ CallSid: 'CA123' });
    await handler(context, event, callback);

    expect(sync.createGameDoc).toHaveBeenCalledWith(
      expect.anything(),
      'IS1234',
      'CA123',
      expect.objectContaining({
        callSid: 'CA123',
        status: 'player_turn',
      })
    );
  });

  it('returns TwiML with welcome message and Gather', async () => {
    const event = global.createTestEvent({ CallSid: 'CA123' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('Welcome to Blackjack');
    expect(twiml).toContain('<Gather');
    expect(twiml).toContain('/voice/blackjack/action');
    expect(twiml).toContain('hit');
  });

  it('Gather accepts both DTMF and speech input', async () => {
    const event = global.createTestEvent({ CallSid: 'CA123' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('input="dtmf speech"');
    expect(twiml).toContain('hints="hit, hit me, card, another, stand, stay, hold"');
  });

  it('announces the player hand and dealer up card', async () => {
    const event = global.createTestEvent({ CallSid: 'CA123' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('you have');
    expect(twiml).toContain('dealer');
  });

  it('includes no-input fallback', async () => {
    const event = global.createTestEvent({ CallSid: 'CA123' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('did not receive');
  });

  describe('natural blackjack', () => {
    it('redirects to game-over on player blackjack', async () => {
      createGameSpy.mockReturnValue({
        ...makeNormalGame(),
        playerHand: [
          { rank: 'A', suit: 'spades' },
          { rank: 'K', suit: 'hearts' },
        ],
        status: 'complete',
        outcome: 'player_blackjack',
        dealerHoleRevealed: true,
      });

      const event = global.createTestEvent({ CallSid: 'CA123' });
      await handler(context, event, callback);

      const twiml = callback.mock.calls[0][1].toString();
      expect(twiml).toContain('Blackjack');
      expect(twiml).toContain('<Redirect>/voice/blackjack/game-over</Redirect>');
    });

    it('redirects to game-over on dealer blackjack', async () => {
      createGameSpy.mockReturnValue({
        ...makeNormalGame(),
        dealerHand: [
          { rank: 'A', suit: 'clubs' },
          { rank: 'Q', suit: 'diamonds' },
        ],
        status: 'complete',
        outcome: 'dealer_blackjack',
        dealerHoleRevealed: true,
      });

      const event = global.createTestEvent({ CallSid: 'CA123' });
      await handler(context, event, callback);

      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('dealer blackjack');
      expect(twiml).toContain('<redirect>/voice/blackjack/game-over</redirect>');
    });
  });
});
