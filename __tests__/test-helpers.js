// ABOUTME: Shared test helper factory for Twilio serverless function testing.
// ABOUTME: Provides createContext(), MockResponse, and Twilio global setup for unit tests.

/**
 * MockResponse mimics Twilio.Response for unit tests.
 * Tracks status code, headers, and body without requiring the Twilio runtime.
 */
class MockResponse {
  constructor() {
    this.statusCode = 200;
    this.body = '';
    this.headers = {};
  }

  setStatusCode(code) {
    this.statusCode = code;
  }

  appendHeader(key, val) {
    this.headers[key] = val;
  }

  setBody(body) {
    this.body = body;
  }
}

// Set up Twilio global (serverless runtime provides this at runtime)
if (!global.Twilio) {
  global.Twilio = {};
}
if (!global.Twilio.Response) {
  global.Twilio.Response = MockResponse;
}

/**
 * Creates a mock context object matching the Twilio serverless runtime.
 * @param {object} mockClient - Mock Twilio client (jest.fn()-based)
 * @param {object} overrides - Additional context properties
 * @returns {object} Context compatible with handler(context, event, callback)
 */
function createContext(mockClient, overrides = {}) {
  return {
    getTwilioClient: () => mockClient,
    TWILIO_PHONE_NUMBER: '+12069666002',
    TWILIO_SYNC_SERVICE_SID: 'IS_test_sync_sid',
    DOMAIN_NAME: 'test-domain.twil.io',
    ACCOUNT_SID: 'AC_test_account_sid',
    ...overrides
  };
}

module.exports = { createContext, MockResponse };
