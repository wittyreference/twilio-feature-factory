// ABOUTME: Unit tests for the Voice SDK access token generation function.
// ABOUTME: Tests token creation, identity handling, and missing env var errors.

const Twilio = require('twilio');

// Mock Twilio.Response (provided by serverless runtime, not the npm package)
class MockResponse {
  constructor() {
    this.body = '';
    this.statusCode = 200;
    this.headers = {};
  }
  setBody(body) { this.body = body; }
  setStatusCode(code) { this.statusCode = code; }
  appendHeader(key, value) { this.headers[key] = value; }
}

global.Twilio = Object.assign({}, Twilio, { Response: MockResponse });

const { handler } = require('../../../functions/voice/token');

describe('voice/token handler', () => {
  let context;
  let event;
  let callback;

  beforeEach(() => {
    context = {
      ...global.createTestContext(),
      TWILIO_API_KEY: 'SKtest00000000000000000000000000',
      TWILIO_API_SECRET: 'test_api_secret_value',
      TWILIO_VOICE_SDK_APP_SID: 'APtest00000000000000000000000000'
    };
    event = global.createTestEvent();
    callback = jest.fn();
  });

  it('should return a valid JSON response with token and identity', async () => {
    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();

    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('token');
    expect(body).toHaveProperty('identity');
    expect(body.token).toBeTruthy();
  });

  it('should use default identity when none provided', async () => {
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const body = JSON.parse(response.body);
    expect(body.identity).toMatch(/^browser-user-\d+$/);
  });

  it('should use provided identity', async () => {
    event.identity = 'agent-smith';
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const body = JSON.parse(response.body);
    expect(body.identity).toBe('agent-smith');
  });

  it('should return a JWT string as the token', async () => {
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const body = JSON.parse(response.body);
    // JWTs have 3 base64-encoded sections separated by dots
    const parts = body.token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('should return 500 when TWILIO_API_KEY is missing', async () => {
    delete context.TWILIO_API_KEY;
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('TWILIO_API_KEY');
  });

  it('should return 500 when TWILIO_API_SECRET is missing', async () => {
    delete context.TWILIO_API_SECRET;
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('TWILIO_API_KEY');
  });

  it('should return 500 when TWILIO_VOICE_SDK_APP_SID is missing', async () => {
    delete context.TWILIO_VOICE_SDK_APP_SID;
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('TWILIO_VOICE_SDK_APP_SID');
  });

  it('should set Content-Type to application/json', async () => {
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.headers['Content-Type']).toBe('application/json');
  });
});
