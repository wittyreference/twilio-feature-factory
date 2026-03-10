// ABOUTME: Unit tests for the pizza order status recording callback.
// ABOUTME: Tests transcription triggering, Sync storage, and SMS confirmation.

const Twilio = require('twilio');

Twilio.Response = class MockResponse {
  constructor() { this.statusCode = 200; this.body = ''; this.headers = {}; }
  setStatusCode(code) { this.statusCode = code; }
  setBody(body) { this.body = body; }
  appendHeader(key, value) { this.headers[key] = value; }
};

global.Twilio = Twilio;

describe('pizza-order-status callback', () => {
  let handler;
  let callback;
  let mockClient;

  beforeEach(() => {
    jest.resetModules();
    callback = jest.fn();

    // Build mock client with chained API
    mockClient = {
      calls: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue({
          from: '+15551234567',
          to: '+15559876543',
        }),
      }),
      intelligence: {
        v2: {
          transcripts: {
            create: jest.fn().mockResolvedValue({ sid: 'GT123test' }),
          },
        },
      },
      sync: {
        v1: {
          services: jest.fn().mockReturnValue({
            documents: {
              create: jest.fn().mockResolvedValue({ sid: 'ET123' }),
            },
            syncLists: jest.fn().mockImplementation((name) => {
              if (name === 'pizza-orders') {
                return {
                  fetch: jest.fn().mockResolvedValue({ sid: 'ES123' }),
                  syncListItems: {
                    create: jest.fn().mockResolvedValue({ index: 0 }),
                  },
                };
              }
              return {
                create: jest.fn().mockResolvedValue({ sid: 'ES123' }),
              };
            }),
          }),
        },
      },
      messages: {
        create: jest.fn().mockResolvedValue({ sid: 'SM123test' }),
      },
    };

    handler = require('../../../functions/callbacks/pizza-order-status.protected').handler;
  });

  function makeContext(overrides) {
    return {
      ACCOUNT_SID: 'AC123',
      TWILIO_SYNC_SERVICE_SID: 'IS123',
      TWILIO_INTELLIGENCE_SERVICE_SID: 'GA123',
      TWILIO_PHONE_NUMBER: '+15550001111',
      TWILIO_MESSAGING_SERVICE_SID: 'MG123',
      DOMAIN_NAME: 'test.twil.io',
      getTwilioClient: () => mockClient,
      ...overrides,
    };
  }

  function makeEvent(overrides) {
    return {
      AccountSid: 'AC123',
      RecordingSid: 'RE123test',
      RecordingUrl: 'https://api.twilio.com/recordings/RE123test',
      RecordingStatus: 'completed',
      RecordingDuration: '45',
      CallSid: 'CA123test',
      ...overrides,
    };
  }

  it('should return success with all SIDs', async () => {
    await handler(makeContext(), makeEvent(), callback);

    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.callSid).toBe('CA123test');
    expect(body.recordingSid).toBe('RE123test');
    expect(body.transcriptSid).toBe('GT123test');
  });

  it('should reject mismatched AccountSid', async () => {
    await handler(makeContext(), makeEvent({ AccountSid: 'ACwrong' }), callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(403);
  });

  it('should return 400 if CallSid missing', async () => {
    await handler(makeContext(), makeEvent({ CallSid: undefined }), callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(400);
  });

  it('should skip non-completed recordings', async () => {
    await handler(makeContext(), makeEvent({ RecordingStatus: 'in-progress' }), callback);

    const [, response] = callback.mock.calls[0];
    const body = JSON.parse(response.body);
    expect(body.skipped).toBe(true);
    expect(mockClient.intelligence.v2.transcripts.create).not.toHaveBeenCalled();
  });

  it('should trigger Voice Intelligence transcription', async () => {
    await handler(makeContext(), makeEvent(), callback);

    expect(mockClient.intelligence.v2.transcripts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceSid: 'GA123',
        customerKey: 'CA123test',
      })
    );
  });

  it('should use source_sid for transcript creation', async () => {
    await handler(makeContext(), makeEvent(), callback);

    var createCall = mockClient.intelligence.v2.transcripts.create.mock.calls[0][0];
    expect(createCall.channel.media_properties.source_sid).toBe('RE123test');
  });

  it('should create Sync document with order data', async () => {
    await handler(makeContext(), makeEvent(), callback);

    var syncServices = mockClient.sync.v1.services;
    expect(syncServices).toHaveBeenCalledWith('IS123');
  });

  it('should send SMS confirmation to caller', async () => {
    await handler(makeContext(), makeEvent(), callback);

    expect(mockClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+15551234567',
        messagingServiceSid: 'MG123',
      })
    );
    var body = mockClient.messages.create.mock.calls[0][0].body;
    expect(body).toContain('Mario Pizza');
    expect(body).toContain('order');
  });

  it('should handle missing intelligence service gracefully', async () => {
    await handler(
      makeContext({ TWILIO_INTELLIGENCE_SERVICE_SID: undefined }),
      makeEvent(),
      callback
    );

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.success).toBe(true);
    expect(body.transcriptSid).toBeNull();
  });

  it('should handle missing sync service gracefully', async () => {
    await handler(
      makeContext({ TWILIO_SYNC_SERVICE_SID: undefined }),
      makeEvent(),
      callback
    );

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.success).toBe(true);
  });

  it('should use from number when no messaging service', async () => {
    await handler(
      makeContext({ TWILIO_MESSAGING_SERVICE_SID: undefined }),
      makeEvent(),
      callback
    );

    expect(mockClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '+15550001111',
      })
    );
  });
});
