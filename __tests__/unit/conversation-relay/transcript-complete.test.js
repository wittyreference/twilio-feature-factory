// ABOUTME: Unit tests for the transcript-complete callback handler.
// ABOUTME: Tests Voice Intelligence transcript processing, Sync updates, and SMS summaries.

const mockTranscriptFetch = jest.fn();
const mockSentencesList = jest.fn();
const mockOperatorResultsList = jest.fn();
const mockSyncDocFetch = jest.fn();
const mockSyncDocUpdate = jest.fn();
const mockSyncDocCreate = jest.fn();
const mockMessageCreate = jest.fn();
const mockCallFetch = jest.fn();

jest.mock('twilio', () => {
  const TwilioMock = jest.fn(() => ({
    intelligence: {
      v2: {
        transcripts: jest.fn((_sid) => ({
          fetch: mockTranscriptFetch,
          sentences: { list: mockSentencesList },
          operatorResults: { list: mockOperatorResultsList },
        })),
      },
    },
    sync: {
      v1: {
        services: jest.fn(() => ({
          documents: Object.assign(
            jest.fn((_docName) => ({
              fetch: mockSyncDocFetch,
              update: mockSyncDocUpdate,
            })),
            {
              create: mockSyncDocCreate,
            }
          ),
        })),
      },
    },
    messages: {
      create: mockMessageCreate,
    },
    calls: jest.fn((_sid) => ({
      fetch: mockCallFetch,
    })),
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

describe('transcript-complete', () => {
  let context;
  let event;
  let callback;
  let handler;

  beforeEach(() => {
    jest.clearAllMocks();

    mockTranscriptFetch.mockResolvedValue({
      customerKey: 'CA1234567890abcdef1234567890abcdef',
      duration: 45,
    });

    mockSentencesList.mockResolvedValue([
      { mediaChannel: 1, transcript: 'Hello, I need help', startTime: 0, endTime: 2, confidence: 0.95 },
      { mediaChannel: 2, transcript: 'How can I help you?', startTime: 2, endTime: 4, confidence: 0.92 },
    ]);

    mockOperatorResultsList.mockResolvedValue([]);

    // Sync doc fetch succeeds (for updating existing doc)
    mockSyncDocFetch.mockResolvedValue({
      data: { callSid: 'CA1234567890abcdef1234567890abcdef' },
    });
    mockSyncDocUpdate.mockResolvedValue({ sid: 'ET123' });
    mockSyncDocCreate.mockResolvedValue({ sid: 'ET456' });

    // SMS sending
    mockMessageCreate.mockResolvedValue({ sid: 'SM123' });

    // Call fetch for SMS recipient
    mockCallFetch.mockResolvedValue({ to: '+15559876543' });

    context = {
      ACCOUNT_SID: 'AC123',
      TWILIO_SYNC_SERVICE_SID: 'IS123',
      TWILIO_INTELLIGENCE_SERVICE_SID: 'GA123',
      TWILIO_PHONE_NUMBER: '+15551234567',
      DOMAIN_NAME: 'test.twil.io',
      getTwilioClient: () => new Twilio(),
    };

    event = {
      account_sid: 'AC123',
      transcript_sid: 'GT1234567890abcdef1234567890abcdef',
      customer_key: 'CA1234567890abcdef1234567890abcdef',
      status: 'completed',
      event_type: 'voice_intelligence_transcript_available',
    };

    callback = jest.fn();

    handler = require('../../../functions/conversation-relay/transcript-complete').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should process transcript and return success', async () => {
    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.transcriptSid).toBe('GT1234567890abcdef1234567890abcdef');
    expect(body.sentenceCount).toBe(2);
  });

  it('should reject mismatched account_sid', async () => {
    event.account_sid = 'AC_WRONG';

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });

  it('should return 400 when transcript_sid is missing', async () => {
    delete event.transcript_sid;

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);
  });

  it('should skip non-transcript_available events', async () => {
    event.event_type = 'voice_intelligence_transcript_queued';

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const body = JSON.parse(response.body);
    expect(body.skipped).toBe(true);
    expect(mockTranscriptFetch).not.toHaveBeenCalled();
  });

  it('should fetch transcript sentences and format them', async () => {
    await handler(context, event, callback);

    expect(mockSentencesList).toHaveBeenCalledWith({ limit: 100 });
    // Verify Sync update includes formatted transcript
    expect(mockSyncDocUpdate).toHaveBeenCalled();
    const updateData = mockSyncDocUpdate.mock.calls[0][0].data;
    expect(updateData.formattedTranscript).toContain('Caller: Hello, I need help');
    expect(updateData.formattedTranscript).toContain('Agent: How can I help you?');
  });

  it('should handle operator results', async () => {
    mockOperatorResultsList.mockResolvedValue([
      {
        operatorType: 'conversation_summarize',
        textGenerationResults: { result: 'Customer asked for help' },
      },
      {
        operatorType: 'sentiment',
        extractedResults: { sentiment: 'positive' },
      },
    ]);

    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.operatorCount).toBe(2);
  });

  it('should handle operator results fetch failure', async () => {
    mockOperatorResultsList.mockRejectedValue(new Error('No operators'));

    await handler(context, event, callback);

    // Should still succeed - operator results are optional
    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.success).toBe(true);
    expect(body.operatorCount).toBe(0);
  });

  it('should update existing Sync document', async () => {
    await handler(context, event, callback);

    expect(mockSyncDocFetch).toHaveBeenCalled();
    expect(mockSyncDocUpdate).toHaveBeenCalled();
    const updateData = mockSyncDocUpdate.mock.calls[0][0].data;
    expect(updateData.transcriptSid).toBe('GT1234567890abcdef1234567890abcdef');
    expect(updateData.transcriptStatus).toBe('completed');
  });

  it('should create new Sync document when none exists', async () => {
    const notFoundError = new Error('Not found');
    notFoundError.code = 20404;
    mockSyncDocFetch.mockRejectedValue(notFoundError);

    await handler(context, event, callback);

    expect(mockSyncDocCreate).toHaveBeenCalled();
    const createData = mockSyncDocCreate.mock.calls[0][0];
    expect(createData.uniqueName).toContain('transcript-');
    expect(createData.ttl).toBe(86400);
  });

  it('should skip Sync when not configured', async () => {
    context.TWILIO_SYNC_SERVICE_SID = undefined;

    await handler(context, event, callback);

    expect(mockSyncDocFetch).not.toHaveBeenCalled();
    expect(mockSyncDocUpdate).not.toHaveBeenCalled();
  });

  it('should send SMS summary', async () => {
    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.smsSent).toBe(true);
    expect(body.messageSid).toBe('SM123');
  });

  it('should skip SMS when no phone number configured', async () => {
    context.TWILIO_PHONE_NUMBER = undefined;

    await handler(context, event, callback);

    expect(mockMessageCreate).not.toHaveBeenCalled();
    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.smsSent).toBe(false);
  });

  it('should handle SMS send failure gracefully', async () => {
    mockMessageCreate.mockRejectedValue(new Error('SMS failed'));

    await handler(context, event, callback);

    // Should still return success - SMS is best-effort
    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.success).toBe(true);
    expect(body.smsSent).toBe(false);
  });

  it('should use customer_key from event for call SID', async () => {
    event.customer_key = 'CA_OVERRIDE';

    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.callSid).toBe('CA_OVERRIDE');
  });

  it('should handle top-level errors gracefully', async () => {
    mockTranscriptFetch.mockRejectedValue(new Error('Intelligence API down'));

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(200); // Returns 200 to prevent retries
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Intelligence API down');
  });

  it('should handle account_sid not present in event', async () => {
    delete event.account_sid;

    await handler(context, event, callback);

    // Should proceed without rejecting
    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.success).toBe(true);
  });

  it('should extract topic insights from operator results', async () => {
    mockOperatorResultsList.mockResolvedValue([
      {
        operatorType: 'topic_extract',
        extractedResults: { topics: ['billing', 'refund'] },
      },
    ]);

    // Need Sync doc with to number for SMS
    mockSyncDocFetch.mockResolvedValue({
      data: { to: '+15559876543', callSid: 'CA123' },
    });

    await handler(context, event, callback);

    // Verify SMS body includes topics
    expect(mockMessageCreate).toHaveBeenCalled();
    const smsBody = mockMessageCreate.mock.calls[0][0].body;
    expect(smsBody).toContain('billing');
  });
});
