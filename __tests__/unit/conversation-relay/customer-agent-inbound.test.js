// ABOUTME: Unit tests for Customer Agent inbound call handler.
// ABOUTME: Tests ConversationRelay TwiML generation for the customer agent.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/conversation-relay/customer-agent-inbound.protected');

describe('customer-agent-inbound', () => {
  let callback;

  beforeEach(() => {
    callback = jest.fn();
  });

  it('should return ConversationRelay TwiML when relay URL is configured', async () => {
    const context = {
      CUSTOMER_AGENT_RELAY_URL: 'wss://test.ngrok.io',
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
    expect(xml).toContain('wss://test.ngrok.io');
  });

  it('should use female Google Neural voice for Customer Agent', async () => {
    const context = {
      CUSTOMER_AGENT_RELAY_URL: 'wss://test.ngrok.io',
      DOMAIN_NAME: 'example.twil.io',
    };
    const event = { From: '+15551234567', To: '+15559876543' };

    await handler(context, event, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('Google.en-US-Neural2-F');
  });

  it('should enable DTMF detection and interruptibility', async () => {
    const context = {
      CUSTOMER_AGENT_RELAY_URL: 'wss://test.ngrok.io',
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
      CUSTOMER_AGENT_RELAY_URL: 'wss://test.ngrok.io',
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
