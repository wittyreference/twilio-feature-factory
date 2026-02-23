// ABOUTME: Unit tests for the customer leg handler of outbound contact center calls.
// ABOUTME: Tests recording, greeting, and conference join TwiML generation.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/voice/outbound-customer-leg');

describe('outbound-customer-leg handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    context = {
      ...global.createTestContext(),
      DOMAIN_NAME: 'prototype-2504-dev.twil.io',
    };
    callback = jest.fn();
  });

  it('should return valid TwiML', async () => {
    const event = global.createTestEvent({ ConferenceName: 'test-conf' });
    await handler(context, event, callback);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    const twiml = response.toString();
    expect(twiml).toContain('<?xml');
    expect(twiml).toContain('<Response>');
  });

  it('should start background recording with absolute URL', async () => {
    const event = global.createTestEvent({ ConferenceName: 'test-conf' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Start>');
    expect(twiml).toContain('<Recording');
    expect(twiml).toContain('recordingStatusCallback="https://prototype-2504-dev.twil.io/');
  });

  it('should greet the customer with courtesy call message', async () => {
    const event = global.createTestEvent({ ConferenceName: 'test-conf' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('courtesy call');
    expect(twiml).toContain('agent');
  });

  it('should join the named conference', async () => {
    const event = global.createTestEvent({ ConferenceName: 'outbound-12345-abc' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Conference');
    expect(twiml).toContain('outbound-12345-abc');
  });

  it('should set endConferenceOnExit to true for customer', async () => {
    const event = global.createTestEvent({ ConferenceName: 'test-conf' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('endConferenceOnExit="true"');
  });

  it('should use default conference name when not provided', async () => {
    const event = global.createTestEvent({});
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('default-conference');
  });
});
