// ABOUTME: Unit tests for the prospect leg handler of sales dialer outbound calls.
// ABOUTME: Tests recording, greeting, and conference join TwiML generation.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/voice/sales-dialer-prospect');

describe('sales-dialer-prospect handler', () => {
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
    expect(response.toString()).toContain('<?xml');
  });

  it('should start background recording with absolute URL', async () => {
    const event = global.createTestEvent({ ConferenceName: 'test-conf' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Start>');
    expect(twiml).toContain('<Recording');
    expect(twiml).toContain('recordingStatusCallback="https://prototype-2504-dev.twil.io/');
  });

  it('should greet prospect with sales message', async () => {
    const event = global.createTestEvent({ ConferenceName: 'test-conf' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('sales');
    expect(twiml).toContain('product');
  });

  it('should join the named conference', async () => {
    const event = global.createTestEvent({ ConferenceName: 'sales-12345' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Conference');
    expect(twiml).toContain('sales-12345');
  });

  it('should set endConferenceOnExit for prospect', async () => {
    const event = global.createTestEvent({ ConferenceName: 'test-conf' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('endConferenceOnExit="true"');
  });
});
