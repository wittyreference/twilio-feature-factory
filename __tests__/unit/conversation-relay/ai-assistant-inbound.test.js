// ABOUTME: Unit tests for the AI assistant inbound call handler.
// ABOUTME: Tests ConversationRelay TwiML with recording and voice configuration.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/conversation-relay/ai-assistant-inbound');

describe('ai-assistant-inbound', () => {
  let callback;

  beforeEach(() => {
    callback = jest.fn();
  });

  it('should return ConversationRelay TwiML when configured', async () => {
    const context = {
      CONVERSATION_RELAY_URL: 'wss://ai-server.com/relay',
      DOMAIN_NAME: 'test.twil.io',
    };
    const event = {};

    await handler(context, event, callback);

    const [error, twiml] = callback.mock.calls[0];
    expect(error).toBeNull();

    const xml = twiml.toString();
    expect(xml).toContain('<Connect');
    expect(xml).toContain('ConversationRelay');
    expect(xml).toContain('wss://ai-server.com/relay');
  });

  it('should include background recording via Start/Recording', async () => {
    const context = {
      CONVERSATION_RELAY_URL: 'wss://ai-server.com/relay',
      DOMAIN_NAME: 'test.twil.io',
    };
    const event = {};

    await handler(context, event, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('<Start');
    expect(xml).toContain('<Recording');
    expect(xml).toContain('recording-complete');
  });

  it('should use absolute recording callback URL', async () => {
    const context = {
      CONVERSATION_RELAY_URL: 'wss://ai-server.com/relay',
      DOMAIN_NAME: 'test.twil.io',
    };
    const event = {};

    await handler(context, event, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('https://test.twil.io/conversation-relay/recording-complete');
  });

  it('should use Google Neural voice', async () => {
    const context = {
      CONVERSATION_RELAY_URL: 'wss://ai-server.com/relay',
      DOMAIN_NAME: 'test.twil.io',
    };
    const event = {};

    await handler(context, event, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('Google.en-US-Neural2-F');
  });

  it('should use deepgram transcription with nova-3', async () => {
    const context = {
      CONVERSATION_RELAY_URL: 'wss://ai-server.com/relay',
      DOMAIN_NAME: 'test.twil.io',
    };
    const event = {};

    await handler(context, event, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('deepgram');
    expect(xml).toContain('nova-3-general');
  });

  it('should return error when CONVERSATION_RELAY_URL not set', async () => {
    const context = { DOMAIN_NAME: 'test.twil.io' };
    const event = {};

    await handler(context, event, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('<Say');
    expect(xml).toContain('not configured');
    expect(xml).toContain('<Hangup');
    expect(xml).not.toContain('ConversationRelay');
  });

  it('should return error when CONVERSATION_RELAY_URL is placeholder', async () => {
    const context = {
      CONVERSATION_RELAY_URL: 'wss://your-websocket-server.com/relay',
      DOMAIN_NAME: 'test.twil.io',
    };
    const event = {};

    await handler(context, event, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('<Say');
    expect(xml).toContain('not configured');
    expect(xml).not.toContain('ConversationRelay');
  });
});
