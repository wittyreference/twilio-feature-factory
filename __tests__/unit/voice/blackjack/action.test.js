// ABOUTME: Unit tests for the blackjack action handler (processes hit/stand input).
// ABOUTME: Tests DTMF classification, hit/bust/21 flow, stand redirect, and unknown input handling.

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

const { handler } = require('../../../../functions/voice/blackjack/action.protected');
const sync = require('../../../../functions/helpers/blackjack-sync.private');
const engine = require('../../../../functions/helpers/blackjack-engine.private');

describe('blackjack/action handler', () => {
  let context;
  let callback;
  let baseGame;

  beforeEach(() => {
    context = {
      ...global.createTestContext(),
      TWILIO_SYNC_SERVICE_SID: 'IS1234',
      getTwilioClient: jest.fn().mockReturnValue({}),
    };
    callback = jest.fn();

    // A standard game in player_turn status with room to hit
    baseGame = {
      gameId: 'bj-test',
      callSid: 'CA123',
      deck: engine.shuffleDeck(engine.createDeck()).slice(4),
      playerHand: [
        { rank: '7', suit: 'hearts' },
        { rank: '5', suit: 'clubs' },
      ],
      dealerHand: [
        { rank: 'K', suit: 'spades' },
        { rank: '6', suit: 'diamonds' },
      ],
      dealerHoleRevealed: false,
      status: 'player_turn',
      outcome: null,
      moves: [{ action: 'deal', timestamp: new Date().toISOString(), detail: 'initial deal' }],
      startTime: new Date().toISOString(),
      endTime: null,
    };

    sync.fetchGameDoc.mockResolvedValue(baseGame);
    jest.clearAllMocks();
    sync.fetchGameDoc.mockResolvedValue(baseGame);
  });

  it('redirects to welcome if game not found', async () => {
    sync.fetchGameDoc.mockResolvedValue(null);
    const event = global.createTestEvent({ CallSid: 'CA123', Digits: '1' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Redirect>/voice/blackjack/welcome</Redirect>');
  });

  it('re-gathers on unknown input', async () => {
    const event = global.createTestEvent({ CallSid: 'CA123', Digits: '9' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Gather');
    expect(twiml).toContain('did not understand');
  });

  it('processes stand and redirects to dealer-turn', async () => {
    const event = global.createTestEvent({ CallSid: 'CA123', Digits: '2' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('stand');
    expect(twiml).toContain('<Redirect>/voice/blackjack/dealer-turn</Redirect>');
    expect(sync.updateGameDoc).toHaveBeenCalled();
  });

  it('processes hit and re-gathers when not bust', async () => {
    // Ensure a low card on top so player doesn't bust
    baseGame.deck = [{ rank: '2', suit: 'spades' }, ...baseGame.deck];
    sync.fetchGameDoc.mockResolvedValue(baseGame);

    const event = global.createTestEvent({ CallSid: 'CA123', Digits: '1' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('drew');
    expect(twiml).toContain('<Gather');
    expect(sync.updateGameDoc).toHaveBeenCalled();
  });

  it('redirects to game-over when player busts', async () => {
    // Force a bust: player has 16, draw a face card
    baseGame.playerHand = [
      { rank: '10', suit: 'hearts' },
      { rank: '6', suit: 'clubs' },
    ];
    baseGame.deck = [{ rank: 'K', suit: 'spades' }, ...baseGame.deck];
    sync.fetchGameDoc.mockResolvedValue(baseGame);

    const event = global.createTestEvent({ CallSid: 'CA123', Digits: '1' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('busted');
    expect(twiml).toContain('<Redirect>/voice/blackjack/game-over</Redirect>');
  });

  it('redirects to dealer-turn when player hits 21', async () => {
    baseGame.playerHand = [
      { rank: '10', suit: 'hearts' },
      { rank: '5', suit: 'clubs' },
    ];
    baseGame.deck = [{ rank: '6', suit: 'spades' }, ...baseGame.deck];
    sync.fetchGameDoc.mockResolvedValue(baseGame);

    const event = global.createTestEvent({ CallSid: 'CA123', Digits: '1' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('21');
    expect(twiml).toContain('<Redirect>/voice/blackjack/dealer-turn</Redirect>');
  });

  it('accepts speech input for hit', async () => {
    baseGame.deck = [{ rank: '2', suit: 'spades' }, ...baseGame.deck];
    sync.fetchGameDoc.mockResolvedValue(baseGame);

    const event = global.createTestEvent({ CallSid: 'CA123', SpeechResult: 'hit me' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('drew');
    expect(sync.updateGameDoc).toHaveBeenCalled();
  });

  it('accepts speech input for stand', async () => {
    const event = global.createTestEvent({ CallSid: 'CA123', SpeechResult: 'stand' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Redirect>/voice/blackjack/dealer-turn</Redirect>');
  });
});
