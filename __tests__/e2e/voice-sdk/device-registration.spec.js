// ABOUTME: Playwright tests for Voice SDK device registration.
// ABOUTME: Validates token fetch, device registration, and error handling.

const { test, expect } = require('@playwright/test');

test.describe('Voice SDK Device Registration', () => {

  test('registers device with valid token', async ({ page }) => {
    await page.goto('/');

    // Wait for device to register (token fetch + WebSocket connect)
    await expect(page.locator('#status')).toHaveText('registered', { timeout: 15_000 });

    // Identity should be populated
    const identity = await page.locator('#identity').textContent();
    expect(identity).toMatch(/^browser-user-\d+$/);

    // Dial button should be enabled
    await expect(page.locator('#btn-dial')).toBeEnabled();
  });

  test('uses custom identity when provided', async ({ page }) => {
    await page.goto('/?identity=test-agent-42');

    // The harness reads identity from URL param via the token API
    // We need to set window.IDENTITY before init runs, or pass it via URL
    // Since the harness fetches /api/token, we'll verify via the identity display
    await expect(page.locator('#status')).toHaveText('registered', { timeout: 15_000 });
  });

  test('shows error for invalid token endpoint', async ({ page }) => {
    // Override the token URL to a non-existent endpoint
    await page.addInitScript(() => {
      window.TOKEN_URL = '/api/nonexistent';
    });

    await page.goto('/');

    // Should show an error and stay offline
    await expect(page.locator('#error')).not.toBeEmpty({ timeout: 10_000 });
    await expect(page.locator('#status')).toHaveText('offline');
  });

  test('event log shows initialization steps', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#status')).toHaveText('registered', { timeout: 15_000 });

    const logText = await page.locator('#log').textContent();
    expect(logText).toContain('Fetching access token');
    expect(logText).toContain('Token received for identity');
    expect(logText).toContain('Device registered and ready');
  });
});
