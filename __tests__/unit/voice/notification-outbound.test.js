// ABOUTME: Unit tests for the notification-outbound voice function.
// ABOUTME: Tests TwiML generation for outbound appointment reminder notifications.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/voice/notification-outbound');

describe('notification-outbound handler', () => {
  let context;
  let event;
  let callback;

  beforeEach(() => {
    context = {
      ...global.createTestContext(),
      DOMAIN_NAME: 'prototype-2504-dev.twil.io',
    };
    event = global.createTestEvent({
      CallSid: 'CA1234567890abcdef1234567890abcdef',
      From: '+15551234567',
      To: '+15559876543',
      CallStatus: 'in-progress',
      Direction: 'outbound-api',
    });
    callback = jest.fn();
  });

  it('should return valid TwiML response', async () => {
    await handler(context, event, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(response).toBeDefined();

    const twiml = response.toString();
    expect(twiml).toContain('<?xml');
    expect(twiml).toContain('<Response>');
  });

  it('should start a background recording', async () => {
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const twiml = response.toString();
    expect(twiml).toContain('<Start>');
    expect(twiml).toContain('<Recording');
  });

  it('should use absolute URL for recording callback', async () => {
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const twiml = response.toString();
    expect(twiml).toContain('recordingStatusCallback="https://prototype-2504-dev.twil.io/');
  });

  it('should include recording completed event', async () => {
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const twiml = response.toString();
    expect(twiml).toContain('recordingStatusCallbackEvent="completed"');
  });

  it('should say appointment details', async () => {
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const twiml = response.toString();
    expect(twiml.toLowerCase()).toContain('appointment');
    expect(twiml.toLowerCase()).toContain('reminder');
  });

  it('should use Polly.Amy voice with en-GB language', async () => {
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const twiml = response.toString();
    expect(twiml).toContain('voice="Polly.Amy"');
    expect(twiml).toContain('language="en-GB"');
  });

  it('should include Gather with speech and DTMF input', async () => {
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const twiml = response.toString();
    expect(twiml).toContain('<Gather');
    expect(twiml).toContain('input="dtmf speech"');
  });

  it('should point Gather action to notification-confirm', async () => {
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const twiml = response.toString();
    expect(twiml).toContain('action="/voice/notification-confirm"');
  });

  it('should include speech recognition hints', async () => {
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const twiml = response.toString();
    expect(twiml).toContain('hints=');
    expect(twiml.toLowerCase()).toContain('yes');
    expect(twiml.toLowerCase()).toContain('no');
    expect(twiml.toLowerCase()).toContain('confirm');
  });

  it('should include Gather instruction for confirm or cancel', async () => {
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const twiml = response.toString();
    const lower = twiml.toLowerCase();
    expect(lower).toContain('press 1');
    expect(lower).toContain('press 2');
  });

  it('should include fallback message for no input', async () => {
    await handler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    const twiml = response.toString();
    const lower = twiml.toLowerCase();
    expect(lower).toContain('did not receive');
  });
});
