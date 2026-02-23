// ABOUTME: Unit tests for the agent leg handler of outbound contact center calls.
// ABOUTME: Tests whisper message and conference join TwiML generation.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/voice/outbound-agent-leg');

describe('outbound-agent-leg handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    context = global.createTestContext();
    callback = jest.fn();
  });

  it('should return valid TwiML', async () => {
    const event = global.createTestEvent({ ConferenceName: 'test-conf' });
    await handler(context, event, callback);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    const twiml = response.toString();
    expect(twiml).toContain('<?xml');
  });

  it('should whisper to agent before joining conference', async () => {
    const event = global.createTestEvent({ ConferenceName: 'test-conf' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('connecting');
    expect(twiml).toContain('customer');
  });

  it('should join the named conference', async () => {
    const event = global.createTestEvent({ ConferenceName: 'outbound-12345-abc' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Conference');
    expect(twiml).toContain('outbound-12345-abc');
  });

  it('should NOT set endConferenceOnExit for agent', async () => {
    const event = global.createTestEvent({ ConferenceName: 'test-conf' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).not.toContain('endConferenceOnExit="true"');
  });
});
