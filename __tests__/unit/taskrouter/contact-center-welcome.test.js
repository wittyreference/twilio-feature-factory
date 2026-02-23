// ABOUTME: Unit tests for the contact center welcome handler with TaskRouter enqueue.
// ABOUTME: Tests TwiML generation including recording, greeting, and enqueue with task attributes.

const Twilio = require('twilio');

global.Twilio = Twilio;

const { handler } = require('../../../functions/taskrouter/contact-center-welcome');

describe('contact-center-welcome handler', () => {
  let context;
  let event;
  let callback;

  beforeEach(() => {
    context = {
      ...global.createTestContext(),
      DOMAIN_NAME: 'prototype-2504-dev.twil.io',
      TWILIO_TASKROUTER_WORKFLOW_SID: 'WW9c8e35f2275c0fb0de6c6bfb65e18467',
    };
    event = global.createTestEvent({
      CallSid: 'CA1234567890abcdef1234567890abcdef',
      From: '+15551234567',
      To: '+15559876543',
    });
    callback = jest.fn();
  });

  it('should return valid TwiML', async () => {
    await handler(context, event, callback);
    const [error, response] = callback.mock.calls[0];
    expect(error).toBeNull();
    const twiml = response.toString();
    expect(twiml).toContain('<?xml');
    expect(twiml).toContain('<Response>');
  });

  it('should start a background recording with absolute URL', async () => {
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Start>');
    expect(twiml).toContain('<Recording');
    expect(twiml).toContain('recordingStatusCallback="https://prototype-2504-dev.twil.io/');
  });

  it('should greet caller with support centre message', async () => {
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString().toLowerCase();
    expect(twiml).toContain('support');
    expect(twiml).toContain('hold');
    expect(twiml).toContain('agent');
  });

  it('should enqueue with workflow SID', async () => {
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Enqueue');
    expect(twiml).toContain('workflowSid="WW9c8e35f2275c0fb0de6c6bfb65e18467"');
  });

  it('should include task attributes with call type and CallSid', async () => {
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('<Task>');
    expect(twiml).toContain('"type":"call"');
    expect(twiml).toContain('"callSid":"CA1234567890abcdef1234567890abcdef"');
  });

  it('should include caller number in task attributes', async () => {
    await handler(context, event, callback);
    const twiml = callback.mock.calls[0][1].toString();
    expect(twiml).toContain('"from":"+15551234567"');
  });
});
