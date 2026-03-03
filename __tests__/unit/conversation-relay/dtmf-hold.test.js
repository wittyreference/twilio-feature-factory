// ABOUTME: Unit tests for DTMF Injector hold handler.
// ABOUTME: Tests that the hold endpoint returns long pause TwiML for the injector participant.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/conversation-relay/dtmf-hold');

describe('dtmf-hold', () => {
  let callback;

  beforeEach(() => {
    callback = jest.fn();
  });

  it('should return TwiML with a long pause', async () => {
    const context = {};
    const event = {};

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, twiml] = callback.mock.calls[0];
    expect(error).toBeNull();

    const xml = twiml.toString();
    expect(xml).toContain('<Pause');
    expect(xml).toContain('300');
  });

  it('should include hangup after pause expires', async () => {
    const context = {};
    const event = {};

    await handler(context, event, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('<Hangup');
  });

  it('should include timeout message before hangup', async () => {
    const context = {};
    const event = {};

    await handler(context, event, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('<Say');
    expect(xml).toContain('timed out');
  });
});
