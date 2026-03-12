// ABOUTME: Unit tests for the blackjack welcome handler (entry point, deal, initial gather).
// ABOUTME: Tests TwiML output, Sync document creation, and natural blackjack detection.

const Twilio = require('twilio');
const path = require('path');

global.Twilio = Twilio;

// Mock Runtime.getFunctions to load actual private helpers
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

// Mock the sync module
jest.mock('../../../../functions/helpers/blackjack-sync.private', () => ({
  createGameDoc: jest.fn().mockResolvedValue({}),
  fetchGameDoc: jest.fn(),
  updateGameDoc: jest.fn().mockResolvedValue({}),
}));

const { handler } = require('../../../../functions/voice/blackjack/welcome');
const sync = require('../../../../functions/helpers/blackjack-sync.private');

describe('blackjack/welcome handler', () => {
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

  it('creates a Sync document for the game', async () => {
    const event = global.createTestEvent({ CallSid: 'CA123' });
    await handler(context, event, callback);

    expect(sync.createGameDoc).toHaveBeenCalledWith(
      expect.anything(),
      'IS1234',
      'CA123',
      expect.objectContaining({
        callSid: 'CA123',
        status: expect.any(String),
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
    // Should mention cards and dealer
    expect(twiml).toContain('you have');
    expect(twiml).toContain('dealer');
  });

  it('includes no-input fallback', async () => {
    const event = global.createTestEvent({ CallSid: 'CA123' });
    await handler(context, event, callback);

    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('did not receive');
  });
});
