// ABOUTME: Unit tests for finalize-demo ConversationRelay post-processing function.
// ABOUTME: Tests transcript storage, summary generation, and SMS sending.

// Mock dependencies
const mockSyncCreate = jest.fn();
const mockMessagesCreate = jest.fn();

jest.mock('twilio', () => {
  const TwilioMock = jest.fn(() => ({
    sync: {
      v1: {
        services: jest.fn(() => ({
          documents: {
            create: mockSyncCreate,
          },
        })),
      },
    },
    messages: {
      create: mockMessagesCreate,
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

describe('finalize-demo', () => {
  let context;
  let event;
  let callback;
  let handler;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock successful operations
    mockSyncCreate.mockResolvedValue({ sid: 'ET1234' });
    mockMessagesCreate.mockResolvedValue({ sid: 'SM1234' });

    context = {
      TWILIO_PHONE_NUMBER: '+15551234567',
      TWILIO_SYNC_SERVICE_SID: 'IS1234567890',
      getTwilioClient: () => new Twilio(),
    };

    event = {
      callSid: 'CA1234567890abcdef1234567890abcdef',
      from: '+15551234567',
      to: '+15559876543',
      transcript: [
        { role: 'assistant', content: 'Hello! How can I help you today?', timestamp: '2026-01-26T10:00:00Z' },
        { role: 'user', content: 'I have a question about my account.', timestamp: '2026-01-26T10:00:05Z' },
        { role: 'assistant', content: 'Of course! What would you like to know?', timestamp: '2026-01-26T10:00:08Z' },
      ],
      duration: 30,
      turnCount: 2,
    };

    callback = jest.fn();

    // Load module after mocks are set up
    handler = require('../../../functions/conversation-relay/finalize-demo.protected').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should process transcript and return success', async () => {
    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.callSid).toBe('CA1234567890abcdef1234567890abcdef');
  });

  it('should store transcript in Sync', async () => {
    await handler(context, event, callback);

    expect(mockSyncCreate).toHaveBeenCalledTimes(1);
    const syncParams = mockSyncCreate.mock.calls[0][0];
    expect(syncParams.uniqueName).toBe('ai-demo-CA1234567890abcdef1234567890abcdef');
    expect(syncParams.data.callSid).toBe('CA1234567890abcdef1234567890abcdef');
    expect(syncParams.data.transcript).toHaveLength(3);
    expect(syncParams.ttl).toBe(86400); // 24 hour TTL
  });

  it('should send SMS summary to the called party', async () => {
    await handler(context, event, callback);

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    const smsParams = mockMessagesCreate.mock.calls[0][0];
    expect(smsParams.to).toBe('+15559876543');
    expect(smsParams.from).toBe('+15551234567');
    expect(smsParams.body).toContain('AI Call Summary');
    expect(smsParams.body).toContain('Duration: 30s');
  });

  it('should return error if callSid is missing', async () => {
    delete event.callSid;
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('callSid');
  });

  it('should return error if transcript is missing', async () => {
    delete event.transcript;
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('transcript');
  });

  it('should return error if transcript is not an array', async () => {
    event.transcript = 'not an array';
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('transcript');
  });

  it('should skip Sync storage if TWILIO_SYNC_SERVICE_SID is not configured', async () => {
    context.TWILIO_SYNC_SERVICE_SID = undefined;
    await handler(context, event, callback);

    expect(mockSyncCreate).not.toHaveBeenCalled();

    const [, response] = callback.mock.calls[0];
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.syncDocument).toBeNull();
  });

  it('should generate simple summary without ANTHROPIC_API_KEY', async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      await handler(context, event, callback);

      const [, response] = callback.mock.calls[0];
      const body = JSON.parse(response.body);
      expect(body.summary).toBeDefined();
      expect(body.summary).toContain('30s conversation');
    } finally {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it('should format transcript correctly for storage', async () => {
    await handler(context, event, callback);

    const syncParams = mockSyncCreate.mock.calls[0][0];
    expect(syncParams.data.formattedTranscript).toContain('AI: Hello!');
    expect(syncParams.data.formattedTranscript).toContain('Caller: I have a question');
  });

  it('should handle Sync create errors gracefully', async () => {
    mockSyncCreate.mockRejectedValue(new Error('Sync service unavailable'));

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Sync service unavailable');
  });

  it('should truncate SMS body to stay within limit', async () => {
    // Create a very long transcript
    event.transcript = Array(100).fill({
      role: 'user',
      content: 'This is a very long message that will need to be truncated.',
      timestamp: '2026-01-26T10:00:00Z',
    });

    await handler(context, event, callback);

    const smsParams = mockMessagesCreate.mock.calls[0][0];
    expect(smsParams.body.length).toBeLessThanOrEqual(1600);
  });
});
