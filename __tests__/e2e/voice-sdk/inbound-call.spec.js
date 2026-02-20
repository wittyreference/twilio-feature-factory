// ABOUTME: Playwright tests for Voice SDK inbound (PSTN-to-browser) calls.
// ABOUTME: Validates incoming call notification, accept, and reject flows.

const { test, expect } = require('@playwright/test');
const twilio = require('twilio');

// These tests require real Twilio credentials
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const API_KEY = process.env.TWILIO_API_KEY;
const API_SECRET = process.env.TWILIO_API_SECRET;
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const APP_SID = process.env.TWILIO_VOICE_SDK_APP_SID;

function getTwilioClient() {
  if (API_KEY && API_SECRET) {
    return twilio(API_KEY, API_SECRET, { accountSid: ACCOUNT_SID });
  }
  return twilio(ACCOUNT_SID, AUTH_TOKEN);
}

test.describe('Voice SDK Inbound Calls', () => {

  test('browser receives and accepts an incoming call', async ({ page }) => {
    test.skip(!ACCOUNT_SID || !AUTH_TOKEN, 'Twilio credentials required');
    test.skip(!APP_SID, 'TWILIO_VOICE_SDK_APP_SID required');
    test.skip(!FROM_NUMBER, 'TWILIO_PHONE_NUMBER required');

    // Register with a known identity
    const testIdentity = `test-inbound-${Date.now()}`;
    await page.addInitScript((identity) => {
      window.IDENTITY = identity;
    }, testIdentity);

    await page.goto('/');
    await expect(page.locator('#status')).toHaveText('registered', { timeout: 15_000 });

    // Use the Twilio REST API to call the browser client via the TwiML App
    const client = getTwilioClient();
    const call = await client.calls.create({
      to: `client:${testIdentity}`,
      from: FROM_NUMBER,
      twiml: '<Response><Say>Hello from the inbound test</Say><Pause length="5"/></Response>',
    });

    // Browser should show incoming call
    await expect(page.locator('#status')).toHaveText('ringing', { timeout: 20_000 });
    await expect(page.locator('#incoming-from')).not.toHaveText('—');

    // Accept the call
    await page.click('#btn-accept');
    await expect(page.locator('#status')).toHaveText('connected', { timeout: 10_000 });

    // Verify call SID is populated
    const callSid = await page.locator('#call-sid').textContent();
    expect(callSid).toBeTruthy();
    expect(callSid).not.toBe('—');

    // Wait for the TwiML to finish and call to disconnect
    await expect(page.locator('#status')).toHaveText('disconnected', { timeout: 30_000 });

    // Verify via REST API that the call completed
    const callDetails = await client.calls(call.sid).fetch();
    expect(['completed', 'busy', 'no-answer']).toContain(callDetails.status);
  });

  test('browser rejects an incoming call', async ({ page }) => {
    test.skip(!ACCOUNT_SID || !AUTH_TOKEN, 'Twilio credentials required');
    test.skip(!APP_SID, 'TWILIO_VOICE_SDK_APP_SID required');
    test.skip(!FROM_NUMBER, 'TWILIO_PHONE_NUMBER required');

    const testIdentity = `test-reject-${Date.now()}`;
    await page.addInitScript((identity) => {
      window.IDENTITY = identity;
    }, testIdentity);

    await page.goto('/');
    await expect(page.locator('#status')).toHaveText('registered', { timeout: 15_000 });

    // Initiate an inbound call
    const client = getTwilioClient();
    await client.calls.create({
      to: `client:${testIdentity}`,
      from: FROM_NUMBER,
      twiml: '<Response><Say>This call should be rejected</Say></Response>',
    });

    // Wait for ringing
    await expect(page.locator('#status')).toHaveText('ringing', { timeout: 20_000 });

    // Reject the call
    await page.click('#btn-reject');
    await expect(page.locator('#status')).toHaveText('registered', { timeout: 10_000 });

    // Incoming panel should be hidden
    const logText = await page.locator('#log').textContent();
    expect(logText).toContain('Incoming call rejected');
  });
});
