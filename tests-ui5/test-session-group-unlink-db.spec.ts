/**
 * Phase 4.4: Unlink Vector Database from Session Group
 *
 * Tests unlinking a vector database from a session group.
 *
 * Prerequisites:
 * - Test wallet provider active
 * - SDK initialized
 * - At least one session group exists with a linked database (from Phase 4.3)
 */

import { test, expect, TEST_CONFIG } from './lib/test-setup';

test.describe('Phase 4.4: Unlink Vector Database from Group', () => {

  test('should unlink vector database from session group', async ({ page, testWallet }) => {
    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 4.4: Unlink Vector Database from Group');
    console.log('[Test] ========================================');

    // Step 1: Navigate to session groups page
    console.log('\n[Test] === STEP 1: Navigate to Session Groups ===');
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    console.log('[Test] Session groups page loaded');

    // Wait for any existing group to appear (from previous tests)
    const groupCards = page.locator('a[href^="/session-groups/sg-"]');
    await expect(groupCards.first()).toBeVisible({ timeout: 10000 });

    // Get the first group and navigate to it
    const firstGroupHref = await groupCards.first().getAttribute('href');
    await page.goto(`http://localhost:3002${firstGroupHref}`);
    await page.waitForLoadState('networkidle');
    console.log('[Test] Navigated to existing group:', `http://localhost:3002${firstGroupHref}`);

    // Step 2: Group Detail Page
    console.log('\n[Test] === STEP 2: Group Detail Page ===');
    await page.screenshot({ path: 'test-results/session-group-unlink-db-before.png', fullPage: true });
    console.log('[Test] Screenshot taken: group detail page (before unlinking)');

    // Step 3: Find Linked Databases section and verify at least one linked database
    console.log('\n[Test] === STEP 3: Verify Linked Database Exists ===');
    const linkedDbsHeading = page.locator('h3:has-text("Linked Databases")');
    await expect(linkedDbsHeading).toBeVisible({ timeout: 5000 });
    console.log('[Test] ✅ "Linked Databases" section found');

    // Get linked databases card
    const linkedDbsCard = page.locator('div.bg-white.rounded-lg:has(h3:has-text("Linked Databases"))').first();

    // Get initial linked database count
    const initialDbElements = linkedDbsCard.locator('div.flex.items-center.gap-2.p-2').filter({ has: page.locator('p.text-sm.font-medium') });
    const initialCount = await initialDbElements.count();
    console.log(`[Test] Initial linked databases count: ${initialCount}`);

    if (initialCount === 0) {
      console.log('[Test] ⚠️  No linked databases found - test cannot proceed');
      console.log('[Test] Run Phase 4.3 (link database) first');
      throw new Error('No linked databases found. Run Phase 4.3 first to link a database.');
    }

    // Get the first linked database name
    const firstLinkedDb = initialDbElements.first();
    const dbNameElement = firstLinkedDb.locator('p.text-sm.font-medium');
    const linkedDbName = await dbNameElement.textContent();
    console.log(`[Test] First linked database: "${linkedDbName}"`);

    // Step 4: Hover over the database to reveal unlink button
    console.log('\n[Test] === STEP 4: Hover to Reveal Unlink Button ===');
    await firstLinkedDb.hover();
    console.log('[Test] Hovered over linked database');

    // Find the unlink button (X icon with title="Unlink database")
    const unlinkButton = firstLinkedDb.locator('button[title="Unlink database"]');
    await expect(unlinkButton).toBeVisible({ timeout: 2000 });
    console.log('[Test] ✅ Unlink button visible on hover');

    // Step 5: Set up dialog handler and click unlink button
    console.log('\n[Test] === STEP 5: Click Unlink Button and Confirm ===');

    // Listen for dialog and accept it
    page.once('dialog', async dialog => {
      console.log(`[Test] Dialog appeared: ${dialog.message()}`);
      expect(dialog.message()).toContain(`Unlink database "${linkedDbName}"`);
      await dialog.accept();
      console.log('[Test] ✅ Confirmed unlink operation');
    });

    // Click unlink button
    await unlinkButton.click();
    console.log('[Test] Clicked unlink button');

    // Step 6: Wait for unlink operation to complete
    console.log('\n[Test] === STEP 6: Wait for Unlink Operation ===');

    // Wait for the database to disappear from the list
    await page.waitForTimeout(2000); // Brief wait for UI update
    console.log('[Test] Waited for unlink operation');

    // Step 7: Verify database removed from Linked Databases section
    console.log('\n[Test] === STEP 7: Verify Database Removed ===');

    // Get new linked database count
    const newDbElements = linkedDbsCard.locator('div.flex.items-center.gap-2.p-2').filter({ has: page.locator('p.text-sm.font-medium') });
    const newCount = await newDbElements.count();
    console.log(`[Test] Linked databases count after unlinking: ${newCount}`);

    if (newCount >= initialCount) {
      throw new Error(`Database count did not decrease! Before: ${initialCount}, After: ${newCount}`);
    }
    console.log('[Test] ✅ Database count decreased');

    // Verify the specific database no longer appears
    const removedDb = page.locator('div.flex.items-center.gap-2.p-2').filter({ has: page.locator(`p.text-sm.font-medium:has-text("${linkedDbName}")`) });
    await expect(removedDb).toHaveCount(0, { timeout: 5000 });
    console.log(`[Test] ✅ Database "${linkedDbName}" removed from linked list`);

    // Step 8: Verify statistics updated
    console.log('\n[Test] === STEP 8: Verify Statistics Updated ===');
    const statsSection = page.locator('div:has(> h3:has-text("Statistics"))');
    const dbLinkedStat = statsSection.locator('div:has(> p:has-text("Databases Linked"))');
    const dbLinkedCount = await dbLinkedStat.locator('p.text-2xl').textContent();
    console.log(`[Test] Statistics shows Databases Linked: ${dbLinkedCount}`);

    if (parseInt(dbLinkedCount || '0') !== newCount) {
      console.log(`[Test] ⚠️  Warning: Statistics (${dbLinkedCount}) doesn't match actual count (${newCount})`);
    } else {
      console.log('[Test] ✅ Statistics updated correctly');
    }

    // Step 9: Final screenshot
    console.log('\n[Test] === STEP 9: Final Screenshot ===');
    await page.screenshot({ path: 'test-results/session-group-unlink-db-success.png', fullPage: true });
    console.log('[Test] Screenshot saved: test-results/session-group-unlink-db-success.png');

    console.log('\n[Test] ========================================');
    console.log('[Test] ✅ Phase 4.4 Complete: Database unlinked successfully');
    console.log('[Test] ========================================');
  });

  test('should handle unlinking the last database', async ({ page, testWallet }) => {
    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 4.4 Edge Case: Unlink Last Database');
    console.log('[Test] ========================================');

    // Navigate to session group
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');

    const groupCards = page.locator('a[href^="/session-groups/sg-"]');
    await expect(groupCards.first()).toBeVisible({ timeout: 10000 });

    const firstGroupHref = await groupCards.first().getAttribute('href');
    await page.goto(`http://localhost:3002${firstGroupHref}`);
    await page.waitForLoadState('networkidle');
    console.log('[Test] Navigated to session group');

    // Find linked databases
    const linkedDbsCard = page.locator('div.bg-white.rounded-lg:has(h3:has-text("Linked Databases"))').first();
    const dbElements = linkedDbsCard.locator('div.flex.items-center.gap-2.p-2').filter({ has: page.locator('p.text-sm.font-medium') });
    const count = await dbElements.count();

    console.log(`[Test] Found ${count} linked database(s)`);

    if (count === 0) {
      console.log('[Test] No databases to unlink - test complete');
      return;
    }

    // Unlink all databases
    for (let i = 0; i < count; i++) {
      console.log(`[Test] Unlinking database ${i + 1}/${count}...`);

      // Get the first database (always first since we're removing them)
      const firstDb = linkedDbsCard.locator('div.flex.items-center.gap-2.p-2').filter({ has: page.locator('p.text-sm.font-medium') }).first();

      // Hover and click unlink
      await firstDb.hover();
      const unlinkButton = firstDb.locator('button[title="Unlink database"]');

      // Handle dialog
      page.once('dialog', async dialog => {
        await dialog.accept();
      });

      await unlinkButton.click();
      await page.waitForTimeout(1500); // Wait for operation
    }

    // Verify all databases removed
    const finalCount = await dbElements.count();
    expect(finalCount).toBe(0);
    console.log('[Test] ✅ All databases unlinked');

    // Verify statistics show 0
    const statsSection = page.locator('div:has(> h3:has-text("Statistics"))');
    const dbLinkedStat = statsSection.locator('div:has(> p:has-text("Databases Linked"))');
    const dbLinkedCount = await dbLinkedStat.locator('p.text-2xl').textContent();
    expect(dbLinkedCount).toBe('0');
    console.log('[Test] ✅ Statistics updated to 0');

    console.log('\n[Test] ========================================');
    console.log('[Test] ✅ Edge case test complete');
    console.log('[Test] ========================================');
  });
});
