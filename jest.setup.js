// ABOUTME: Jest setup file that loads environment variables and configures test context.
// ABOUTME: Provides Twilio credentials and helper functions for all tests.

require('dotenv').config();

const Twilio = require('twilio');

// Returns true if Twilio credentials are available for integration tests
global.hasTwilioCredentials = () => {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
};

global.createTestContext = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || 'ACtest00000000000000000000000000';
  const authToken = process.env.TWILIO_AUTH_TOKEN || 'test_auth_token_placeholder';
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;

  return {
    TWILIO_ACCOUNT_SID: accountSid,
    TWILIO_AUTH_TOKEN: authToken,
    TWILIO_API_KEY: apiKey,
    TWILIO_API_SECRET: apiSecret,
    TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
    getTwilioClient: () => {
      if (apiKey && apiSecret) {
        return new Twilio(apiKey, apiSecret, { accountSid });
      }
      return new Twilio(accountSid, authToken);
    }
  };
};

global.createTestEvent = (params = {}) => {
  return {
    ...params
  };
};

global.createTestCallback = () => {
  return jest.fn((error, response) => {
    if (error) {
      return Promise.reject(error);
    }
    return Promise.resolve(response);
  });
};
