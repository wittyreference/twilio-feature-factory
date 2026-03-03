// ABOUTME: Unit tests for sip-customer-inbound ConversationRelay handler.
// ABOUTME: Verifies TwiML output, recording setup, and relay URL handling.

const Twilio = require('twilio');
global.Twilio = Twilio;

describe('sip-customer-inbound', () => {
  let handler;

  beforeAll(() => {
    handler = require('../../../functions/voice/sip-customer-inbound').handler;
  });

  test('returns ConversationRelay TwiML when relay URL is configured', (done) => {
    const context = {
      SIP_CUSTOMER_RELAY_URL: 'wss://test.ngrok.dev',
      DOMAIN_NAME: 'prototype-test.twil.io',
    };
    const event = { From: '+11234567890', To: '+10987654321' };

    handler(context, event, (err, twiml) => {
      expect(err).toBeNull();
      const xml = twiml.toString();
      expect(xml).toContain('<Connect>');
      expect(xml).toContain('wss://test.ngrok.dev');
      expect(xml).toContain('Google.en-US-Neural2-D');
      done();
    });
  });

  test('starts background recording', (done) => {
    const context = {
      SIP_CUSTOMER_RELAY_URL: 'wss://test.ngrok.dev',
      DOMAIN_NAME: 'prototype-test.twil.io',
    };
    const event = { From: '+11234567890', To: '+10987654321' };

    handler(context, event, (err, twiml) => {
      expect(err).toBeNull();
      const xml = twiml.toString();
      expect(xml).toContain('<Start>');
      expect(xml).toContain('<Recording');
      expect(xml).toContain('prototype-test.twil.io/callbacks/call-status');
      done();
    });
  });

  test('returns error message when relay URL is not configured', (done) => {
    const context = { DOMAIN_NAME: 'prototype-test.twil.io' };
    const event = { From: '+11234567890', To: '+10987654321' };

    handler(context, event, (err, twiml) => {
      expect(err).toBeNull();
      const xml = twiml.toString();
      expect(xml).toContain('<Say');
      expect(xml).toContain('not configured');
      expect(xml).not.toContain('<Connect>');
      done();
    });
  });
});
