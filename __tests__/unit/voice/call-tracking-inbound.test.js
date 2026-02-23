// ABOUTME: Unit tests for the call tracking inbound handler.
// ABOUTME: Tests campaign attribution, whisper, recording, and dial forwarding.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/voice/call-tracking-inbound');

describe('call-tracking-inbound handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    context = {
      ...global.createTestContext(),
      DOMAIN_NAME: 'prototype-2504-dev.twil.io',
      CALL_TRACKING_BUSINESS_NUMBER: '+15551234567',
    };
    callback = jest.fn();
  });

  it('should return valid TwiML', async () => {
    const event = global.createTestEvent({ From: '+15559876543', To: '+15551111111' });
    await handler(context, event, callback);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.toString()).toContain('<?xml');
  });

  it('should start background recording with absolute URL', async () => {
    const event = global.createTestEvent({ From: '+15559876543', To: '+15551111111' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Start>');
    expect(twiml).toContain('<Recording');
    expect(twiml).toContain('recordingStatusCallback="https://prototype-2504-dev.twil.io/');
  });

  it('should whisper campaign source', async () => {
    const event = global.createTestEvent({ From: '+15559876543', To: '+15551111111' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('incoming call');
    expect(twiml).toContain('connecting');
  });

  it('should dial the business number', async () => {
    const event = global.createTestEvent({ From: '+15559876543', To: '+15551111111' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Dial');
    expect(twiml).toContain('+15551234567');
  });

  it('should record the dial leg', async () => {
    const event = global.createTestEvent({ From: '+15559876543', To: '+15551111111' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('record="record-from-answer-dual"');
  });

  it('should use campaign mapping when configured', async () => {
    context.CALL_TRACKING_CAMPAIGNS = JSON.stringify({ '+15551111111': 'Google Ads' });
    const event = global.createTestEvent({ From: '+15559876543', To: '+15551111111' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('Google Ads');
  });

  it('should default to Direct Call when no campaign mapping', async () => {
    const event = global.createTestEvent({ From: '+15559876543', To: '+15559999999' });
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('Direct Call');
  });
});
