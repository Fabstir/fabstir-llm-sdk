/**
 * Deferred Embeddings Integration Tests
 *
 * Tests the complete workflow:
 * 1. Upload document → Verify "pending" status
 * 2. Start session → Verify background processing starts
 * 3. Wait for completion → Verify "ready" status
 * 4. Search after embeddings → Verify search works
 * 5. Failed embedding → Verify error handling
 * 6. Retry failed document → Verify re-processing
 */

import { test, expect, TEST_CONFIG } from './lib/test-setup';

const TEST_TIMEOUT = 180000; // 3 minutes for full workflow

test.describe('Deferred Embeddings Workflow', () => {
  test.beforeEach(async ({ page, testWallet }) => {
    console.log('[Test] Test wallet:', testWallet.getAddress());

    // Navigate to UI5
    await page.goto(TEST_CONFIG.UI5_URL);
    console.log('[Test] Navigated to UI5');

    // Wait for dashboard to load
    await page.waitForSelector('text=Dashboard', { timeout: 30000 });
    console.log('[Test] Dashboard loaded');

    // Wait for wallet connection (test wallet auto-connects)
    await page.waitForSelector('text=Disconnect', { timeout: 10000 });
    console.log('[Test] Wallet connected');
  });

  test('Phase 7: Search Clarification UI', async ({ page, testWallet }) => {
    test.setTimeout(TEST_TIMEOUT);
    console.log('[Test] Starting Phase 7 search clarification test');

    // Step 1: Navigate to vector databases
    await page.click('a[href="/vector-databases"]');
    console.log('[Test] Clicked Vector Databases link');

    // Wait for vector databases page to load
    await page.waitForSelector('text=Vector Databases', { timeout: 10000 });
    console.log('[Test] Vector databases page loaded');

    // Wait for React hydration
    await page.getByTestId('app-ready').waitFor({ state: 'attached', timeout: 10000 });
    console.log('[Test] React hydration complete');

    // Step 2: Check if any database exists, if not create one quickly
    const existingDB = page.locator('a[href^="/vector-databases/"]').first();
    const dbExists = await existingDB.count() > 0;

    if (!dbExists) {
      console.log('[Test] No databases found - creating test database');

      const createButton = page.locator('button:has-text("Create Database"), button:has-text("Create DB")').first();
      await createButton.click();

      await page.waitForSelector('text=Create Vector Database', { timeout: 5000 });
      await page.waitForTimeout(500);

      const nameInput = page.locator('#name');
      await nameInput.fill(`phase7-test-${Date.now()}`);
      await nameInput.focus();
      await page.keyboard.press('Enter');

      // Wait up to 90 seconds for S5 storage
      await page.waitForSelector('a[href^="/vector-databases/"]', { timeout: 90000 });
      console.log('[Test] Test database created');

      // Close modal manually (it doesn't auto-close)
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500); // Wait for modal animation
      console.log('[Test] Modal closed via Escape key');
    } else {
      console.log('[Test] Using existing database');
    }

    // Click on first database (newly created or existing)
    await page.locator('a[href^="/vector-databases/"]').first().click();
    console.log('[Test] Navigated to database detail page');

    // Wait for database detail page to load
    await page.waitForSelector('text=Documents', { timeout: 10000 });
    console.log('[Test] Database detail page loaded');

    // Step 3: Verify semantic search is disabled when no ready documents
    console.log('[Test] Verifying semantic search disabled...');
    const disabledMessage = page.locator('text=Semantic search unavailable');
    await expect(disabledMessage).toBeVisible({ timeout: 5000 });
    console.log('[Test] ✅ Semantic search correctly disabled');

    // Verify the message content
    const messageText = await page.locator('text=/Upload and vectorize documents/').textContent();
    expect(messageText).toContain('Upload and vectorize documents');
    console.log('[Test] ✅ Disabled message shows correct guidance');

    // Step 4: Verify text filtering input exists and has correct placeholder
    console.log('[Test] Verifying text filtering...');
    const filterInput = page.locator('input[placeholder*="filter by filename"]');
    await expect(filterInput).toBeVisible({ timeout: 5000 });
    console.log('[Test] ✅ Text filter input found');

    // Verify tooltip
    const tooltip = await filterInput.getAttribute('title');
    expect(tooltip).toContain('Text-based filtering');
    expect(tooltip).toContain('Semantic search available after embeddings complete');
    console.log('[Test] ✅ Tooltip correctly explains difference');

    console.log('[Test] 🎉 Phase 7 search clarification test passed!');
  });

  test.skip('Failed embedding scenario - TODO: Implement Phases 4-6', async ({ page, testWallet }) => {
    // This test requires:
    // - Phase 4: Document upload with pending status
    // - Phase 5: Background embedding generation
    // - Phase 6: Error handling and retry functionality
    console.log('[Test] Skipping - waiting for Phases 4-6 implementation');
  });

  test.skip('Retry failed document - TODO: Implement Phases 4-6', async ({ page, testWallet }) => {
    // This test requires:
    // - Phase 4: Document upload with pending status
    // - Phase 5: Background embedding generation
    // - Phase 6: Error handling and retry functionality
    console.log('[Test] Skipping - waiting for Phases 4-6 implementation');
  });
});
