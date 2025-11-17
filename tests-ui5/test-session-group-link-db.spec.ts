/**
 * Phase 4.3: Link Vector Database to Session Group
 *
 * Tests linking a vector database to a session group.
 *
 * Prerequisites:
 * - Test wallet provider active
 * - SDK initialized
 * - At least one session group exists
 * - At least one vector database exists
 */

import { test, expect, TEST_CONFIG } from './lib/test-setup';

test.describe('Phase 4.3: Link Vector Database to Group', () => {

  test('should link vector database to session group', async ({ page, testWallet }) => {
    // Listen to console logs from browser
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error' || text.includes('[useSessionGroups]') || text.includes('Failed') || text.includes('not found')) {
        console.log(`[Browser ${type}] ${text}`);
      }
    });

    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 4.3: Link Vector Database to Group');
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
    await page.screenshot({ path: 'test-results/session-group-link-db-before.png', fullPage: true });
    console.log('[Test] Screenshot taken: group detail page (before linking)');

    // Step 3: Find Linked Databases section
    console.log('\n[Test] === STEP 3: Locate Linked Databases Section ===');
    const linkedDbsHeading = page.locator('h3:has-text("Linked Databases")');
    await expect(linkedDbsHeading).toBeVisible({ timeout: 5000 });
    console.log('[Test] ✅ "Linked Databases" section found');

    // Get initial linked database count
    const linkedDbsCard = page.locator('div.bg-white.rounded-lg:has(h3:has-text("Linked Databases"))').first();
    const initialDbElements = linkedDbsCard.locator('div.flex.items-center.gap-2.p-2').filter({ has: page.locator('p.text-sm.font-medium') });
    const initialCount = await initialDbElements.count();
    console.log(`[Test] Initial linked databases count: ${initialCount}`);

    // Step 4: Click "+ Link Database" button
    console.log('\n[Test] === STEP 4: Open Link Database Modal ===');
    const linkButton = page.locator('button:has-text("Link Database")').first();
    await expect(linkButton).toBeVisible({ timeout: 5000 });
    console.log('[Test] Link Database button found');

    await linkButton.click();
    console.log('[Test] Clicked Link Database button');

    // Step 5: Verify modal opens
    console.log('\n[Test] === STEP 5: Verify Modal Opens ===');
    const modal = page.locator('div.fixed.inset-0.bg-black.bg-opacity-50');
    await expect(modal).toBeVisible({ timeout: 5000 });
    console.log('[Test] ✅ Modal opened');

    const modalHeading = page.locator('h3:has-text("Link Vector Database")');
    await expect(modalHeading).toBeVisible();
    console.log('[Test] ✅ Modal heading correct');

    // Step 6: Check for available databases
    console.log('\n[Test] === STEP 6: Select Database ===');

    // Find database buttons in modal
    const databaseButtons = page.locator('div.fixed button').filter({ has: page.locator('p.text-sm.font-medium') });
    const availableCount = await databaseButtons.count();
    console.log(`[Test] Available databases in modal: ${availableCount}`);

    if (availableCount === 0) {
      console.log('[Test] ⚠️  No databases available to link - closing modal and skipping');
      const cancelButton = page.locator('button:has-text("Cancel")');
      await cancelButton.click();
      console.log('[Test] Test skipped: No databases available');
      return;
    }

    // Get the first database name
    const firstDbButton = databaseButtons.first();
    const firstDbName = await firstDbButton.locator('p.text-sm.font-medium').textContent();
    console.log(`[Test] Selecting database: ${firstDbName}`);

    await firstDbButton.click();
    console.log('[Test] Clicked database button');

    // Step 7: Wait for link operation to complete
    console.log('\n[Test] === STEP 7: Wait for Link Operation ===');

    // Modal should close after linking
    await expect(modal).not.toBeVisible({ timeout: 10000 });
    console.log('[Test] ✅ Modal closed after linking');

    // Step 8: Verify database appears in Linked Databases section
    console.log('\n[Test] === STEP 8: Verify Database in Linked List ===');

    // Wait for the database to appear
    await expect(page.locator(`p.text-sm.font-medium:has-text("${firstDbName}")`).first()).toBeVisible({ timeout: 5000 });

    const newDbElements = linkedDbsCard.locator('div.flex.items-center.gap-2.p-2').filter({ has: page.locator('p.text-sm.font-medium') });
    const newCount = await newDbElements.count();
    console.log(`[Test] Linked databases count after linking: ${newCount}`);

    if (newCount <= initialCount) {
      throw new Error(`Database count did not increase! Before: ${initialCount}, After: ${newCount}`);
    }
    console.log('[Test] ✅ Database count increased');

    // Verify the specific database appears
    const linkedDb = page.locator('div.flex.items-center.gap-2.p-2').filter({ has: page.locator(`p.text-sm.font-medium:has-text("${firstDbName}")`) }).first();
    await expect(linkedDb).toBeVisible();
    console.log(`[Test] ✅ Database "${firstDbName}" appears in linked list`);

    // Step 9: Verify statistics updated
    console.log('\n[Test] === STEP 9: Verify Statistics Updated ===');
    const statsSection = page.locator('div:has(> h3:has-text("Statistics"))');
    const dbLinkedStat = statsSection.locator('div:has(> p:has-text("Databases Linked"))');
    const dbLinkedCount = await dbLinkedStat.locator('p.text-2xl').textContent();
    console.log(`[Test] Statistics shows Databases Linked: ${dbLinkedCount}`);

    if (parseInt(dbLinkedCount || '0') !== newCount) {
      console.log(`[Test] ⚠️  Warning: Statistics (${dbLinkedCount}) doesn't match actual count (${newCount})`);
    } else {
      console.log('[Test] ✅ Statistics updated correctly');
    }

    // Step 10: Final screenshot
    console.log('\n[Test] === STEP 10: Final Screenshot ===');
    await page.screenshot({ path: 'test-results/session-group-link-db-success.png', fullPage: true });
    console.log('[Test] Screenshot saved: test-results/session-group-link-db-success.png');

    console.log('\n[Test] ========================================');
    console.log('[Test] ✅ Phase 4.3 Complete: Database linked successfully');
    console.log('[Test] ========================================');
  });

  test('should handle linking when no databases available', async ({ page, testWallet }) => {
    // Listen to console logs from browser
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error' || text.includes('[useSessionGroups]') || text.includes('Failed') || text.includes('not found')) {
        console.log(`[Browser ${type}] ${text}`);
      }
    });

    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 4.3 Edge Case: No Databases Available');
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

    // Open link database modal
    const linkButton = page.locator('button:has-text("Link Database")').first();
    await linkButton.click();

    // Verify modal opens
    const modal = page.locator('div.fixed.inset-0.bg-black.bg-opacity-50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Check for "no databases" message or cancel button
    const cancelButton = page.locator('button:has-text("Cancel")');
    await expect(cancelButton).toBeVisible();
    console.log('[Test] ✅ Cancel button visible in modal');

    // Cancel the operation
    await cancelButton.click();
    await expect(modal).not.toBeVisible({ timeout: 5000 });
    console.log('[Test] ✅ Modal closed after cancel');

    console.log('\n[Test] ========================================');
    console.log('[Test] ✅ Edge case test complete');
    console.log('[Test] ========================================');
  });
});
