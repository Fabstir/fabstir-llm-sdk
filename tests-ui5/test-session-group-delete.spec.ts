/**
 * Phase 4.5: Delete Session Group
 *
 * Tests session group deletion with real blockchain transactions and S5 persistence.
 *
 * Prerequisites:
 * - UI5 server running on port 3002
 * - Test wallet auto-connected (TEST_USER_1_PRIVATE_KEY)
 * - Existing session groups to delete (created by Phase 4.1-4.4 tests)
 *
 * Expected Duration: 15-30 seconds (blockchain confirmation)
 */

import { test, expect, TEST_CONFIG } from './lib/test-setup';

test.describe('Phase 4.5: Delete Session Group', () => {

  test('should delete session group and verify removal from list', async ({ page, testWallet }) => {
    // Increase timeout for blockchain transactions
    test.setTimeout(90000); // 90 seconds

    console.log('[Test] ========================================');
    console.log('[Test] Phase 4.5: Delete Session Group');
    console.log('[Test] ========================================');

    // Step 1: Navigate to session groups page
    console.log('\n[Test] === STEP 1: Navigate to Session Groups ===');
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    console.log('[Test] Session groups page loaded');

    await page.waitForTimeout(2000);

    // Step 2: Take screenshot before deletion
    console.log('\n[Test] === STEP 2: Screenshot Before Deletion ===');
    await page.screenshot({
      path: 'test-results/session-group-delete-before.png',
      fullPage: true
    });
    console.log('[Test] Screenshot taken: before deletion');

    // Step 3: Count initial session groups
    console.log('\n[Test] === STEP 3: Count Initial Session Groups ===');
    const groupCards = page.locator('a[href^="/session-groups/sg-"]');
    const initialCount = await groupCards.count();
    console.log(`[Test] Initial session groups count: ${initialCount}`);

    if (initialCount === 0) {
      console.log('[Test] ⚠️  No session groups found - test cannot proceed');
      console.log('[Test] Run Phase 4.1 (create session group) first');
      throw new Error('No session groups found. Run Phase 4.1 first to create a session group.');
    }

    // Step 4: Get the first group details for verification
    console.log('\n[Test] === STEP 4: Get First Session Group Details ===');
    const firstGroup = groupCards.first();
    const groupNameElement = firstGroup.locator('h3.text-lg.font-semibold');
    const groupName = await groupNameElement.textContent();

    // Get the group ID from href (e.g., /session-groups/sg-123 -> sg-123)
    const groupHref = await firstGroup.getAttribute('href');
    const groupId = groupHref?.split('/').pop() || '';
    console.log(`[Test] First session group: "${groupName}" (ID: ${groupId})`);

    // Step 5: Find and click delete button
    console.log('\n[Test] === STEP 5: Click Delete Button ===');
    // Use the same selector as we use for counting (the card link)
    const deleteButton = firstGroup.locator('button:has-text("Delete")');

    await expect(deleteButton).toBeVisible({ timeout: 5000 });
    console.log('[Test] Delete button found');

    // Step 6: Handle confirmation dialog
    console.log('\n[Test] === STEP 6: Handle Confirmation Dialog ===');

    // Set up dialog handler BEFORE clicking the button
    page.once('dialog', async dialog => {
      console.log(`[Test] Dialog appeared: ${dialog.message()}`);

      // Verify the dialog message mentions the group name and sessions warning
      expect(dialog.message()).toContain(`Delete "${groupName}"`);
      expect(dialog.message()).toContain('This will delete all chat sessions');

      console.log('[Test] ✅ Confirmed deletion');
      await dialog.accept();
    });

    await deleteButton.click();
    console.log('[Test] Clicked delete button');

    // Step 7: Wait for deletion operation
    console.log('\n[Test] === STEP 7: Wait for Deletion Operation ===');
    await page.waitForTimeout(3000); // Wait for deletion to complete
    console.log('[Test] Waited for deletion operation');

    // Step 8: Verify group count decreased
    console.log('\n[Test] === STEP 8: Verify Group Removed ===');

    // Refresh to ensure we're seeing the updated state
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const groupCardsAfter = page.locator('a[href^="/session-groups/sg-"]');
    const newCount = await groupCardsAfter.count();
    console.log(`[Test] Session groups count after deletion: ${newCount}`);

    if (newCount >= initialCount) {
      throw new Error(`Session group count did not decrease! Before: ${initialCount}, After: ${newCount}`);
    }
    console.log('[Test] ✅ Session group count decreased');

    // Step 9: Verify deleted group no longer appears
    console.log('\n[Test] === STEP 9: Verify Deleted Group Not in List ===');

    if (newCount > 0) {
      // Check that the specific deleted group ID doesn't appear
      const remainingGroupHrefs = await groupCardsAfter.evaluateAll(links =>
        links.map(link => link.getAttribute('href'))
      );
      const deletedGroupStillExists = remainingGroupHrefs.some(href => href?.includes(groupId));

      if (deletedGroupStillExists) {
        throw new Error(`Deleted group "${groupName}" (${groupId}) still appears in the list!`);
      }
      console.log(`[Test] ✅ Deleted group "${groupName}" (${groupId}) removed from list`);
    } else {
      console.log('[Test] ✅ All session groups deleted (empty state)');
    }

    // Step 10: Final screenshot
    console.log('\n[Test] === STEP 10: Final Screenshot ===');
    await page.screenshot({
      path: 'test-results/session-group-delete-success.png',
      fullPage: true
    });
    console.log('[Test] Screenshot saved: test-results/session-group-delete-success.png');

    console.log('\n[Test] ========================================');
    console.log('[Test] ✅ Phase 4.5 Complete: Session group deleted successfully');
    console.log('[Test] ========================================');
  });

  test('should handle deleting the last session group (empty state)', async ({ page, testWallet }) => {
    test.setTimeout(90000);

    console.log('[Test] ========================================');
    console.log('[Test] Phase 4.5 Edge Case: Delete Last Session Group');
    console.log('[Test] ========================================');

    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    console.log('[Test] Navigated to session groups');

    await page.waitForTimeout(2000);

    const groupCards = page.locator('a[href^="/session-groups/sg-"]');
    const count = await groupCards.count();
    console.log(`[Test] Found ${count} session group(s)`);

    if (count === 0) {
      console.log('[Test] No session groups to delete - test complete');
      return;
    }

    // If there's exactly one group, delete it and verify empty state
    if (count === 1) {
      const firstGroup = groupCards.first();
      const deleteButton = firstGroup.locator('button:has-text("Delete")');
      const groupNameElement = firstGroup.locator('h3.text-lg.font-semibold');
      const groupName = await groupNameElement.textContent();

      page.once('dialog', dialog => dialog.accept());
      await deleteButton.click();
      console.log(`[Test] Deleted last session group: "${groupName}"`);

      await page.waitForTimeout(3000);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const groupCardsAfter = page.locator('a[href^="/session-groups/sg-"]');
      const newCount = await groupCardsAfter.count();

      if (newCount !== 0) {
        throw new Error(`Expected 0 groups after deleting last one, but found ${newCount}`);
      }

      console.log('[Test] ✅ Last session group deleted - empty state verified');
    } else {
      console.log('[Test] Multiple session groups exist - skipping empty state test');
    }
  });
});
