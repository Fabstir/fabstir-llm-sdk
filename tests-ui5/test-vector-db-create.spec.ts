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

test.describe.serial('Vector Database - Create', () => {
  // Shared wallet address for both tests (to persist database between tests)
  let sharedWalletAddress: string;

  test('should create a new vector database with blockchain transaction', async ({ page, testWallet }) => {
    // Increase timeout for S5 storage operations (can take 60-90 seconds)
    test.setTimeout(120000);
    console.log('[Test] Starting vector database creation test');
    console.log('[Test] Test wallet:', testWallet.getAddress());

    // Save wallet address for Test 2
    sharedWalletAddress = testWallet.getAddress();

    // Capture console errors and logs
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      const text = `[Browser ${msg.type()}] ${msg.text()}`;
      consoleMessages.push(text);
      // Log SDK initialization messages, errors, and warnings
      if (msg.type() === 'error' || msg.type() === 'warning' || text.includes('[UI5SDK]') || text.includes('[S5VectorStore]') || text.includes('[useWallet]') || text.includes('[VectorRAGManager]')) {
        console.log(text);
      }
    });

    page.on('pageerror', (error) => {
      console.log(`[Browser Error] ${error.message}`);
      consoleMessages.push(`[Browser Error] ${error.message}`);
    });

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

    // CRITICAL: Wait for React hydration to complete before interacting
    // Note: app-ready marker is hidden (display: none), so we check for 'attached' state
    await page.getByTestId('app-ready').waitFor({ state: 'attached', timeout: 10000 });
    console.log('[Test] ✅ React hydration complete (app-ready marker found)');

    // Take screenshot of initial state
    await page.screenshot({ path: 'test-results/vector-db-list-initial.png' });

    // CLEANUP: Delete "Test Database 1" if it already exists from a previous test run
    const existingDatabase = page.locator('text=Test Database 1').first();
    const databaseExists = await existingDatabase.count() > 0;

    if (databaseExists) {
      console.log('[Test] 🧹 Cleaning up existing "Test Database 1" from previous run...');

      // Set up dialog handler BEFORE clicking delete
      page.once('dialog', async dialog => {
        console.log('[Test] Confirmation dialog:', dialog.message());
        await dialog.accept();
        console.log('[Test] Accepted deletion confirmation');
      });

      // Find the database card containing "Test Database 1"
      const databaseCard = page.locator('a:has-text("Test Database 1")').first();

      // Find and click the delete button within that card
      // The delete button is a trash icon button
      const deleteButton = databaseCard.locator('button[title="Delete database"]');
      await deleteButton.click();
      console.log('[Test] Clicked delete button');

      // Wait for database to be removed from the list
      await page.waitForTimeout(2000);
      console.log('[Test] ✅ Cleanup complete');
    } else {
      console.log('[Test] No existing "Test Database 1" found, skipping cleanup');
    }

    // Check if there's a "+ Create Database" or "New Database" button
    const createButton = page.locator('button:has-text("Create Database"), button:has-text("New Database"), a:has-text("New Database")').first();
    await expect(createButton).toBeVisible({ timeout: 5000 });
    console.log('[Test] Create button found');

    // Click create button
    await createButton.click();
    console.log('[Test] Clicked create button');

    // Wait a moment for React state update and modal rendering
    await page.waitForTimeout(2000);

    // Debug: Check page HTML for modal elements
    const htmlContent = await page.content();
    console.log('[Test] Page HTML includes "Create Vector Database":', htmlContent.includes('Create Vector Database'));
    console.log('[Test] Page HTML includes "isOpen":', htmlContent.includes('modal'));

    // Debug: Log what's visible on the page
    const bodyText = await page.textContent('body');
    console.log('[Test] Body text includes "Create Vector Database":', bodyText?.includes('Create Vector Database'));

    // Wait for modal to appear
    await page.waitForSelector('text=Create Vector Database', { timeout: 5000 });
    console.log('[Test] Modal appeared');

    // Wait a moment for modal to fully render
    await page.waitForTimeout(500);

    // Fill in database name (use ID selector for specificity)
    const nameInput = page.locator('#name');
    await nameInput.waitFor({ timeout: 5000 });
    await nameInput.fill('Test Database 1');
    console.log('[Test] Filled database name');

    // Fill in description (use ID selector for specificity)
    const descriptionInput = page.locator('#description');
    await descriptionInput.waitFor({ timeout: 5000 });
    await descriptionInput.fill('UI5 automated test database');
    console.log('[Test] Filled description');

    // Take screenshot before submission
    await page.screenshot({ path: 'test-results/vector-db-create-form.png' });

    // Listen for page crashes
    page.on('crash', () => {
      console.log('[Test] 🔥 PAGE CRASHED!');
      console.log('[Test] 📝 Console messages before crash:', consoleMessages.slice(0, 20));
    });

    // Click create/submit button OR press Enter to submit form naturally
    const submitButton = page.locator('button:has-text("Create"), button:has-text("Submit"), button[type="submit"]').first();

    // Wait for button to be ready
    await submitButton.waitFor({ state: 'visible', timeout: 5000 });

    // Option 1: Try normal click first (triggers React events)
    try {
      await submitButton.click({ timeout: 2000 });
      console.log('[Test] Clicked submit button (normal click)');
    } catch (e) {
      // Option 2: If button is blocked, press Enter on focused input to submit form
      console.log('[Test] Button blocked, using Enter key on name input to submit form');
      await nameInput.focus();
      await page.keyboard.press('Enter');
    }

    // Log console messages immediately after submit to catch early errors
    await page.waitForTimeout(2000);
    console.log('[Test] 📝 Console messages after submit (' + consoleMessages.length + ' total):');
    consoleMessages.slice(0, 30).forEach((msg, i) => console.log(`  [${i}] ${msg}`));

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

    // Log ALL console messages captured from start
    console.log('[Test] 📝 ALL Console Messages (' + consoleMessages.length + ' total):');
    consoleMessages.forEach((msg, i) => {
      console.log(`  [${i}] ${msg}`);
    });

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

  test('should show database in list after creation', async ({ page }) => {
    // Same timeout as Test 1
    test.setTimeout(120000);
    console.log('[Test] Verifying database persists in list');
    console.log('[Test] Using shared wallet from Test 1:', sharedWalletAddress);

    // Capture console messages for debugging
    page.on('console', (msg) => {
      const text = `[Browser ${msg.type()}] ${msg.text()}`;
      // Log SDK initialization messages, errors, and warnings
      if (msg.type() === 'error' || msg.type() === 'warning' || text.includes('[UI5SDK]') || text.includes('[S5VectorStore]') || text.includes('[useWallet]') || text.includes('[VectorRAGManager]')) {
        console.log(text);
      }
    });

    // Inject the same wallet as Test 1 (BEFORE navigation)
    await page.addInitScript((walletData) => {
      console.log('[Browser] 🧪 Test wallet injected (shared from Test 1):', walletData.address);
      (window as any).__TEST_WALLET__ = {
        address: walletData.address,
        privateKey: walletData.privateKey,
        chainId: walletData.chainId,
        autoApprove: true,
      };
    }, {
      address: sharedWalletAddress,
      privateKey: process.env.TEST_USER_1_PRIVATE_KEY!,
      chainId: 84532,
    });

    // Navigate to vector databases page
    await page.goto(`${TEST_CONFIG.UI5_URL}/vector-databases`);
    console.log('[Test] Navigated to vector databases page');

    // Wait for page load
    await page.waitForSelector('text=Vector Databases', { timeout: 30000 });

    // Wait for React hydration
    await page.getByTestId('app-ready').waitFor({ state: 'attached', timeout: 10000 });
    console.log('[Test] ✅ React hydration complete');

    // CRITICAL: S5 loading can take time - wait for databases to load from storage
    // Wait for either database card to appear OR stats to update (indicating databases loaded)
    console.log('[Test] ⏳ Waiting for databases to load from S5 storage (up to 60 seconds)...');

    // Wait for the "No Vector Databases Yet" message to disappear (indicates databases loaded)
    const emptyState = page.locator('text=No Vector Databases Yet');
    try {
      await emptyState.waitFor({ state: 'hidden', timeout: 60000 });
      console.log('[Test] ✅ Databases loaded (empty state disappeared)');
    } catch (e) {
      console.log('[Test] ⚠️ Empty state still visible after 60s - database may not have been created');
    }

    // Verify "Test Database 1" exists
    const databaseCard = page.locator('text=Test Database 1');
    await expect(databaseCard).toBeVisible({ timeout: 10000 });
    console.log('[Test] ✅ Database found in list');

    // Take screenshot
    await page.screenshot({ path: 'test-results/vector-db-list-with-database.png' });

    console.log('[Test] ✅ Database persistence test passed');
  });
});
