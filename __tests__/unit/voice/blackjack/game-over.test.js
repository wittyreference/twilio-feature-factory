// ABOUTME: Unit tests for the blackjack game-over handler.
// ABOUTME: Verifies outcome messages, replay/quit flow, and all 7 outcome variants.

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
const handler = require('../../../../functions/voice/blackjack/game-over.protected').handler;

function makeCompletedGame(outcome, playerHand, dealerHand) {
  return {
    gameId: 'bj-test', callSid: 'CAxxx', status: 'complete', outcome,
    playerHand, dealerHand, deck: [],
    moves: [{ action: 'deal', timestamp: '2024-01-01', detail: 'test' }],
    dealerHoleRevealed: true, startTime: '2024-01-01', endTime: '2024-01-01',
  };
}

describe('game-over', () => {
  let context, callback;

  beforeEach(() => {
    context = {
      ...global.createTestContext(),
      TWILIO_SYNC_SERVICE_SID: 'IS1234',
      getTwilioClient: jest.fn().mockReturnValue({}),
    };
    callback = global.createTestCallback();
    sync.fetchGameDoc.mockReset();
  });

  it('game not found → "goodbye"', async () => {
    sync.fetchGameDoc.mockResolvedValue(null);
    await handler(context, { CallSid: 'CAxxx' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml.toLowerCase()).toContain('goodbye');
  });

  describe('outcome messages', () => {
    it('player_blackjack → "blackjack" + "you win"', async () => {
      sync.fetchGameDoc.mockResolvedValue(makeCompletedGame('player_blackjack',
        [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }],
        [{ rank: '10', suit: 'clubs' }, { rank: '9', suit: 'diamonds' }]
      ));
      await handler(context, { CallSid: 'CAxxx' }, callback);
      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('blackjack');
      expect(twiml).toContain('you win');
    });

    it('dealer_blackjack → "dealer" + "blackjack"', async () => {
      sync.fetchGameDoc.mockResolvedValue(makeCompletedGame('dealer_blackjack',
        [{ rank: '10', suit: 'clubs' }, { rank: '9', suit: 'diamonds' }],
        [{ rank: 'A', suit: 'spades' }, { rank: 'Q', suit: 'hearts' }]
      ));
      await handler(context, { CallSid: 'CAxxx' }, callback);
      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('dealer');
      expect(twiml).toContain('blackjack');
    });

    it('player_bust → "busted"', async () => {
      sync.fetchGameDoc.mockResolvedValue(makeCompletedGame('player_bust',
        [{ rank: '10', suit: 'spades' }, { rank: '5', suit: 'hearts' }, { rank: '8', suit: 'clubs' }],
        [{ rank: '10', suit: 'diamonds' }, { rank: '7', suit: 'clubs' }]
      ));
      await handler(context, { CallSid: 'CAxxx' }, callback);
      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('busted');
    });

    it('dealer_bust → "busted" + "you win"', async () => {
      sync.fetchGameDoc.mockResolvedValue(makeCompletedGame('dealer_bust',
        [{ rank: '10', suit: 'spades' }, { rank: '8', suit: 'hearts' }],
        [{ rank: '10', suit: 'diamonds' }, { rank: '5', suit: 'clubs' }, { rank: '9', suit: 'hearts' }]
      ));
      await handler(context, { CallSid: 'CAxxx' }, callback);
      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('busted');
      expect(twiml).toContain('you win');
    });

    it('player_wins → "you win"', async () => {
      sync.fetchGameDoc.mockResolvedValue(makeCompletedGame('player_wins',
        [{ rank: '10', suit: 'spades' }, { rank: '9', suit: 'hearts' }],
        [{ rank: '10', suit: 'diamonds' }, { rank: '8', suit: 'clubs' }]
      ));
      await handler(context, { CallSid: 'CAxxx' }, callback);
      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('you win');
    });

    it('dealer_wins → "dealer wins"', async () => {
      sync.fetchGameDoc.mockResolvedValue(makeCompletedGame('dealer_wins',
        [{ rank: '10', suit: 'spades' }, { rank: '7', suit: 'hearts' }],
        [{ rank: '10', suit: 'diamonds' }, { rank: '9', suit: 'clubs' }]
      ));
      await handler(context, { CallSid: 'CAxxx' }, callback);
      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('dealer wins');
    });

    it('push → "push"', async () => {
      sync.fetchGameDoc.mockResolvedValue(makeCompletedGame('push',
        [{ rank: '10', suit: 'spades' }, { rank: '8', suit: 'hearts' }],
        [{ rank: 'J', suit: 'diamonds' }, { rank: '8', suit: 'clubs' }]
      ));
      await handler(context, { CallSid: 'CAxxx' }, callback);
      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('push');
    });
  });

  it('offers replay Gather with correct action and "play again"', async () => {
    sync.fetchGameDoc.mockResolvedValue(makeCompletedGame('player_wins',
      [{ rank: '10', suit: 'spades' }, { rank: '9', suit: 'hearts' }],
      [{ rank: '10', suit: 'diamonds' }, { rank: '8', suit: 'clubs' }]
    ));
    await handler(context, { CallSid: 'CAxxx' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Gather');
    expect(twiml).toContain('action="/voice/blackjack/game-over"');
    expect(twiml.toLowerCase()).toContain('play again');
  });

  it('digit 1 → redirect to welcome', async () => {
    sync.fetchGameDoc.mockResolvedValue(makeCompletedGame('player_wins',
      [{ rank: '10', suit: 'spades' }, { rank: '9', suit: 'hearts' }],
      [{ rank: '10', suit: 'diamonds' }, { rank: '8', suit: 'clubs' }]
    ));
    await handler(context, { CallSid: 'CAxxx', Digits: '1' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Redirect>/voice/blackjack/welcome</Redirect>');
  });

  it('speech "deal" → redirect to welcome', async () => {
    sync.fetchGameDoc.mockResolvedValue(makeCompletedGame('player_wins',
      [{ rank: '10', suit: 'spades' }, { rank: '9', suit: 'hearts' }],
      [{ rank: '10', suit: 'diamonds' }, { rank: '8', suit: 'clubs' }]
    ));
    await handler(context, { CallSid: 'CAxxx', SpeechResult: 'deal' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Redirect>/voice/blackjack/welcome</Redirect>');
  });

  it('speech "play again" → redirect to welcome', async () => {
    sync.fetchGameDoc.mockResolvedValue(makeCompletedGame('player_wins',
      [{ rank: '10', suit: 'spades' }, { rank: '9', suit: 'hearts' }],
      [{ rank: '10', suit: 'diamonds' }, { rank: '8', suit: 'clubs' }]
    ));
    await handler(context, { CallSid: 'CAxxx', SpeechResult: 'play again' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Redirect>/voice/blackjack/welcome</Redirect>');
  });

  it('speech "quit" → "goodbye", no Gather', async () => {
    sync.fetchGameDoc.mockResolvedValue(makeCompletedGame('player_wins',
      [{ rank: '10', suit: 'spades' }, { rank: '9', suit: 'hearts' }],
      [{ rank: '10', suit: 'diamonds' }, { rank: '8', suit: 'clubs' }]
    ));
    await handler(context, { CallSid: 'CAxxx', SpeechResult: 'quit' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml.toLowerCase()).toContain('goodbye');
    expect(twiml).not.toContain('<Gather');
  });

  it('digit 2 → "goodbye", no Gather', async () => {
    sync.fetchGameDoc.mockResolvedValue(makeCompletedGame('player_wins',
      [{ rank: '10', suit: 'spades' }, { rank: '9', suit: 'hearts' }],
      [{ rank: '10', suit: 'diamonds' }, { rank: '8', suit: 'clubs' }]
    ));
    await handler(context, { CallSid: 'CAxxx', Digits: '2' }, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml.toLowerCase()).toContain('goodbye');
    expect(twiml).not.toContain('<Gather');
  });
});
