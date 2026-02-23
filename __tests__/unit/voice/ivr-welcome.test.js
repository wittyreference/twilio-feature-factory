// ABOUTME: Unit tests for the IVR welcome handler for the dental office self-service menu.
// ABOUTME: Tests TwiML generation including recording, greeting, and menu gather.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/voice/ivr-welcome');

describe('ivr-welcome handler', () => {
  let context;
  let event;
  let callback;

  beforeEach(() => {
    context = {
      ...global.createTestContext(),
      DOMAIN_NAME: 'prototype-2504-dev.twil.io',
    };
    event = global.createTestEvent({
      CallSid: 'CA1234567890abcdef1234567890abcdef',
      From: '+15551234567',
      To: '+15559876543',
      CallStatus: 'ringing',
      Direction: 'inbound',
    });
    callback = jest.fn();
  });

  it('should return valid TwiML', async () => {
    await handler(context, event, callback);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    const twiml = response.toString();
    expect(twiml).toContain('<?xml');
    expect(twiml).toContain('<Response>');
  });

  it('should start a background recording with absolute URL', async () => {
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Start>');
    expect(twiml).toContain('<Recording');
    expect(twiml).toContain('recordingStatusCallback="https://prototype-2504-dev.twil.io/');
  });

  it('should greet with dental clinic name', async () => {
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('dental');
  });

  it('should include Gather with speech and DTMF', async () => {
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Gather');
    expect(twiml).toContain('input="dtmf speech"');
    expect(twiml).toContain('action="/voice/ivr-menu"');
  });

  it('should offer appointments, billing, and hours options', async () => {
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('appointment');
    expect(twiml).toContain('billing');
    expect(twiml).toContain('hours');
  });

  it('should include a no-input fallback', async () => {
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('did not receive');
  });
});
