// ABOUTME: Unit tests for the sales agent leg handler of sales dialer outbound calls.
// ABOUTME: Tests whisper message and conference join TwiML generation.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/voice/sales-dialer-agent');

describe('sales-dialer-agent handler', () => {
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
    expect(response.toString()).toContain('<?xml');
  });

  it('should whisper context to agent', async () => {
    const event = global.createTestEvent({ ConferenceName: 'test-conf' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('prospect');
    expect(twiml).toContain('trial');
  });

  it('should join the named conference', async () => {
    const event = global.createTestEvent({ ConferenceName: 'sales-99' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Conference');
    expect(twiml).toContain('sales-99');
  });

  it('should NOT set endConferenceOnExit for agent', async () => {
    const event = global.createTestEvent({ ConferenceName: 'test-conf' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).not.toContain('endConferenceOnExit="true"');
  });
});
