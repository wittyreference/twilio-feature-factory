// ABOUTME: Unit tests for the blackjack game-over handler (results and replay).
// ABOUTME: Tests all 7 outcome messages, replay/quit input, and no-input fallback.

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

const { handler } = require('../../../../functions/voice/blackjack/game-over.protected');
const sync = require('../../../../functions/helpers/blackjack-sync.private');

function makeCompletedGame(outcome, playerHand, dealerHand) {
  return {
    status: 'complete',
    outcome,
    playerHand,
    dealerHand,
    moves: [],
  };
}

describe('blackjack/game-over handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    context = {
      ...global.createTestContext(),
      TWILIO_SYNC_SERVICE_SID: 'IS1234',
      getTwilioClient: jest.fn().mockReturnValue({}),
    };
    callback = jest.fn();
    jest.clearAllMocks();
  });

  it('says goodbye if game not found', async () => {
    sync.fetchGameDoc.mockResolvedValue(null);
    const event = global.createTestEvent({ CallSid: 'CA123' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('goodbye');
  });

  describe('outcome messages', () => {
    const playerDefault = [
      { rank: '10', suit: 'hearts' },
      { rank: '8', suit: 'clubs' },
    ];
    const dealerDefault = [
      { rank: '10', suit: 'spades' },
      { rank: '7', suit: 'diamonds' },
    ];

    it('announces player blackjack', async () => {
      const game = makeCompletedGame(
        'player_blackjack',
        [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }],
        dealerDefault
      );
      sync.fetchGameDoc.mockResolvedValue(game);

      const event = global.createTestEvent({ CallSid: 'CA123' });
      await handler(context, event, callback);

      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('blackjack');
      expect(twiml).toContain('you win');
    });

    it('announces dealer blackjack', async () => {
      const game = makeCompletedGame('dealer_blackjack', playerDefault, dealerDefault);
      sync.fetchGameDoc.mockResolvedValue(game);

      const event = global.createTestEvent({ CallSid: 'CA123' });
      await handler(context, event, callback);

      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('dealer');
      expect(twiml).toContain('blackjack');
    });

    it('announces player bust', async () => {
      const game = makeCompletedGame(
        'player_bust',
        [{ rank: '10', suit: 'hearts' }, { rank: '5', suit: 'clubs' }, { rank: '8', suit: 'spades' }],
        dealerDefault
      );
      sync.fetchGameDoc.mockResolvedValue(game);

      const event = global.createTestEvent({ CallSid: 'CA123' });
      await handler(context, event, callback);

      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('busted');
    });

    it('announces dealer bust', async () => {
      const game = makeCompletedGame(
        'dealer_bust',
        playerDefault,
        [{ rank: '10', suit: 'spades' }, { rank: '5', suit: 'clubs' }, { rank: '9', suit: 'hearts' }]
      );
      sync.fetchGameDoc.mockResolvedValue(game);

      const event = global.createTestEvent({ CallSid: 'CA123' });
      await handler(context, event, callback);

      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('busted');
      expect(twiml).toContain('you win');
    });

    it('announces player wins', async () => {
      const game = makeCompletedGame('player_wins', playerDefault, dealerDefault);
      sync.fetchGameDoc.mockResolvedValue(game);

      const event = global.createTestEvent({ CallSid: 'CA123' });
      await handler(context, event, callback);

      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('you win');
    });

    it('announces dealer wins', async () => {
      const game = makeCompletedGame(
        'dealer_wins',
        [{ rank: '10', suit: 'hearts' }, { rank: '7', suit: 'clubs' }],
        [{ rank: '10', suit: 'spades' }, { rank: '9', suit: 'diamonds' }]
      );
      sync.fetchGameDoc.mockResolvedValue(game);

      const event = global.createTestEvent({ CallSid: 'CA123' });
      await handler(context, event, callback);

      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('dealer wins');
    });

    it('announces push', async () => {
      const game = makeCompletedGame(
        'push',
        playerDefault,
        [{ rank: 'J', suit: 'spades' }, { rank: '8', suit: 'diamonds' }]
      );
      sync.fetchGameDoc.mockResolvedValue(game);

      const event = global.createTestEvent({ CallSid: 'CA123' });
      await handler(context, event, callback);

      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('push');
    });
  });

  describe('replay', () => {
    beforeEach(() => {
      sync.fetchGameDoc.mockResolvedValue(
        makeCompletedGame(
          'player_wins',
          [{ rank: '10', suit: 'hearts' }, { rank: '9', suit: 'clubs' }],
          [{ rank: '10', suit: 'spades' }, { rank: '7', suit: 'diamonds' }]
        )
      );
    });

    it('offers replay gather after announcing outcome', async () => {
      const event = global.createTestEvent({ CallSid: 'CA123' });
      await handler(context, event, callback);

      const twiml = callback.mock.calls[0][1].toString();
      expect(twiml).toContain('<Gather');
      expect(twiml).toContain('/voice/blackjack/game-over');
      expect(twiml).toContain('play again');
    });

    it('replays on digit 1', async () => {
      const event = global.createTestEvent({ CallSid: 'CA123', Digits: '1' });
      await handler(context, event, callback);

      const twiml = callback.mock.calls[0][1].toString();
      expect(twiml).toContain('<Redirect>/voice/blackjack/welcome</Redirect>');
    });

    it('replays on speech "deal"', async () => {
      const event = global.createTestEvent({ CallSid: 'CA123', SpeechResult: 'deal' });
      await handler(context, event, callback);

      const twiml = callback.mock.calls[0][1].toString();
      expect(twiml).toContain('<Redirect>/voice/blackjack/welcome</Redirect>');
    });

    it('replays on speech "play again"', async () => {
      const event = global.createTestEvent({ CallSid: 'CA123', SpeechResult: 'play again' });
      await handler(context, event, callback);

      const twiml = callback.mock.calls[0][1].toString();
      expect(twiml).toContain('<Redirect>/voice/blackjack/welcome</Redirect>');
    });

    it('quits on speech "quit"', async () => {
      const event = global.createTestEvent({ CallSid: 'CA123', SpeechResult: 'quit' });
      await handler(context, event, callback);

      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('goodbye');
      expect(twiml).not.toContain('<Gather');
    });

    it('hangs up on digit 2', async () => {
      const event = global.createTestEvent({ CallSid: 'CA123', Digits: '2' });
      await handler(context, event, callback);

      const twiml = callback.mock.calls[0][1].toString().toLowerCase();
      expect(twiml).toContain('goodbye');
      expect(twiml).not.toContain('<Gather');
    });
  });
});
