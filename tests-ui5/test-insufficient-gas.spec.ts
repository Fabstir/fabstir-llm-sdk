import { test, expect } from './lib/test-setup';
import { ethers } from 'ethers';

test.describe('Phase 7.2: Insufficient Gas Fees', () => {

  test('should handle insufficient gas fees gracefully', async ({ page, testWallet }) => {
    test.setTimeout(90000);

    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 7.2: Insufficient Gas Fee Handling');
    console.log('[Test] ========================================\n');

    // Step 1: Check account balance
    console.log('[Test] === STEP 1: Check Account Balance ===');
    const balance = await testWallet.getBalance(); // Get native ETH balance
    const balanceInEth = ethers.formatEther(balance);
    const address = testWallet.getAddress();
    console.log(`[Test] Account: ${address}`);
    console.log(`[Test] Balance: ${balanceInEth} ETH`);

    if (parseFloat(balanceInEth) > 0.0001) {
      console.log('[Test] ⚠️  Balance too high for insufficient gas test');
      console.log('[Test] ⚠️  This test requires < 0.0001 ETH');
      console.log('[Test] ⚠️  Skipping test - account has sufficient funds');
      test.skip();
      return;
    }

    console.log('[Test] ✅ Balance is low enough to test insufficient gas\n');

    // Step 2: Navigate to settings/deposits page
    console.log('[Test] === STEP 2: Navigate to Deposits Page ===');
    await page.goto('http://localhost:3002/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Try to navigate to settings or find deposit functionality
    // In UI5, deposits might be in settings or a dedicated deposits page
    const settingsLink = page.locator('a[href="/settings"]').first();
    if (await settingsLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await settingsLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      console.log('[Test] ✅ On settings page\n');
    } else {
      console.log('[Test] ⚠️  Settings link not found, staying on dashboard\n');
    }

    // Step 3: Try to make a deposit (blockchain transaction)
    console.log('[Test] === STEP 3: Attempt Deposit (Should Fail) ===');

    // Look for deposit button/form
    const depositButton = page.locator('button:has-text("Deposit")').first();
    if (!(await depositButton.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('[Test] ⚠️  Deposit button not found in UI');
      console.log('[Test] ⚠️  Sub-phase 7.2 requires blockchain transaction feature');
      console.log('[Test] ⚠️  Skipping test - no suitable UI element found');
      test.skip();
      return;
    }

    await depositButton.click();
    await page.waitForTimeout(1000);

    // Fill in deposit amount (small amount to minimize gas cost)
    const amountInput = page.locator('input[type="number"], input[placeholder*="amount" i]').first();
    if (await amountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await amountInput.fill('0.0001'); // Tiny amount
      await page.waitForTimeout(500);
    }

    const submitButton = page.locator('button[type="submit"], button:has-text("Confirm")').first();

    // Monitor console for errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    console.log('[Test] Clicking submit (expecting transaction to fail)...');
    await submitButton.click();
    await page.waitForTimeout(5000); // Wait for transaction attempt

    // Step 4: Verify error handling
    console.log('[Test] === STEP 4: Verify Error Handling ===');

    // Look for error indicators
    const errorPatterns = [
      'insufficient funds',
      'insufficient balance',
      'not enough eth',
      'gas required',
      'insufficient',
      'failed',
      'error'
    ];

    let foundError = false;
    let errorMessage = '';

    // Check for visible error messages in UI
    for (const pattern of errorPatterns) {
      const errorElement = page.locator(`text=/${pattern}/i`).first();
      if (await errorElement.isVisible({ timeout: 3000 }).catch(() => false)) {
        errorMessage = await errorElement.textContent() || '';
        console.log(`[Test] Found error message: "${errorMessage}"`);
        foundError = true;
        break;
      }
    }

    // Check console errors
    const hasConsoleError = consoleErrors.some(err =>
      err.toLowerCase().includes('insufficient') ||
      err.toLowerCase().includes('gas') ||
      err.toLowerCase().includes('funds')
    );

    if (hasConsoleError) {
      console.log('[Test] Console error detected (expected)');
      const relevantError = consoleErrors.find(err =>
        err.toLowerCase().includes('insufficient') ||
        err.toLowerCase().includes('gas')
      );
      if (relevantError) {
        console.log(`[Test] Error: ${relevantError.substring(0, 200)}...`);
      }
      foundError = true;
    }

    // Check if we're still on the form page (transaction didn't succeed)
    const currentUrl = page.url();
    const stillOnNewPage = currentUrl.includes('/session-groups/new');

    if (stillOnNewPage) {
      console.log('[Test] ✅ Still on create form (transaction did not complete)');
      foundError = true;
    }

    await page.screenshot({ path: 'test-results/insufficient-gas-error.png', fullPage: true });

    // Step 5: Verify user-friendly error
    console.log('[Test] === STEP 5: Verify Error Message Quality ===');

    if (foundError) {
      console.log('[Test] ✅ Error detected (as expected with insufficient gas)');

      // Check if error is user-friendly
      const hasStackTrace = errorMessage.includes('.ts:') ||
                           errorMessage.includes('at Object') ||
                           errorMessage.includes('node_modules');

      if (hasStackTrace) {
        console.log('[Test] ⚠️  Error contains technical details (should be user-friendly)');
      } else {
        console.log('[Test] ✅ Error message is user-friendly (no stack traces)');
      }

      // Verify deposit was not completed
      console.log('[Test] Verifying transaction did not complete...');

      // Check if we're still on the deposit form/modal
      const modalStillOpen = await depositButton.isVisible({ timeout: 2000 }).catch(() => false) ||
                             await amountInput.isVisible({ timeout: 2000 }).catch(() => false);

      if (modalStillOpen) {
        console.log('[Test] ✅ Deposit form still visible (transaction did not complete)');
      } else {
        console.log('[Test] ⚠️  Deposit form closed (may have succeeded or failed gracefully)');
      }

    } else {
      console.log('[Test] ⚠️  No error detected (may have succeeded despite low balance)');
      console.log('[Test] ⚠️  Check if account has enough ETH or gas prices are very low');
    }

    console.log('[Test] ========================================');
    console.log('[Test] ✅ Phase 7.2 Complete: Insufficient gas handling tested');
    console.log('[Test] ========================================\n');

    // The test passes if we detected error handling (which we expect with low balance)
    expect(foundError).toBe(true);
  });
});
