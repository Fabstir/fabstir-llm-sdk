/**
 * Basic wallet connection test - verifies test wallet injection works
 */
import { test, expect, TEST_CONFIG } from './lib/test-setup';

test.describe('Wallet Connection (Test Mode)', () => {
  test('should auto-connect test wallet and load dashboard', async ({ page, testWallet }) => {
    console.log('[Test] Starting wallet connection test');
    console.log('[Test] Test wallet address:', testWallet.getAddress());

    // Navigate to UI5
    await page.goto(TEST_CONFIG.UI5_URL);
    console.log('[Test] Navigated to UI5');

    // Wait for dashboard to load (indicates SDK initialized)
    await page.waitForSelector('text=Dashboard', { timeout: 30000 });
    console.log('[Test] Dashboard loaded');

    // Verify wallet address displayed in navbar
    const addressLocator = page.locator('text=/0x[a-fA-F0-9]{4}\\.\\.\\./')
    await expect(addressLocator).toBeVisible({ timeout: 5000 });

    const displayedAddress = await addressLocator.textContent();
    console.log('[Test] Displayed address:', displayedAddress);

    // Verify it matches test wallet address (truncated format)
    const testAddress = testWallet.getAddress();
    expect(displayedAddress).toContain(testAddress.slice(0, 6));

    // Verify Disconnect button is present (confirms wallet connected)
    await expect(page.locator('button:has-text("Disconnect")')).toBeVisible();

    console.log('[Test] ✅ Wallet connection test passed');
  });

  test('should detect test mode in browser console', async ({ page, testWallet }) => {
    // Capture console logs
    const logs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      logs.push(text);
      if (text.includes('Test mode') || text.includes('TEST MODE') || text.includes('🧪')) {
        console.log('[Browser Console]', text);
      }
    });

    // Navigate to UI5
    await page.goto(TEST_CONFIG.UI5_URL);

    // Wait for dashboard to load
    await page.waitForSelector('text=Dashboard', { timeout: 30000 });

    // Give time for all initialization logs
    await page.waitForTimeout(3000);

    // Verify test mode was detected
    const testModeLogs = logs.filter(log =>
      log.includes('Test mode') || log.includes('TEST MODE') || log.includes('🧪')
    );

    console.log(`[Test] Found ${testModeLogs.length} test mode logs:`, testModeLogs);
    expect(testModeLogs.length).toBeGreaterThan(0);

    console.log('[Test] ✅ Test mode detection passed');
  });
});
