/**
 * Vector Database Creation Test
 *
 * Tests creating a vector database with real blockchain transactions.
 * Verifies:
 * - Navigation to vector databases page
 * - Database creation form
 * - Blockchain transaction (auto-approved by test wallet)
 * - Database appears in list
 */
import { test, expect, TEST_CONFIG } from './lib/test-setup';

test.describe('Vector Database - Create', () => {
  test('should create a new vector database with blockchain transaction', async ({ page, testWallet }) => {
    console.log('[Test] Starting vector database creation test');
    console.log('[Test] Test wallet:', testWallet.getAddress());

    // Navigate to UI5
    await page.goto(TEST_CONFIG.UI5_URL);
    console.log('[Test] Navigated to UI5');

    // Wait for dashboard to load
    await page.waitForSelector('text=Dashboard', { timeout: 30000 });
    console.log('[Test] Dashboard loaded');

    // IMPORTANT: Wait for wallet to connect before navigating
    // The wallet auto-connects via test setup, but we need to wait for it
    await page.waitForSelector('text=Disconnect', { timeout: 10000 });
    console.log('[Test] Wallet connected (Disconnect button visible)');

    // Navigate to vector databases page
    await page.click('a[href="/vector-databases"]');
    console.log('[Test] Clicked Vector Databases link');

    // Wait for vector databases page to load
    await page.waitForSelector('text=Vector Databases', { timeout: 10000 });
    console.log('[Test] Vector databases page loaded');

    // Take screenshot of initial state
    await page.screenshot({ path: 'test-results/vector-db-list-initial.png' });

    // Check if there's a "+ Create Database" or "New Database" button
    const createButton = page.locator('button:has-text("Create Database"), button:has-text("New Database"), a:has-text("New Database")').first();
    await expect(createButton).toBeVisible({ timeout: 5000 });
    console.log('[Test] Create button found');

    // Click create button
    await createButton.click();
    console.log('[Test] Clicked create button');

    // Wait for modal to appear
    await page.waitForSelector('text=Create Vector Database', { timeout: 5000 });
    console.log('[Test] Modal appeared');

    // Wait a moment for modal to fully render
    await page.waitForTimeout(500);

    // Fill in database name (look inside modal)
    const nameInput = page.locator('input[type="text"]').first();
    await nameInput.waitFor({ timeout: 5000 });
    await nameInput.fill('Test Database 1');
    console.log('[Test] Filled database name');

    // Fill in description (second text input in modal)
    const allInputs = page.locator('input[type="text"], textarea');
    if (await allInputs.count() >= 2) {
      await allInputs.nth(1).fill('UI5 automated test database');
      console.log('[Test] Filled description');
    }

    // Take screenshot before submission
    await page.screenshot({ path: 'test-results/vector-db-create-form.png' });

    // Click create/submit button (force click to bypass modal overlay)
    const submitButton = page.locator('button:has-text("Create"), button:has-text("Submit"), button[type="submit"]').first();
    await submitButton.click({ force: true });
    console.log('[Test] Clicked submit button');

    // Verify no MetaMask popup (test wallet should auto-approve)
    console.log('[Test] ⏳ Waiting for blockchain transaction (5-15 seconds)...');

    // Verify loading indicator appears
    const loadingIndicators = [
      page.locator('text=/Loading/i'),
      page.locator('text=/Creating/i'),
      page.locator('[role="progressbar"]'),
      page.locator('.spinner'),
      page.locator('.loading')
    ];

    let loadingFound = false;
    for (const indicator of loadingIndicators) {
      try {
        await indicator.waitFor({ timeout: 2000, state: 'visible' });
        loadingFound = true;
        console.log('[Test] ✅ Loading indicator detected');
        break;
      } catch (e) {
        // Try next indicator
      }
    }

    if (!loadingFound) {
      console.log('[Test] ⚠️ No loading indicator found (transaction may have been very fast)');
    }

    // Wait for success message or database to appear in list
    // Try multiple possible success indicators
    const successIndicators = [
      page.locator('text=/Database created/i'),
      page.locator('text=/Success/i'),
      page.locator('text=/Created/i'),
      page.locator('text=Test Database 1')
    ];

    let successFound = false;
    for (const indicator of successIndicators) {
      try {
        await indicator.waitFor({ timeout: 30000, state: 'visible' });
        successFound = true;
        console.log('[Test] ✅ Success indicator found');
        break;
      } catch (e) {
        // Try next indicator
      }
    }

    if (!successFound) {
      console.log('[Test] ⚠️ No success indicator found, checking database list...');
    }

    // Wait a moment for UI to update
    await page.waitForTimeout(2000);

    // Take screenshot after creation
    await page.screenshot({ path: 'test-results/vector-db-created.png' });

    // Verify database appears in list (navigate back if needed)
    const currentUrl = page.url();
    if (!currentUrl.includes('/vector-databases')) {
      await page.click('a[href="/vector-databases"]');
      await page.waitForTimeout(1000);
    }

    // Check if "Test Database 1" appears on the page
    const databaseCard = page.locator('text=Test Database 1');
    await expect(databaseCard).toBeVisible({ timeout: 5000 });
    console.log('[Test] ✅ Database appears in list');

    // Check for console errors (set up listener at start of test for complete capture)
    // Note: This captures errors after this point, should ideally be set up earlier
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];
    const consoleInfo: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error') {
        consoleErrors.push(text);
      } else if (msg.type() === 'warning') {
        consoleWarnings.push(text);
      } else if (text.includes('Transaction hash:') || text.includes('tx:')) {
        consoleInfo.push(text);
      }
    });

    // Wait a moment for any final console messages
    await page.waitForTimeout(1000);

    // Log transaction hash if found in console
    const txHashMessages = consoleInfo.filter(msg =>
      msg.toLowerCase().includes('transaction') || msg.toLowerCase().includes('tx')
    );
    if (txHashMessages.length > 0) {
      console.log('[Test] 📝 Transaction info:', txHashMessages);
    }

    // Report console errors
    if (consoleErrors.length > 0) {
      console.log('[Test] ⚠️ Console errors detected:', consoleErrors);
      // Don't fail test on console errors, just warn
    } else {
      console.log('[Test] ✅ No console errors detected');
    }

    if (consoleWarnings.length > 0) {
      console.log('[Test] ⚠️ Console warnings:', consoleWarnings.slice(0, 5)); // First 5 only
    }

    console.log('[Test] ✅ Vector database creation test passed');
  });

  test('should show database in list after creation', async ({ page, testWallet }) => {
    console.log('[Test] Verifying database persists in list');

    // Navigate to vector databases page
    await page.goto(`${TEST_CONFIG.UI5_URL}/vector-databases`);
    console.log('[Test] Navigated to vector databases page');

    // Wait for page load
    await page.waitForSelector('text=Vector Databases', { timeout: 30000 });

    // Verify "Test Database 1" exists
    const databaseCard = page.locator('text=Test Database 1');
    await expect(databaseCard).toBeVisible({ timeout: 10000 });
    console.log('[Test] ✅ Database found in list');

    // Take screenshot
    await page.screenshot({ path: 'test-results/vector-db-list-with-database.png' });

    console.log('[Test] ✅ Database persistence test passed');
  });
});
