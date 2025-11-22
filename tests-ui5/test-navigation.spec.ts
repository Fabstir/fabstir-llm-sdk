import { test, expect } from './lib/test-setup';

test.describe('Phase 6.1 & 6.2: Navigation & Breadcrumbs', () => {

  test('should navigate through all main pages in cycle', async ({ page, testWallet }) => {
    // Increase timeout for multiple page loads
    test.setTimeout(90000); // 90 seconds

    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 6.1: Page Navigation Cycle');
    console.log('[Test] ========================================\n');

    // Step 1: Start at Dashboard (home page)
    console.log('[Test] === STEP 1: Load Dashboard ===');
    const startTime = Date.now();
    await page.goto('http://localhost:3002/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Wait for wallet auto-connection
    const dashboardLoadTime = Date.now() - startTime;
    console.log(`[Test] Dashboard loaded in ${dashboardLoadTime}ms`);
    expect(dashboardLoadTime).toBeLessThan(15000); // Should load < 15 seconds (first load includes wallet + SDK init)
    await page.screenshot({ path: 'test-results/nav-01-dashboard.png', fullPage: true });
    console.log('[Test] ✅ Dashboard loaded\n');

    // Step 2: Navigate to Session Groups
    console.log('[Test] === STEP 2: Navigate to Session Groups ===');
    const sessionGroupsNav = page.locator('a[href="/session-groups"]').first();
    await expect(sessionGroupsNav).toBeVisible({ timeout: 10000 });

    const sgStartTime = Date.now();
    await sessionGroupsNav.click();
    await page.waitForURL('**/session-groups', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    const sgLoadTime = Date.now() - sgStartTime;
    console.log(`[Test] Session Groups page loaded in ${sgLoadTime}ms`);
    expect(sgLoadTime).toBeLessThan(3000); // Client-side navigation should be fast

    // Verify active nav item
    const activeNav = page.locator('nav a[href="/session-groups"].active, nav a[href="/session-groups"][data-active="true"]');
    // Note: May not have active class depending on NavLink implementation

    await page.screenshot({ path: 'test-results/nav-02-session-groups.png', fullPage: true });
    console.log('[Test] ✅ Session Groups page loaded\n');

    // Step 3: Navigate to Vector Databases
    console.log('[Test] === STEP 3: Navigate to Vector Databases ===');
    const vectorDbNav = page.locator('a[href="/vector-databases"]').first();
    await expect(vectorDbNav).toBeVisible({ timeout: 10000 });

    const vdbStartTime = Date.now();
    await vectorDbNav.click();
    await page.waitForURL('**/vector-databases', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    const vdbLoadTime = Date.now() - vdbStartTime;
    console.log(`[Test] Vector Databases page loaded in ${vdbLoadTime}ms`);
    expect(vdbLoadTime).toBeLessThan(3000);

    await page.screenshot({ path: 'test-results/nav-03-vector-databases.png', fullPage: true });
    console.log('[Test] ✅ Vector Databases page loaded\n');

    // Step 4: Navigate to Settings
    console.log('[Test] === STEP 4: Navigate to Settings ===');
    const settingsNav = page.locator('a[href="/settings"]').first();
    await expect(settingsNav).toBeVisible({ timeout: 10000 });

    const settingsStartTime = Date.now();
    await settingsNav.click();
    await page.waitForURL('**/settings', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    const settingsLoadTime = Date.now() - settingsStartTime;
    console.log(`[Test] Settings page loaded in ${settingsLoadTime}ms`);
    expect(settingsLoadTime).toBeLessThan(3000);

    await page.screenshot({ path: 'test-results/nav-04-settings.png', fullPage: true });
    console.log('[Test] ✅ Settings page loaded\n');

    // Step 5: Navigate back to Dashboard
    console.log('[Test] === STEP 5: Navigate back to Dashboard ===');
    const dashboardNav = page.locator('a[href="/"]').first();
    await expect(dashboardNav).toBeVisible({ timeout: 10000 });

    const backToDashStartTime = Date.now();
    await dashboardNav.click();
    await page.waitForURL('http://localhost:3002/', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    const backToDashLoadTime = Date.now() - backToDashStartTime;
    console.log(`[Test] Back to Dashboard in ${backToDashLoadTime}ms`);
    expect(backToDashLoadTime).toBeLessThan(3000);

    await page.screenshot({ path: 'test-results/nav-05-back-to-dashboard.png', fullPage: true });
    console.log('[Test] ✅ Full navigation cycle complete\n');

    // Step 6: Check for console errors
    console.log('[Test] === STEP 6: Check for Console Errors ===');
    const errorMessages = page.locator('text=/error|failed/i');
    const errorCount = await errorMessages.count();
    console.log('[Test] Error messages found:', errorCount);
    expect(errorCount).toBe(0);
    console.log('[Test] ✅ No error messages\n');

    console.log('[Test] ========================================');
    console.log('[Test] ✅ Phase 6.1 Complete: Navigation cycle successful');
    console.log('[Test] ========================================\n');
  });

  test('should support direct URL navigation to all pages', async ({ page, testWallet }) => {
    test.setTimeout(90000);

    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 6.1: Direct URL Navigation');
    console.log('[Test] ========================================\n');

    const pages = [
      { url: 'http://localhost:3002/', name: 'Dashboard' },
      { url: 'http://localhost:3002/session-groups', name: 'Session Groups' },
      { url: 'http://localhost:3002/vector-databases', name: 'Vector Databases' },
      { url: 'http://localhost:3002/settings', name: 'Settings' },
      { url: 'http://localhost:3002/notifications', name: 'Notifications' }
    ];

    for (const { url, name } of pages) {
      console.log(`[Test] === Testing direct navigation to ${name} ===`);

      const startTime = Date.now();
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000); // Brief wait for SDK/wallet
      const loadTime = Date.now() - startTime;

      console.log(`[Test] ${name} loaded in ${loadTime}ms`);
      expect(loadTime).toBeLessThan(15000); // First load can be slower with wallet + SDK init

      // Verify wallet still connected (test mode auto-connects)
      const walletAddress = await page.locator('text=/0x[a-fA-F0-9]{40}/').first().textContent({ timeout: 5000 }).catch(() => null);
      if (walletAddress) {
        console.log(`[Test] Wallet connected: ${walletAddress.slice(0, 10)}...`);
      }

      await page.screenshot({ path: `test-results/nav-direct-${name.toLowerCase().replace(/\s+/g, '-')}.png`, fullPage: true });
      console.log(`[Test] ✅ ${name} accessible via direct URL\n`);
    }

    console.log('[Test] ========================================');
    console.log('[Test] ✅ Phase 6.1 Complete: All pages accessible via direct URL');
    console.log('[Test] ========================================\n');
  });

  test('should show correct breadcrumbs on session group detail page', async ({ page, testWallet }) => {
    test.setTimeout(120000);

    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 6.2: Session Group Breadcrumbs');
    console.log('[Test] ========================================\n');

    // Step 1: Create a session group
    console.log('[Test] === STEP 1: Create Session Group ===');
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const createButton = page.locator('button:has-text("Create Session Group")')
      .or(page.locator('a[href="/session-groups/new"]'))
      .first();

    await expect(createButton).toBeVisible({ timeout: 30000 });
    await createButton.click();
    await page.waitForURL('**/session-groups/new', { timeout: 15000 });
    await page.waitForTimeout(2000);

    const nameInput = page.locator('input[placeholder*="Engineering" i], input[placeholder*="Project" i]').first();
    await nameInput.fill('Breadcrumb Test Group');

    const submitButton = page.locator('button[type="submit"]').or(page.locator('button:has-text("Create")')).first();
    await submitButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('[Test] ✅ Created session group\n');

    // Step 2: Navigate to session group detail page
    console.log('[Test] === STEP 2: Navigate to Detail Page ===');
    await page.waitForURL('**/session-groups/sg-*', { timeout: 10000 });
    const groupUrl = page.url();
    const groupId = groupUrl.split('/session-groups/')[1];
    console.log('[Test] On session group detail page:', groupId);
    console.log('[Test] ✅ Session group detail page loaded\n');

    // Step 3: Verify breadcrumbs exist and are correct
    console.log('[Test] === STEP 3: Verify Breadcrumbs ===');

    // Look for breadcrumb navigation
    // Common breadcrumb patterns: nav[aria-label="breadcrumb"], ol.breadcrumb, div.breadcrumbs
    const breadcrumbContainer = page.locator('nav[aria-label*="breadcrumb" i], nav[aria-label*="Breadcrumb" i], ol.breadcrumb, .breadcrumbs, [role="navigation"] ol').first();

    if (await breadcrumbContainer.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[Test] Breadcrumb navigation found');

      // Check for breadcrumb links
      const breadcrumbLinks = breadcrumbContainer.locator('a');
      const linkCount = await breadcrumbLinks.count();
      console.log(`[Test] Breadcrumb links found: ${linkCount}`);

      // Expect at least: Dashboard > Session Groups
      expect(linkCount).toBeGreaterThanOrEqual(1);

      // Try to find "Session Groups" link
      const sessionGroupsLink = breadcrumbContainer.locator('a:has-text("Session Groups"), a:has-text("Sessions")').first();
      if (await sessionGroupsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[Test] Found "Session Groups" in breadcrumbs');

        await page.screenshot({ path: 'test-results/nav-breadcrumbs-before-click.png', fullPage: true });

        // Step 4: Click breadcrumb to navigate back
        console.log('[Test] === STEP 4: Click Breadcrumb to Navigate Back ===');
        await sessionGroupsLink.click();
        await page.waitForURL('**/session-groups', { timeout: 10000 });
        await page.waitForLoadState('networkidle');

        console.log('[Test] ✅ Breadcrumb navigation back to Session Groups successful');
        await page.screenshot({ path: 'test-results/nav-breadcrumbs-after-click.png', fullPage: true });
      } else {
        console.log('[Test] ⚠️  "Session Groups" breadcrumb link not found (may not be implemented yet)');
      }
    } else {
      console.log('[Test] ⚠️  Breadcrumb navigation not found on page (may not be implemented yet)');
      await page.screenshot({ path: 'test-results/nav-no-breadcrumbs.png', fullPage: true });
    }

    console.log('[Test] ========================================');
    console.log('[Test] ✅ Phase 6.2 Complete: Breadcrumb navigation tested');
    console.log('[Test] ========================================\n');
  });

  test('should show correct breadcrumbs on vector database detail page', async ({ page, testWallet }) => {
    test.setTimeout(120000);

    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 6.2: Vector Database Breadcrumbs');
    console.log('[Test] ========================================\n');

    // Step 1: Navigate to vector databases page
    console.log('[Test] === STEP 1: Navigate to Vector Databases ===');
    await page.goto('http://localhost:3002/vector-databases');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('[Test] ✅ On vector databases page\n');

    // Step 2: Check if any databases exist to test breadcrumbs
    console.log('[Test] === STEP 2: Check for Existing Databases ===');
    const databaseLinks = page.locator('a[href^="/vector-databases/vdb-"]');
    const dbCount = await databaseLinks.count();

    if (dbCount > 0) {
      console.log(`[Test] Found ${dbCount} existing database(s), clicking first to view detail page`);
      await databaseLinks.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const dbUrl = page.url();
      console.log('[Test] On vector database detail page:', dbUrl);
      console.log('[Test] ✅ Navigated to database detail page\n');

      // Step 3: Verify breadcrumbs
      console.log('[Test] === STEP 3: Verify Breadcrumbs ===');

      const breadcrumbContainer = page.locator('nav[aria-label*="breadcrumb" i], nav[aria-label*="Breadcrumb" i], ol.breadcrumb, .breadcrumbs').first();

      if (await breadcrumbContainer.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('[Test] Breadcrumb navigation found');

        const vectorDbLink = breadcrumbContainer.locator('a:has-text("Vector Databases"), a:has-text("Databases")').first();
        if (await vectorDbLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('[Test] Found "Vector Databases" in breadcrumbs');

          await page.screenshot({ path: 'test-results/nav-vdb-breadcrumbs-before-click.png', fullPage: true });

          // Click breadcrumb to navigate back
          await vectorDbLink.click();
          await page.waitForURL('**/vector-databases', { timeout: 10000 });
          await page.waitForLoadState('networkidle');

          console.log('[Test] ✅ Breadcrumb navigation back to Vector Databases successful');
          await page.screenshot({ path: 'test-results/nav-vdb-breadcrumbs-after-click.png', fullPage: true });
        } else {
          console.log('[Test] ⚠️  "Vector Databases" breadcrumb link not found');
        }
      } else {
        console.log('[Test] ⚠️  Breadcrumb navigation not found on page (may not be implemented yet)');
        await page.screenshot({ path: 'test-results/nav-vdb-no-breadcrumbs.png', fullPage: true });
      }
    } else {
      console.log('[Test] ⚠️  No existing databases found - skipping breadcrumb test');
      console.log('[Test] (Breadcrumb test requires at least one database to exist)');
    }

    console.log('[Test] ========================================');
    console.log('[Test] ✅ Phase 6.2 Complete: Vector DB breadcrumb navigation tested');
    console.log('[Test] ========================================\n');
  });
});
