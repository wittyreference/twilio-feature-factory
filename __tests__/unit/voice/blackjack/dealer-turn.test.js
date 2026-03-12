// ABOUTME: Unit tests for the blackjack dealer-turn handler (dealer plays automatically).
// ABOUTME: Tests hole card reveal, dealer hit/stand logic, and redirect to game-over.

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

const { handler } = require('../../../../functions/voice/blackjack/dealer-turn.protected');
const sync = require('../../../../functions/helpers/blackjack-sync.private');

describe('blackjack/dealer-turn handler', () => {
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

  it('redirects to welcome if game not found', async () => {
    sync.fetchGameDoc.mockResolvedValue(null);
    const event = global.createTestEvent({ CallSid: 'CA123' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Redirect>/voice/blackjack/welcome</Redirect>');
  });

  it('reveals the dealer hole card', async () => {
    const game = {
      status: 'dealer_turn',
      playerHand: [
        { rank: '10', suit: 'hearts' },
        { rank: '8', suit: 'clubs' },
      ],
      dealerHand: [
        { rank: '10', suit: 'spades' },
        { rank: '7', suit: 'diamonds' },
      ],
      deck: [{ rank: '5', suit: 'hearts' }],
      moves: [],
      dealerHoleRevealed: false,
    };
    sync.fetchGameDoc.mockResolvedValue(game);

    const event = global.createTestEvent({ CallSid: 'CA123' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('reveals');
    expect(twiml).toContain('7 of diamonds');
  });

  it('dealer stands at 17 and redirects to game-over', async () => {
    const game = {
      status: 'dealer_turn',
      playerHand: [
        { rank: '10', suit: 'hearts' },
        { rank: '8', suit: 'clubs' },
      ],
      dealerHand: [
        { rank: '10', suit: 'spades' },
        { rank: '7', suit: 'diamonds' },
      ],
      deck: [{ rank: '5', suit: 'hearts' }],
      moves: [],
      dealerHoleRevealed: false,
    };
    sync.fetchGameDoc.mockResolvedValue(game);

    const event = global.createTestEvent({ CallSid: 'CA123' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Redirect>/voice/blackjack/game-over</Redirect>');
    expect(sync.updateGameDoc).toHaveBeenCalled();
  });

  it('updates Sync with completed game state', async () => {
    const game = {
      status: 'dealer_turn',
      playerHand: [
        { rank: '10', suit: 'hearts' },
        { rank: '8', suit: 'clubs' },
      ],
      dealerHand: [
        { rank: '10', suit: 'spades' },
        { rank: '9', suit: 'diamonds' },
      ],
      deck: [],
      moves: [],
      dealerHoleRevealed: false,
    };
    sync.fetchGameDoc.mockResolvedValue(game);

    const event = global.createTestEvent({ CallSid: 'CA123' });
    await handler(context, event, callback);

    const updatedState = sync.updateGameDoc.mock.calls[0][3];
    expect(updatedState.status).toBe('complete');
    expect(updatedState.outcome).toBeDefined();
    expect(updatedState.dealerHoleRevealed).toBe(true);
  });
});
