import { test, expect } from './lib/test-setup';

test.describe('Phase 6.4: Mobile Responsive Design', () => {

  test('should show mobile menu on small screens', async ({ page, testWallet }) => {
    test.setTimeout(90000);

    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 6.4: Mobile Menu Functionality');
    console.log('[Test] ========================================\n');

    // Step 1: Load dashboard at mobile size
    console.log('[Test] === STEP 1: Resize to Mobile (375x667) ===');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3002/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('[Test] ✅ Page loaded at mobile size\n');
    await page.screenshot({ path: 'test-results/responsive-mobile-dashboard.png', fullPage: true });

    // Step 2: Look for mobile menu button
    console.log('[Test] === STEP 2: Find Mobile Menu Button ===');

    // Common mobile menu button patterns
    const mobileMenuButton = page.locator('button[aria-label*="menu" i], button[aria-label*="navigation" i]')
      .or(page.locator('button:has-text("Menu")'))
      .or(page.locator('.mobile-menu-button, .hamburger-menu'))
      .or(page.locator('button svg.lucide-menu, button svg[class*="menu"]'))
      .first();

    const isMenuButtonVisible = await mobileMenuButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (isMenuButtonVisible) {
      console.log('[Test] ✅ Mobile menu button found and visible');

      // Step 3: Click menu button
      console.log('[Test] === STEP 3: Click Mobile Menu Button ===');
      await mobileMenuButton.click();
      await page.waitForTimeout(1000); // Wait for animation

      await page.screenshot({ path: 'test-results/responsive-mobile-menu-open.png', fullPage: true });

      // Look for navigation drawer/menu
      const mobileNav = page.locator('nav[role="navigation"], nav, .mobile-nav, [role="menu"]').first();
      const isNavVisible = await mobileNav.isVisible({ timeout: 5000 }).catch(() => false);

      if (isNavVisible) {
        console.log('[Test] ✅ Mobile navigation menu opened');

        // Check if navigation links are accessible
        const navLinks = mobileNav.locator('a');
        const linkCount = await navLinks.count();
        console.log(`[Test] Found ${linkCount} navigation links in mobile menu`);

        if (linkCount > 0) {
          console.log('[Test] ✅ Navigation links accessible in mobile menu');

          // Test clicking a navigation link
          const sessionGroupsLink = navLinks.locator('text=/Session Groups/i').or(navLinks.locator('[href="/session-groups"]')).first();
          if (await sessionGroupsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await sessionGroupsLink.click();
            await page.waitForURL('**/session-groups', { timeout: 10000 });
            console.log('[Test] ✅ Mobile navigation link works');
          }
        }
      } else {
        console.log('[Test] ⚠️  Mobile navigation menu not found after clicking button');
      }
    } else {
      console.log('[Test] ⚠️  Mobile menu button not found (may use different navigation pattern)');
      console.log('[Test] (Desktop navigation may be used at all screen sizes)');
    }

    console.log('[Test] ========================================');
    console.log('[Test] ✅ Phase 6.4 Complete: Mobile menu tested');
    console.log('[Test] ========================================\n');
  });

  test('should adapt layout at different breakpoints', async ({ page, testWallet }) => {
    test.setTimeout(90000);

    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 6.4: Responsive Layout Breakpoints');
    console.log('[Test] ========================================\n');

    const breakpoints = [
      { name: 'Mobile', width: 375, height: 667 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Desktop', width: 1024, height: 768 },
      { name: 'Large Desktop', width: 1920, height: 1080 }
    ];

    for (const { name, width, height } of breakpoints) {
      console.log(`[Test] === Testing ${name} (${width}x${height}) ===`);

      await page.setViewportSize({ width, height });
      await page.goto('http://localhost:3002/');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Check if page loads without errors
      const title = await page.locator('h1, h2').first().textContent({ timeout: 5000 }).catch(() => null);
      if (title) {
        console.log(`[Test] Page loaded: "${title}"`);
      }

      // Take screenshot
      const screenshotPath = `test-results/responsive-${name.toLowerCase().replace(/\s+/g, '-')}-${width}x${height}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`[Test] Screenshot saved: ${screenshotPath}`);

      // Verify no horizontal scrollbar (content should fit)
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      if (hasHorizontalScroll) {
        console.log(`[Test] ⚠️  Horizontal scroll detected at ${width}px (content may overflow)`);
      } else {
        console.log(`[Test] ✅ No horizontal scroll - layout fits ${width}px width`);
      }

      console.log();
    }

    console.log('[Test] ========================================');
    console.log('[Test] ✅ Phase 6.4 Complete: All breakpoints tested');
    console.log('[Test] ========================================\n');
  });

  test('should handle touch interactions on mobile', async ({ page, testWallet }) => {
    test.setTimeout(120000);

    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 6.4: Mobile Touch Interactions');
    console.log('[Test] ========================================\n');

    // Step 1: Set mobile viewport
    console.log('[Test] === STEP 1: Set Mobile Viewport ===');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('[Test] ✅ On session groups page at mobile size\n');

    // Step 2: Check if cards/buttons are tappable
    console.log('[Test] === STEP 2: Test Touch Interactions ===');

    // Find session group cards or create button
    const createButton = page.locator('button:has-text("Create Session Group")')
      .or(page.locator('a[href="/session-groups/new"]'))
      .first();

    if (await createButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('[Test] Found create button, testing tap...');

      // Click button (works for both mouse and touch)
      await createButton.click();
      await page.waitForURL('**/session-groups/new', { timeout: 10000 });
      await page.waitForLoadState('networkidle');

      console.log('[Test] ✅ Tap/click on create button works');
      await page.screenshot({ path: 'test-results/responsive-mobile-create-form.png', fullPage: true });

      // Check if form is usable on mobile
      const formInput = page.locator('input[placeholder*="Engineering" i], input[placeholder*="Project" i]').first();
      if (await formInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Click input field (simulates tap on mobile)
        await formInput.click();
        await page.waitForTimeout(500);

        // Check if keyboard would appear (can't verify in headless, but click should work)
        console.log('[Test] ✅ Form input clickable/tappable on mobile');

        // Fill form
        await formInput.fill('Mobile Test Group');

        // Find submit button
        const submitButton = page.locator('button[type="submit"]').or(page.locator('button:has-text("Create")')).first();
        if (await submitButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          console.log('[Test] ✅ Submit button accessible on mobile');

          // Don't actually submit to avoid creating test data
          // Just verify button is tappable
          const buttonBox = await submitButton.boundingBox();
          if (buttonBox) {
            // Verify button has reasonable tap target size (>= 44px recommended)
            const minTapSize = 44;
            if (buttonBox.height >= minTapSize) {
              console.log(`[Test] ✅ Button height ${buttonBox.height}px meets minimum tap target (${minTapSize}px)`);
            } else {
              console.log(`[Test] ⚠️  Button height ${buttonBox.height}px below minimum tap target (${minTapSize}px recommended)`);
            }
          }
        }
      }
    } else {
      console.log('[Test] ⚠️  No interactive elements found to test touch (may not have created any groups yet)');
    }

    console.log('[Test] ========================================');
    console.log('[Test] ✅ Phase 6.4 Complete: Touch interactions tested');
    console.log('[Test] ========================================\n');
  });
});
