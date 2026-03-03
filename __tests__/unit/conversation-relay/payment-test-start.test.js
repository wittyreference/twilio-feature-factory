// ABOUTME: Unit tests for payment test orchestrator.
// ABOUTME: Tests conference creation and 3-participant setup for payment testing.

const Twilio = require('twilio');

Twilio.Response = class MockResponse {
  constructor() { this.statusCode = 200; this.body = ''; this.headers = {}; }
  setStatusCode(code) { this.statusCode = code; }
  setBody(body) { this.body = body; }
  appendHeader(key, value) { this.headers[key] = value; }
};

global.Twilio = Twilio;

// Mock participant create
const mockParticipantCreate = jest.fn().mockResolvedValue({
  callSid: 'CA_mock_participant',
  status: 'initiated',
});

// Mock Sync
const mockSyncCreate = jest.fn().mockResolvedValue({});

const mockClient = {
  conferences: jest.fn(() => ({
    participants: { create: mockParticipantCreate },
  })),
  sync: {
    v1: {
      services: jest.fn(() => ({
        documents: { create: mockSyncCreate },
      })),
    },
  },
};

const { handler } = require('../../../functions/conversation-relay/payment-test-start.protected');

describe('payment-test-start', () => {
  let context;
  let callback;
  let consoleSpy;

  beforeEach(() => {
    context = {
      PAYMENT_AGENT_PHONE_NUMBER: '+12066664151',
      CUSTOMER_AGENT_PHONE_NUMBER: '+12062791099',
      DTMF_INJECTOR_PHONE_NUMBER: '+12067597288',
      TWILIO_PHONE_NUMBER: '+12069666002',
      TWILIO_SYNC_SERVICE_SID: 'IS1234567890',
      DOMAIN_NAME: 'example.twil.io',
      getTwilioClient: () => mockClient,
    };
    callback = jest.fn();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
    // Reset mock to return different SIDs for each participant
    mockParticipantCreate
      .mockResolvedValueOnce({ callSid: 'CA_payment_agent' })
      .mockResolvedValueOnce({ callSid: 'CA_customer_agent' })
      .mockResolvedValueOnce({ callSid: 'CA_dtmf_injector' });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should create conference with 3 participants', async () => {
    await handler(context, {}, callback);

    expect(mockParticipantCreate).toHaveBeenCalledTimes(3);

    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.participants.paymentAgent.callSid).toBe('CA_payment_agent');
    expect(body.participants.customerAgent.callSid).toBe('CA_customer_agent');
    expect(body.participants.dtmfInjector.callSid).toBe('CA_dtmf_injector');
  });

  it('should add DTMF injector as muted', async () => {
    await handler(context, {}, callback);

    // Third call is DTMF injector
    const dtmfCall = mockParticipantCreate.mock.calls[2][0];
    expect(dtmfCall.muted).toBe(true);
  });

  it('should enable conference recording on first participant', async () => {
    await handler(context, {}, callback);

    const firstCall = mockParticipantCreate.mock.calls[0][0];
    expect(firstCall.conferenceRecord).toBe('record-from-start');
  });

  it('should store session state in Sync', async () => {
    await handler(context, { sessionId: 'test-123' }, callback);

    expect(mockSyncCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueName: 'payment-session-test-123',
        data: expect.objectContaining({
          sessionId: 'test-123',
          status: 'started',
        }),
      })
    );
  });

  it('should use custom charge amount', async () => {
    await handler(context, { chargeAmount: '99.99' }, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.chargeAmount).toBe('99.99');
  });

  it('should return error when phone numbers not configured', async () => {
    context.PAYMENT_AGENT_PHONE_NUMBER = undefined;

    await handler(context, {}, callback);

    const body = JSON.parse(callback.mock.calls[0][1].body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Missing phone number');
  });

  it('should disable beep for all participants', async () => {
    await handler(context, {}, callback);

    for (const call of mockParticipantCreate.mock.calls) {
      expect(call[0].beep).toBe(false);
    }
  });
});
