// ABOUTME: Playwright tests for hybrid PSTN+SDK call scenarios.
// ABOUTME: Validates the bridge between PSTN callers and browser-based SDK agents.

const { test, expect } = require('@playwright/test');
const twilio = require('twilio');

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const API_KEY = process.env.TWILIO_API_KEY;
const API_SECRET = process.env.TWILIO_API_SECRET;
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const APP_SID = process.env.TWILIO_VOICE_SDK_APP_SID;

// A second Twilio number to simulate the "customer" calling in
const TRACKING_NUMBER = process.env.TEST_PHONE_NUMBER;

function getTwilioClient() {
  if (API_KEY && API_SECRET) {
    return twilio(API_KEY, API_SECRET, { accountSid: ACCOUNT_SID });
  }
  return twilio(ACCOUNT_SID, AUTH_TOKEN);
}

test.describe('Hybrid PSTN + SDK Calls', () => {

  test('PSTN caller connects to browser agent via SDK', async ({ page }) => {
    test.skip(!ACCOUNT_SID || !AUTH_TOKEN, 'Twilio credentials required');
    test.skip(!APP_SID, 'TWILIO_VOICE_SDK_APP_SID required');
    test.skip(!FROM_NUMBER, 'TWILIO_PHONE_NUMBER required');

    // Register browser agent with known identity
    const agentIdentity = `agent-hybrid-${Date.now()}`;
    await page.addInitScript((identity) => {
      window.IDENTITY = identity;
    }, agentIdentity);

    await page.goto('/');
    await expect(page.locator('#status')).toHaveText('registered', { timeout: 15_000 });

    // Simulate a PSTN caller reaching the browser agent
    // The call uses TwiML to <Dial><Client> to the browser identity
    const client = getTwilioClient();
    const call = await client.calls.create({
      to: `client:${agentIdentity}`,
      from: FROM_NUMBER,
      twiml: `<Response><Dial><Client>${agentIdentity}</Client></Dial></Response>`,
    });

    // Browser should receive the incoming call
    await expect(page.locator('#status')).toHaveText('ringing', { timeout: 20_000 });

    // Agent accepts
    await page.click('#btn-accept');
    await expect(page.locator('#status')).toHaveText('connected', { timeout: 10_000 });

    // Verify the call is bridged
    const callSid = await page.locator('#call-sid').textContent();
    expect(callSid).toBeTruthy();
    expect(callSid).not.toBe('—');

    // Let the call run briefly then hangup from browser
    await page.waitForTimeout(3000);
    await page.click('#btn-hangup');
    await expect(page.locator('#status')).toHaveText('disconnected', { timeout: 10_000 });

    // Verify call completed via REST API
    const callDetails = await client.calls(call.sid).fetch();
    expect(['completed', 'busy', 'canceled']).toContain(callDetails.status);
  });

  test('browser agent dials PSTN and connects', async ({ page }) => {
    test.skip(!ACCOUNT_SID || !AUTH_TOKEN, 'Twilio credentials required');
    test.skip(!TRACKING_NUMBER, 'TEST_PHONE_NUMBER required for outbound PSTN');

    await page.goto('/');
    await expect(page.locator('#status')).toHaveText('registered', { timeout: 15_000 });

    // Agent dials a PSTN number from the browser
    await page.fill('#dial-input', TRACKING_NUMBER);
    await page.click('#btn-dial');

    await expect(page.locator('#status')).toHaveText('connecting');

    // Wait for connection (PSTN ring can take time)
    await expect(page.locator('#status')).toHaveText('connected', { timeout: 30_000 });

    // Verify call SID
    const callSid = await page.locator('#call-sid').textContent();
    expect(callSid).toMatch(/^CA[a-f0-9]{32}$/);

    // Wait for B-leg to ring, IVR to answer, and bridge to establish
    await page.waitForTimeout(5000);

    // Verify browser still shows connected (call didn't drop after signaling)
    await expect(page.locator('#status')).toHaveText('connected');

    // Verify call is actively bridged via REST API
    const client = getTwilioClient();
    const activeCall = await client.calls(callSid).fetch();
    expect(activeCall.status).toBe('in-progress');

    // Hangup and verify disconnection
    await page.click('#btn-hangup');
    await expect(page.locator('#status')).toHaveText('disconnected', { timeout: 10_000 });

    // Verify call completed with meaningful duration (proves real audio bridge)
    const completedCall = await client.calls(callSid).fetch();
    expect(completedCall.status).toBe('completed');
    expect(parseInt(completedCall.duration)).toBeGreaterThanOrEqual(3);
  });

  test('event log captures full hybrid call lifecycle', async ({ page }) => {
    test.skip(!ACCOUNT_SID || !AUTH_TOKEN, 'Twilio credentials required');
    test.skip(!APP_SID, 'TWILIO_VOICE_SDK_APP_SID required');
    test.skip(!FROM_NUMBER, 'TWILIO_PHONE_NUMBER required');

    const agentIdentity = `agent-log-${Date.now()}`;
    await page.addInitScript((identity) => {
      window.IDENTITY = identity;
    }, agentIdentity);

    await page.goto('/');
    await expect(page.locator('#status')).toHaveText('registered', { timeout: 15_000 });

    // Initiate inbound call to agent
    const client = getTwilioClient();
    await client.calls.create({
      to: `client:${agentIdentity}`,
      from: FROM_NUMBER,
      twiml: '<Response><Say>Test call for log verification</Say><Pause length="2"/></Response>',
    });

    await expect(page.locator('#status')).toHaveText('ringing', { timeout: 20_000 });
    await page.click('#btn-accept');
    await expect(page.locator('#status')).toHaveText('connected', { timeout: 10_000 });

    // Wait for TwiML to complete
    await expect(page.locator('#status')).toHaveText('disconnected', { timeout: 30_000 });

    // Verify log entries
    const logText = await page.locator('#log').textContent();
    expect(logText).toContain('Device registered and ready');
    expect(logText).toContain('Incoming call from');
    expect(logText).toContain('Incoming call accepted');
    expect(logText).toContain('inbound call connected');
    expect(logText).toContain('inbound call disconnected');
  });
});
