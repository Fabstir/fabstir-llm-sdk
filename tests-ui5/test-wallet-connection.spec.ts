/**
 * Basic wallet connection test - verifies test wallet injection works
 */
import { test, expect, TEST_CONFIG, waitForSDKInit } from './lib/test-setup';

test.describe('Wallet Connection (Test Mode)', () => {
  test('should auto-connect test wallet and initialize SDK', async ({ page, testWallet }) => {
    console.log('[Test] Starting wallet connection test');
    console.log('[Test] Test wallet address:', testWallet.getAddress());

    // Navigate to UI5
    await page.goto(TEST_CONFIG.UI5_URL);
    console.log('[Test] Navigated to UI5');

    // Wait for SDK initialization (should auto-connect via test wallet)
    await waitForSDKInit(page);

    // Verify wallet address displayed in navbar
    const addressLocator = page.locator('[data-testid="wallet-address"]').or(
      page.locator('text=/0x[a-fA-F0-9]{4}\\.\\.\\./')
    );
    await expect(addressLocator).toBeVisible({ timeout: 5000 });

    const displayedAddress = await addressLocator.textContent();
    console.log('[Test] Displayed address:', displayedAddress);

    // Verify it matches test wallet address (truncated format)
    const testAddress = testWallet.getAddress();
    const truncated = `${testAddress.slice(0, 6)}...${testAddress.slice(-4)}`;
    expect(displayedAddress).toContain(testAddress.slice(0, 6));

    console.log('[Test] ✅ Wallet connection test passed');
  });

  test('should show SDK initialized status', async ({ page, testWallet }) => {
    await page.goto(TEST_CONFIG.UI5_URL);

    // Wait for SDK ready indicator
    await waitForSDKInit(page);

    // Check browser console for test mode detection
    const logs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      logs.push(text);
      if (text.includes('Test mode') || text.includes('TEST MODE')) {
        console.log('[Browser Console]', text);
      }
    });

    // Verify no errors in console
    page.on('pageerror', (err) => {
      console.error('[Browser Error]', err.message);
      throw err;
    });

    // Give time for console logs
    await page.waitForTimeout(2000);

    // Verify test mode was detected
    const testModeLogs = logs.filter(log =>
      log.includes('Test mode') || log.includes('TEST MODE') || log.includes('🧪')
    );
    expect(testModeLogs.length).toBeGreaterThan(0);

    console.log('[Test] ✅ SDK initialization test passed');
  });
});
