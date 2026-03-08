// ABOUTME: Unit tests for the Video SDK access token generation function.
// ABOUTME: Tests token creation, identity handling, room restriction, and missing env var errors.

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

const { handler } = require('../../../functions/video/token');

describe('video/token handler', () => {
  let context;
  let event;
  let callback;

  beforeEach(() => {
    context = {
      ...global.createTestContext(),
      TWILIO_API_KEY: 'SKtest00000000000000000000000000',
      TWILIO_API_SECRET: 'test_api_secret_value'
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
    expect(body.identity).toMatch(/^video-user-\d+$/);
  });

  it('should use provided identity', async () => {
    event.identity = 'alice';
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const body = JSON.parse(response.body);
    expect(body.identity).toBe('alice');
  });

  it('should return a JWT string as the token', async () => {
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const body = JSON.parse(response.body);
    // JWTs have 3 base64-encoded sections separated by dots
    const parts = body.token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('should include room in response when provided', async () => {
    event.room = 'test-room-123';
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const body = JSON.parse(response.body);
    expect(body.room).toBe('test-room-123');
  });

  it('should return null room when not provided', async () => {
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const body = JSON.parse(response.body);
    expect(body.room).toBeNull();
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

  it('should set Content-Type to application/json', async () => {
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.headers['Content-Type']).toBe('application/json');
  });
});
