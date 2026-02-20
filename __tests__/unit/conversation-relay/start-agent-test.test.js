// ABOUTME: Unit tests for the agent-to-agent test orchestrator.
// ABOUTME: Tests outbound call creation and session management.

const mockCallsCreate = jest.fn();

jest.mock('twilio', () => {
  const TwilioMock = jest.fn(() => ({
    calls: {
      create: mockCallsCreate,
    },
  }));

  TwilioMock.Response = class {
    constructor() { this.statusCode = 200; this.body = ''; this.headers = {}; }
    setStatusCode(code) { this.statusCode = code; }
    setBody(body) { this.body = body; }
    appendHeader(key, value) { this.headers[key] = value; }
  };

  return TwilioMock;
});

const Twilio = require('twilio');

global.Twilio = Twilio;

describe('start-agent-test', () => {
  let context;
  let event;
  let callback;
  let handler;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCallsCreate.mockResolvedValue({
      sid: 'CA1234567890abcdef1234567890abcdef',
      status: 'queued',
    });

    context = {
      AGENT_A_PHONE_NUMBER: '+15551111111',
      AGENT_B_PHONE_NUMBER: '+15552222222',
      TWILIO_SYNC_SERVICE_SID: 'IS123',
      DOMAIN_NAME: 'test.twil.io',
      getTwilioClient: () => new Twilio(),
    };

    event = {};
    callback = jest.fn();

    handler = require('../../../functions/conversation-relay/start-agent-test.protected').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should create outbound call and return success', async () => {
    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, result] = callback.mock.calls[0];
    expect(error).toBeNull();

    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.callSid).toBe('CA1234567890abcdef1234567890abcdef');
    expect(body.from).toBe('+15551111111');
    expect(body.to).toBe('+15552222222');
  });

  it('should generate auto session ID when not provided', async () => {
    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.sessionId).toMatch(/^test-\d+$/);
  });

  it('should use provided session ID', async () => {
    event.sessionId = 'custom-session-123';

    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.sessionId).toBe('custom-session-123');
  });

  it('should pass correct params to calls.create', async () => {
    await handler(context, event, callback);

    expect(mockCallsCreate).toHaveBeenCalledTimes(1);
    const params = mockCallsCreate.mock.calls[0][0];
    expect(params.to).toBe('+15552222222');
    expect(params.from).toBe('+15551111111');
    expect(params.url).toContain('agent-a-inbound');
    expect(params.statusCallback).toContain('/callbacks/call-status');
    expect(params.statusCallbackEvent).toContain('completed');
  });

  it('should use custom agentAUrl when provided', async () => {
    event.agentAUrl = 'https://custom.example.com/agent-a';

    await handler(context, event, callback);

    const params = mockCallsCreate.mock.calls[0][0];
    expect(params.url).toBe('https://custom.example.com/agent-a');
  });

  it('should use custom timeout when provided', async () => {
    event.timeout = '60';

    await handler(context, event, callback);

    const params = mockCallsCreate.mock.calls[0][0];
    expect(params.timeout).toBe(60);
  });

  it('should include Sync document names in response', async () => {
    event.sessionId = 'my-test';

    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.syncDocuments.agentA).toBe('agent-test-my-test-agent-questioner');
    expect(body.syncDocuments.agentB).toBe('agent-test-my-test-agent-answerer');
  });

  it('should include validation URL in response', async () => {
    event.sessionId = 'my-test';

    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.validation.validateUrl).toContain('validate-agent-test');
    expect(body.validation.validateUrl).toContain('sessionId=my-test');
  });

  it('should handle call creation failure', async () => {
    mockCallsCreate.mockRejectedValue(new Error('Rate limited'));

    await handler(context, event, callback);

    const [, result] = callback.mock.calls[0];
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limited');
  });

  it('should use default phone numbers when not configured', async () => {
    delete context.AGENT_A_PHONE_NUMBER;
    delete context.AGENT_B_PHONE_NUMBER;

    await handler(context, event, callback);

    const params = mockCallsCreate.mock.calls[0][0];
    expect(params.from).toBe('+12062021014');
    expect(params.to).toBe('+12062031575');
  });
});
