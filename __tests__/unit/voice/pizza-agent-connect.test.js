// ABOUTME: Unit tests for the pizza-ordering AI agent connect handler.
// ABOUTME: Tests TwiML generation including recording and ConversationRelay connection.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/voice/pizza-agent-connect');

describe('pizza-agent-connect handler', () => {
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

  it('should greet the caller', async () => {
    const event = global.createTestEvent({});
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('pizza');
  });

  it('should connect to ConversationRelay', async () => {
    const event = global.createTestEvent({});
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Connect>');
    expect(twiml).toContain('ConversationRelay');
    expect(twiml).toContain('wss://submariner.ngrok.io');
  });

  it('should handle missing relay URL', async () => {
    context.AGENT_B_RELAY_URL = undefined;
    const event = global.createTestEvent({});
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('not configured');
  });
});
