// ABOUTME: Unit tests for the pizza agent ConversationRelay connect handler.
// ABOUTME: Tests TwiML generation including recording setup and ConversationRelay connection.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/conversation-relay/pizza-agent-connect');

describe('pizza-agent-connect (conversation-relay)', () => {
  let callback;

  beforeEach(() => {
    callback = jest.fn();
  });

  it('should return valid TwiML with ConversationRelay', () => {
    const context = {
      CONVERSATION_RELAY_URL: 'wss://ai-server.com/relay',
      DOMAIN_NAME: 'test.twil.io',
    };
    handler(context, {}, callback);

    const [error, twiml] = callback.mock.calls[0];
    expect(error).toBeNull();
    const xml = twiml.toString();
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<Response>');
    expect(xml).toContain('<Connect');
    expect(xml).toContain('ConversationRelay');
  });

  it('should include background recording with callback URL', () => {
    const context = {
      CONVERSATION_RELAY_URL: 'wss://ai-server.com/relay',
      DOMAIN_NAME: 'test.twil.io',
    };
    handler(context, {}, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('<Start');
    expect(xml).toContain('<Recording');
    expect(xml).toContain('https://test.twil.io/callbacks/pizza-order-status');
  });

  it('should use ConversationRelay WebSocket URL from context', () => {
    const context = {
      CONVERSATION_RELAY_URL: 'wss://custom-server.example.com/ws',
      DOMAIN_NAME: 'test.twil.io',
    };
    handler(context, {}, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('wss://custom-server.example.com/ws');
  });

  it('should include pizza-themed welcome greeting', () => {
    const context = {
      CONVERSATION_RELAY_URL: 'wss://ai-server.com/relay',
      DOMAIN_NAME: 'test.twil.io',
    };
    handler(context, {}, callback);

    const xml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(xml).toContain('pizza');
    expect(xml).toContain('ordering');
  });

  it('should use Google Neural voice', () => {
    const context = {
      CONVERSATION_RELAY_URL: 'wss://ai-server.com/relay',
      DOMAIN_NAME: 'test.twil.io',
    };
    handler(context, {}, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('Google.en-US-Neural2-F');
  });

  it('should enable DTMF detection and interruptible', () => {
    const context = {
      CONVERSATION_RELAY_URL: 'wss://ai-server.com/relay',
      DOMAIN_NAME: 'test.twil.io',
    };
    handler(context, {}, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('dtmfDetection');
    expect(xml).toContain('interruptible');
  });

  it('should return error when CONVERSATION_RELAY_URL is not set', () => {
    const context = { DOMAIN_NAME: 'test.twil.io' };
    handler(context, {}, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('<Say');
    expect(xml).toContain('not available');
    expect(xml).toContain('<Hangup');
    expect(xml).not.toContain('ConversationRelay');
  });

  it('should return error when URL is placeholder', () => {
    const context = {
      CONVERSATION_RELAY_URL: 'wss://your-websocket-server.com/relay',
      DOMAIN_NAME: 'test.twil.io',
    };
    handler(context, {}, callback);

    const xml = callback.mock.calls[0][1].toString();
    expect(xml).toContain('<Say');
    expect(xml).toContain('not available');
    expect(xml).not.toContain('ConversationRelay');
  });
});
