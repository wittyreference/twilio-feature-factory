// ABOUTME: Playwright tests for Voice SDK outbound (browser-to-PSTN) calls.
// ABOUTME: Validates dial, connect, hangup lifecycle and call SID extraction.

const { test, expect } = require('@playwright/test');

// These tests require real Twilio credentials and a valid phone number
const TEST_PHONE = process.env.TEST_PHONE_NUMBER;

test.describe('Voice SDK Outbound Calls', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#status')).toHaveText('registered', { timeout: 15_000 });
  });

  test('dials a PSTN number and transitions through call states', async ({ page }) => {
    test.skip(!TEST_PHONE, 'TEST_PHONE_NUMBER env var required');

    // Enter number and dial
    await page.fill('#dial-input', TEST_PHONE);
    await page.click('#btn-dial');

    // Should transition to connecting
    await expect(page.locator('#status')).toHaveText('connecting');

    // Should eventually connect (PSTN ring + answer can take time)
    await expect(page.locator('#status')).toHaveText('connected', { timeout: 30_000 });

    // Call SID should be populated
    const callSid = await page.locator('#call-sid').textContent();
    expect(callSid).toMatch(/^CA[a-f0-9]{32}$/);

    // Hangup
    await page.click('#btn-hangup');
    await expect(page.locator('#status')).toHaveText('disconnected', { timeout: 10_000 });
  });

  test('shows error when dialing with empty input', async ({ page }) => {
    // Dial button should be enabled but input is empty
    await page.click('#btn-dial');

    // Nothing should happen — status stays registered
    await expect(page.locator('#status')).toHaveText('registered');
  });

  test('dial button disables during active call', async ({ page }) => {
    test.skip(!TEST_PHONE, 'TEST_PHONE_NUMBER env var required');

    await page.fill('#dial-input', TEST_PHONE);
    await page.click('#btn-dial');

    // Dial should be disabled, hangup enabled
    await expect(page.locator('#btn-dial')).toBeDisabled();
    await expect(page.locator('#btn-hangup')).toBeEnabled();

    // Cleanup: hangup
    await page.click('#btn-hangup');
    await expect(page.locator('#status')).not.toHaveText('connecting', { timeout: 15_000 });
  });

  test('event log records outbound call lifecycle', async ({ page }) => {
    test.skip(!TEST_PHONE, 'TEST_PHONE_NUMBER env var required');

    await page.fill('#dial-input', TEST_PHONE);
    await page.click('#btn-dial');

    await expect(page.locator('#status')).toHaveText('connected', { timeout: 30_000 });

    const logText = await page.locator('#log').textContent();
    expect(logText).toContain('Dialing: ' + TEST_PHONE);
    expect(logText).toContain('outbound call connected');

    await page.click('#btn-hangup');
    await expect(page.locator('#status')).toHaveText('disconnected', { timeout: 10_000 });

    const finalLog = await page.locator('#log').textContent();
    expect(finalLog).toContain('outbound call disconnected');
  });
});
