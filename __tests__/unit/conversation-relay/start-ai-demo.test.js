// ABOUTME: Unit tests for start-ai-demo ConversationRelay trigger function.
// ABOUTME: Tests outbound call creation with recording and ConversationRelay TwiML.

// Mock the Twilio client
const mockCallsCreate = jest.fn();

jest.mock('twilio', () => {
  const TwilioMock = jest.fn(() => ({
    calls: {
      create: mockCallsCreate,
    },
  }));

  // Mock Response class (provided by Twilio serverless runtime)
  TwilioMock.Response = class {
    constructor() {
      this.statusCode = 200;
      this.body = '';
      this.headers = {};
    }
    setStatusCode(code) {
      this.statusCode = code;
    }
    setBody(body) {
      this.body = typeof body === 'object' ? JSON.stringify(body) : body;
    }
    appendHeader(key, value) {
      this.headers[key] = value;
    }
  };

  return TwilioMock;
});

const Twilio = require('twilio');

global.Twilio = Twilio;

describe('start-ai-demo', () => {
  let context;
  let event;
  let callback;
  let handler;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock successful call creation
    mockCallsCreate.mockResolvedValue({
      sid: 'CA1234567890abcdef1234567890abcdef',
      status: 'queued',
    });

    context = {
      TWILIO_PHONE_NUMBER: '+15551234567',
      TEST_PHONE_NUMBER: '+15559876543',
      CONVERSATION_RELAY_URL: 'wss://test-server.com/relay',
      DOMAIN_NAME: 'test-domain.twil.io',
      getTwilioClient: () => new Twilio(),
    };

    event = {};
    callback = jest.fn();

    // Load module after mocks are set up
    handler = require('../../../functions/conversation-relay/start-ai-demo.protected').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should create an outbound call with ConversationRelay TwiML', async () => {
    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.callSid).toBe('CA1234567890abcdef1234567890abcdef');
  });

  it('should use configured relay URL in TwiML', async () => {
    await handler(context, event, callback);

    expect(mockCallsCreate).toHaveBeenCalledTimes(1);
    const callParams = mockCallsCreate.mock.calls[0][0];
    expect(callParams.twiml).toContain('wss://test-server.com/relay');
  });

  it('should enable call recording', async () => {
    await handler(context, event, callback);

    const callParams = mockCallsCreate.mock.calls[0][0];
    expect(callParams.record).toBe(true);
    expect(callParams.recordingStatusCallback).toContain('/recording-complete');
  });

  it('should use TEST_PHONE_NUMBER as default destination', async () => {
    await handler(context, event, callback);

    const callParams = mockCallsCreate.mock.calls[0][0];
    expect(callParams.to).toBe('+15559876543');
    expect(callParams.from).toBe('+15551234567');
  });

  it('should allow custom destination number via event.to', async () => {
    event.to = '+15550001111';
    await handler(context, event, callback);

    const callParams = mockCallsCreate.mock.calls[0][0];
    expect(callParams.to).toBe('+15550001111');
  });

  it('should allow custom relay URL via event.relayUrl', async () => {
    event.relayUrl = 'wss://custom-server.com/ai';
    await handler(context, event, callback);

    const callParams = mockCallsCreate.mock.calls[0][0];
    expect(callParams.twiml).toContain('wss://custom-server.com/ai');
  });

  it('should return error if no destination number available', async () => {
    context.TEST_PHONE_NUMBER = undefined;
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('to');
  });

  it('should return error if no relay URL available', async () => {
    context.CONVERSATION_RELAY_URL = undefined;
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('relayUrl');
  });

  it('should return error if no from number available', async () => {
    context.TWILIO_PHONE_NUMBER = undefined;
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('TWILIO_PHONE_NUMBER');
  });

  it('should handle call creation failure gracefully', async () => {
    mockCallsCreate.mockRejectedValue(new Error('Network error'));

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Network error');
  });

  it('should configure status callbacks', async () => {
    await handler(context, event, callback);

    const callParams = mockCallsCreate.mock.calls[0][0];
    expect(callParams.statusCallback).toContain('/call-status');
    expect(callParams.statusCallbackEvent).toContain('completed');
  });

  it('should include machine detection', async () => {
    await handler(context, event, callback);

    const callParams = mockCallsCreate.mock.calls[0][0];
    expect(callParams.machineDetection).toBe('Enable');
  });
});
