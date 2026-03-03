// ABOUTME: Unit tests for Payment Agent inbound call handler.
// ABOUTME: Tests ConversationRelay TwiML generation for the payment processing agent.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/conversation-relay/payment-agent-inbound.protected');

describe('payment-agent-inbound', () => {
  let callback;

  beforeEach(() => {
    callback = jest.fn();
  });

  it('should return ConversationRelay TwiML when relay URL is configured', async () => {
    const context = {
      PAYMENT_AGENT_RELAY_URL: 'wss://test.ngrok.dev',
      DOMAIN_NAME: 'example.twil.io',
    };
    const event = { From: '+15551234567', To: '+15559876543' };

    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, twiml] = callback.mock.calls[0];
    expect(error).toBeNull();

    const xml = twiml.toString();
    expect(xml).toContain('<Connect');
    expect(xml).toContain('ConversationRelay');
    expect(xml).toContain('wss://test.ngrok.dev');
  });

  it('should use male Google Neural voice for Payment Agent', async () => {
    const context = {
      PAYMENT_AGENT_RELAY_URL: 'wss://test.ngrok.dev',
      DOMAIN_NAME: 'example.twil.io',
    };
    const event = { From: '+15551234567', To: '+15559876543' };

    await handler(context, event, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('Google.en-US-Neural2-D');
  });

  it('should enable DTMF detection and interruptibility', async () => {
    const context = {
      PAYMENT_AGENT_RELAY_URL: 'wss://test.ngrok.dev',
      DOMAIN_NAME: 'example.twil.io',
    };
    const event = { From: '+15551234567', To: '+15559876543' };

    await handler(context, event, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('dtmfDetection');
    expect(xml).toContain('interruptible="false"');
  });

  it('should start background recording', async () => {
    const context = {
      PAYMENT_AGENT_RELAY_URL: 'wss://test.ngrok.dev',
      DOMAIN_NAME: 'example.twil.io',
    };
    const event = { From: '+15551234567', To: '+15559876543' };

    await handler(context, event, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('<Start');
    expect(xml).toContain('<Recording');
    expect(xml).toContain('recording-complete');
  });

  it('should return error message when relay URL is not configured', async () => {
    const context = {};
    const event = { From: '+15551234567', To: '+15559876543' };

    await handler(context, event, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('<Say');
    expect(xml).toContain('not configured');
    expect(xml).not.toContain('ConversationRelay');
  });
});
