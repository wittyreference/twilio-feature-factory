// ABOUTME: Unit tests for recording-complete callback handler.
// ABOUTME: Tests recording completion processing and Sync document updates.

// Mock dependencies
const mockSyncFetch = jest.fn();
const mockSyncUpdate = jest.fn();
const mockSyncCreate = jest.fn();

jest.mock('twilio', () => {
  const TwilioMock = jest.fn(() => ({
    sync: {
      v1: {
        services: jest.fn(() => ({
          documents: Object.assign(
            jest.fn((_docName) => ({
              fetch: mockSyncFetch,
              update: mockSyncUpdate,
            })),
            {
              create: mockSyncCreate,
            }
          ),
        })),
      },
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

describe('recording-complete', () => {
  let context;
  let event;
  let callback;
  let handler;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock successful operations
    mockSyncFetch.mockResolvedValue({
      data: {
        callSid: 'CA1234567890abcdef1234567890abcdef',
        transcript: [],
      },
    });
    mockSyncUpdate.mockResolvedValue({ sid: 'ET1234' });
    mockSyncCreate.mockResolvedValue({ sid: 'ET5678' });

    context = {
      TWILIO_SYNC_SERVICE_SID: 'IS1234567890',
      getTwilioClient: () => new Twilio(),
    };

    event = {
      RecordingSid: 'RE1234567890abcdef1234567890abcdef',
      RecordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE1234567890abcdef1234567890abcdef',
      RecordingStatus: 'completed',
      RecordingDuration: 30,
      CallSid: 'CA1234567890abcdef1234567890abcdef',
    };

    callback = jest.fn();

    // Load module after mocks are set up
    handler = require('../../../functions/conversation-relay/recording-complete.protected').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should return success on valid recording callback', async () => {
    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.recordingSid).toBe('RE1234567890abcdef1234567890abcdef');
    expect(body.callSid).toBe('CA1234567890abcdef1234567890abcdef');
  });

  it('should return error if CallSid is missing', async () => {
    delete event.CallSid;
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('CallSid');
  });

  it('should append .mp3 extension to recording URL', async () => {
    await handler(context, event, callback);

    // The recording URL should have .mp3 appended when stored
    expect(mockSyncUpdate).toHaveBeenCalled();
    const updateParams = mockSyncUpdate.mock.calls[0][0];
    expect(updateParams.data.recordingUrl).toContain('.mp3');
  });

  it('should skip Sync update if service not configured', async () => {
    context.TWILIO_SYNC_SERVICE_SID = undefined;
    await handler(context, event, callback);

    expect(mockSyncFetch).not.toHaveBeenCalled();
    expect(mockSyncUpdate).not.toHaveBeenCalled();

    const [, response] = callback.mock.calls[0];
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('should skip update if recording status is not completed', async () => {
    event.RecordingStatus = 'in-progress';
    await handler(context, event, callback);

    expect(mockSyncFetch).not.toHaveBeenCalled();

    const [, response] = callback.mock.calls[0];
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.status).toBe('in-progress');
  });

  it('should create temporary document if main document does not exist', async () => {
    const notFoundError = new Error('Document not found');
    notFoundError.code = 20404;
    mockSyncFetch.mockRejectedValue(notFoundError);

    await handler(context, event, callback);

    expect(mockSyncCreate).toHaveBeenCalledTimes(1);
    const createParams = mockSyncCreate.mock.calls[0][0];
    expect(createParams.uniqueName).toContain('recording-');
    expect(createParams.data.recordingSid).toBe('RE1234567890abcdef1234567890abcdef');
  });

  it('should include recording duration in stored data', async () => {
    await handler(context, event, callback);

    const updateParams = mockSyncUpdate.mock.calls[0][0];
    expect(updateParams.data.recordingDuration).toBe(30);
  });

  it('should return 200 even on errors to prevent Twilio retries', async () => {
    mockSyncFetch.mockRejectedValue(new Error('Unexpected error'));

    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(200); // Always 200 for Twilio callbacks
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  it('should log recording callback information', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await handler(context, event, callback);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Recording callback:')
    );

    consoleSpy.mockRestore();
  });
});
