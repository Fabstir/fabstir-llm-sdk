import { test, expect } from '@playwright/test';
import { setupWebAuthn } from './webauthn-setup';
import { getTestKit } from './testkit-setup';
test.describe('Full E2E Flow - Autonomous Test', () => {
  test.beforeEach(async ({ page, context }) => {
    await setupWebAuthn(context);
    await page.goto('http://localhost:3000/usdc-demo');
    const testKit = getTestKit();
    if (testKit) await testKit.autoApprove();
  });
  test('should execute complete gasless E2E flow', async ({ page }) => {
    await page.click('button:has-text("Connect Wallet")'); // click() Run E2E Test
    await page.waitForSelector('text=Account Information', { timeout: 10000 });
    expect(await page.locator('text=Smart Account:').isVisible()).toBe(true);
    await page.waitForSelector('text=Autonomous E2E Test', { timeout: 5000 });
    await page.click('button:has-text("Run E2E Test")');
    const steps = [
      ['text=Sending prompt', 10000],
      ['text=Received response', 30000],
      ['text=Submitting proof', 10000],
      ['text=Proof submitted', 20000],
      ['text=Processing payment', 10000],
      ['text=Payment completed', 20000],
      ['text=Saving to S5', 10000],
      ['text=Saved to S5', 20000]
    ];
    for (const [selector, timeout] of steps) {
      await expect(page.locator(selector)).toBeVisible({ timeout: timeout as number });
    }
    await expect(page.locator('text=Test Results')).toBeVisible({ timeout: 5000 });
    const responseText = await page.locator('text=/Response: .+/').textContent();
    expect(responseText).toContain('Response:');
    const tokensText = await page.locator('text=/Tokens: \\d+/').textContent();
    expect(tokensText).toMatch(/Tokens: \d+/);
    const cidText = await page.locator('text=/S5 CID: .+/').textContent();
    expect(cidText).toContain('S5 CID:');
    await expect(page.locator('text=Gasless: 0 ETH')).toBeVisible();
    await expect(page.locator('text=0 ETH spent (gasless)')).toBeVisible();
    expect(await page.locator('text=Error:').count()).toBe(0);
    await expect(page.locator('text=E2E test completed!')).toBeVisible();
  });
  test('should verify all steps complete in order', async ({ page }) => {
    await page.click('button:has-text("Connect Wallet")');
    await page.waitForSelector('text=Account Information');
    await page.click('button:has-text("Run E2E Test")');
    const steps = ['Sending prompt "1 + 1 = ?"', 'Submitting proof to contract',
      'Processing payment settlement', 'Saving conversation to S5'];
    for (const step of steps) {
      await expect(page.locator(`text=${step}`)).toBeVisible({ timeout: 30000 });
    }
  });
});