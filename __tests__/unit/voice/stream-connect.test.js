// ABOUTME: Unit tests for the Media Streams connect handler.
// ABOUTME: Tests TwiML generation including recording and bidirectional stream connection.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/voice/stream-connect');

describe('stream-connect handler', () => {
  let context;
  let callback;

  beforeEach(() => {
    context = {
      ...global.createTestContext(),
      DOMAIN_NAME: 'prototype-2504-dev.twil.io',
      AGENT_B_RELAY_URL: 'wss://submariner.ngrok.io',
    };
    callback = jest.fn();
  });

  it('should return valid TwiML', async () => {
    const event = global.createTestEvent({});
    await handler(context, event, callback);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    const twiml = response.toString();
    expect(twiml).toContain('<?xml');
    expect(twiml).toContain('<Response>');
  });

  it('should start background recording with absolute URL', async () => {
    const event = global.createTestEvent({});
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Start>');
    expect(twiml).toContain('<Recording');
    expect(twiml).toContain('recordingStatusCallback="https://prototype-2504-dev.twil.io/');
  });

  it('should connect bidirectional stream to WebSocket URL', async () => {
    const event = global.createTestEvent({});
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Connect>');
    expect(twiml).toContain('<Stream');
    expect(twiml).toContain('wss://submariner.ngrok.io');
  });

  it('should greet caller before stream', async () => {
    const event = global.createTestEvent({});
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('weather');
  });

  it('should handle missing relay URL', async () => {
    context.AGENT_B_RELAY_URL = undefined;
    const event = global.createTestEvent({});
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('not configured');
  });
});
