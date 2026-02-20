// ABOUTME: Unit tests for agent-to-agent test validator.
// ABOUTME: Tests call status checking, transcript retrieval, and quality validation.

const mockCallFetch = jest.fn();
const mockNotificationsList = jest.fn();
const mockSyncDocFetch = jest.fn();

jest.mock('twilio', () => {
  const TwilioMock = jest.fn(() => ({
    calls: jest.fn((_callSid) => ({
      fetch: mockCallFetch,
      notifications: { list: mockNotificationsList },
    })),
    sync: {
      v1: {
        services: jest.fn(() => ({
          documents: jest.fn((_docName) => ({
            fetch: mockSyncDocFetch,
          })),
        })),
      },
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

describe('validate-agent-test', () => {
  let context;
  let event;
  let callback;
  let handler;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCallFetch.mockResolvedValue({
      status: 'completed',
      duration: '45',
      direction: 'outbound-api',
      answeredBy: null,
    });

    mockNotificationsList.mockResolvedValue([]);

    mockSyncDocFetch.mockResolvedValue({
      data: {
        turnCount: 5,
        duration: 40,
        messages: [{ role: 'user' }, { role: 'assistant' }],
        testResults: { errors: [] },
      },
    });

    context = {
      TWILIO_SYNC_SERVICE_SID: 'IS123',
      getTwilioClient: () => new Twilio(),
    };

    event = {
      sessionId: 'test-session-1',
      callSid: 'CA1234567890abcdef1234567890abcdef',
    };

    callback = jest.fn();

    handler = require('../../../functions/conversation-relay/validate-agent-test.protected').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should return success when all checks pass', async () => {
    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.success).toBe(true);
    expect(body.errors).toHaveLength(0);
    expect(body.validation.conversationQuality.allPassed).toBe(true);
  });

  it('should require sessionId', async () => {
    delete event.sessionId;

    await handler(context, event, callback);

    const result = callback.mock.calls[0][1];
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('sessionId');
  });

  it('should fetch and validate call status', async () => {
    await handler(context, event, callback);

    expect(mockCallFetch).toHaveBeenCalled();
    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.validation.callStatus.status).toBe('completed');
    expect(body.validation.callStatus.duration).toBe(45);
  });

  it('should report error when call status is not completed', async () => {
    mockCallFetch.mockResolvedValue({
      status: 'failed',
      duration: '0',
    });

    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.success).toBe(false);
    expect(body.errors).toContainEqual(expect.stringContaining('failed'));
  });

  it('should warn on short call duration', async () => {
    mockCallFetch.mockResolvedValue({
      status: 'completed',
      duration: '3',
    });

    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.warnings).toContainEqual(expect.stringContaining('suspiciously short'));
  });

  it('should report call notification errors', async () => {
    mockNotificationsList.mockResolvedValue([
      { log: '0', errorCode: '11200' },
    ]);

    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.errors).toContainEqual(expect.stringContaining('11200'));
  });

  it('should handle call fetch failure', async () => {
    mockCallFetch.mockRejectedValue(new Error('Not found'));

    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.errors).toContainEqual(expect.stringContaining('Not found'));
  });

  it('should retrieve transcripts from Sync', async () => {
    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.validation.agentATranscript.found).toBe(true);
    expect(body.validation.agentATranscript.turnCount).toBe(5);
    expect(body.validation.agentBTranscript.found).toBe(true);
  });

  it('should handle missing Sync documents gracefully', async () => {
    const notFoundError = new Error('Not found');
    notFoundError.code = 20404;
    mockSyncDocFetch.mockRejectedValue(notFoundError);

    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.validation.agentATranscript.found).toBe(false);
    expect(body.warnings).toContainEqual(expect.stringContaining('Agent A'));
  });

  it('should skip transcript validation when Sync not configured', async () => {
    context.TWILIO_SYNC_SERVICE_SID = undefined;

    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.warnings).toContainEqual(expect.stringContaining('Sync not configured'));
  });

  it('should validate conversation quality - sufficient turns', async () => {
    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    const turnCheck = body.validation.conversationQuality.checks.find(
      (c) => c.check === 'turn_count'
    );
    expect(turnCheck.passed).toBe(true);
  });

  it('should flag insufficient turns', async () => {
    mockSyncDocFetch.mockResolvedValue({
      data: { turnCount: 1, duration: 40, messages: [], testResults: { errors: [] } },
    });

    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.errors).toContainEqual(expect.stringContaining('insufficient turns'));
  });

  it('should validate without callSid', async () => {
    delete event.callSid;

    await handler(context, event, callback);

    expect(mockCallFetch).not.toHaveBeenCalled();
    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.validation.callStatus).toBeNull();
  });

  it('should collect Sync errors in results.errors', async () => {
    mockSyncDocFetch.mockRejectedValue(new Error('Sync unavailable'));
    delete event.callSid;

    await handler(context, event, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.success).toBe(false);
    expect(body.errors).toContainEqual(expect.stringContaining('Sync unavailable'));
  });
});
