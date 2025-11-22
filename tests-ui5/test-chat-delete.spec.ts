import { test, expect } from './lib/test-setup';

test.describe('Phase 5.5: Delete Chat Session', () => {

  test('should delete chat session and remove from list', async ({ page, testWallet }) => {
    // Increase timeout for blockchain transactions + session creation
    test.setTimeout(120000); // 120 seconds

    // Capture browser console for debugging
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error' ||
          text.includes('Failed to delete') ||
          text.includes('deleteChat') ||
          text.includes('deleteChatSession') ||
          text.includes('SessionGroupManager') ||
          text.includes('handleDeleteSession')) {
        console.log(`[Browser ${msg.type()}]`, text);
      }
    });

    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 5.5: Delete Chat Session');
    console.log('[Test] ========================================\n');

    // Step 1: Create a new session group for this test
    console.log('[Test] === STEP 1: Create Test Session Group ===');
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Wait for wallet auto-connection and page render

    // Try multiple selector patterns for create button (matching test-session-group-create.spec.ts)
    const createButton = page.locator('button:has-text("Create Session Group")')
      .or(page.locator('button:has-text("New Session Group")'))
      .or(page.locator('button:has-text("Create Group")'))
      .or(page.locator('button:has-text("New Group")'))
      .or(page.locator('a[href="/session-groups/new"]'))
      .or(page.locator('button[title*="Create"]'))
      .first();

    await expect(createButton).toBeVisible({ timeout: 30000 });
    await createButton.click();

    // Wait for navigation to create page
    await page.waitForURL('**/session-groups/new', { timeout: 15000 });

    // Wait for form to compile and become visible (Next.js Turbopack can take time)
    await page.waitForTimeout(2000);

    // Wait for the input to be visible
    await page.waitForSelector('input[placeholder*="Engineering" i], input[placeholder*="Project" i]', { timeout: 15000 });

    // Fill in group name
    const nameInput = page.locator('input[placeholder*="Engineering" i], input[placeholder*="Project" i]').first();
    await nameInput.fill('Test Group for Deletion');

    // Submit form
    const submitButton = page.locator('button[type="submit"]').or(page.locator('button:has-text("Create")')).first();
    await submitButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Wait for blockchain transaction

    console.log('[Test] ✅ Created test session group\n');

    // Step 2: Already on session group detail page (auto-navigated after creation)
    console.log('[Test] === STEP 2: Session Group Detail Page ===');

    // Wait for detail page to load
    await page.waitForURL('**/session-groups/sg-*', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Extract group ID from URL
    const groupUrl = page.url();
    const groupId = groupUrl.split('/session-groups/')[1];
    console.log('[Test] On session group detail page:', groupId);
    console.log('[Test] ✅ Session group detail page ready\n');

    // Step 3: Create 2 chat sessions for testing
    console.log('[Test] === STEP 3: Create Test Chat Sessions ===');

    for (let i = 1; i <= 2; i++) {
      const newChatButton = page.locator('button:has-text("New Chat"), button:has-text("Create Chat Session"), button:has-text("+ New Chat")').first();
      await expect(newChatButton).toBeVisible({ timeout: 10000 });
      await newChatButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Navigate back to session group detail
      await page.goto(`http://localhost:3002/session-groups/${groupId}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      console.log(`[Test] Created chat session ${i}/2`);
    }

    console.log('[Test] ✅ Created 2 test chat sessions\n');

    // Step 4: Count sessions before deletion
    console.log('[Test] === STEP 4: Count Sessions Before Deletion ===');
    const sessionLinks = page.locator('a[href*="/sess-"]');
    const currentSessionCount = await sessionLinks.count();
    console.log('[Test] Current session count:', currentSessionCount);
    expect(currentSessionCount).toBe(2);
    console.log('[Test] ✅ Session count verified\n');

    // Step 5: Take screenshot before deletion
    console.log('[Test] === STEP 5: Take Screenshot Before Deletion ===');
    await page.screenshot({ path: 'test-results/chat-before-delete.png', fullPage: true });
    console.log('[Test] Screenshot saved: chat-before-delete.png\n');

    // Step 6: Hover over session to reveal delete button
    console.log('[Test] === STEP 6: Hover Over Session to Reveal Delete Button ===');

    // The delete button has opacity-0 and only shows on group-hover
    // We need to hover over the session link first
    const firstSessionLink = sessionLinks.first();
    console.log('[Test] Hovering over first session to reveal delete button...');
    await firstSessionLink.hover();
    await page.waitForTimeout(500); // Wait for CSS transition

    // Now find the delete button (should be visible after hover)
    const deleteButton = page.locator('button[title="Delete session"]').first();
    await expect(deleteButton).toBeVisible({ timeout: 5000 });
    console.log('[Test] ✅ Delete button is now visible after hover\n');

    // Step 7: Set up dialog handler BEFORE clicking delete button
    console.log('[Test] === STEP 7: Set Up Confirmation Handler ===');

    // Register dialog handler BEFORE clicking (must be before the action that triggers it)
    page.once('dialog', async dialog => {
      console.log('[Test] Browser confirm dialog detected:', dialog.message());
      await dialog.accept();
      console.log('[Test] ✅ Accepted browser confirm dialog');
    });
    console.log('[Test] Dialog handler registered\n');

    // Step 8: Click delete button
    console.log('[Test] === STEP 8: Click Delete Button ===');
    await deleteButton.click();
    await page.waitForTimeout(1000);
    console.log('[Test] ✅ Clicked delete button\n');

    // Wait for deletion to process (SDK save to S5, selectGroup reload, UI refresh)
    await page.waitForTimeout(5000);
    console.log('[Test] ✅ Deletion processing complete\n');

    // Step 10: Verify session removed from list
    console.log('[Test] === STEP 10: Verify Session Removed ===');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000); // Extra time for UI to update after deletion

    const finalSessionCount = await sessionLinks.count();
    console.log('[Test] Final session count:', finalSessionCount);
    console.log('[Test] Expected:', currentSessionCount - 1);

    expect(finalSessionCount).toBe(currentSessionCount - 1);
    console.log('[Test] ✅ Session removed from list\n');

    // Step 11: Take screenshot after deletion
    console.log('[Test] === STEP 11: Take Screenshot After Deletion ===');
    await page.screenshot({ path: 'test-results/chat-after-delete.png', fullPage: true });
    console.log('[Test] Screenshot saved: chat-after-delete.png\n');

    // Step 12: Verify no error messages
    console.log('[Test] === STEP 12: Check for Errors ===');
    const errorMessages = page.locator('text=/error|failed/i');
    const errorCount = await errorMessages.count();
    console.log('[Test] Error messages found:', errorCount);
    expect(errorCount).toBe(0);
    console.log('[Test] ✅ No error messages\n');

    console.log('[Test] ========================================');
    console.log('[Test] ✅ Phase 5.5 Complete: Chat session deleted successfully');
    console.log('[Test] ========================================\n');
  });

  test('should handle deleting last chat session gracefully', async ({ page, testWallet }) => {
    // Increase timeout for blockchain transactions + session creation/deletion
    test.setTimeout(120000); // 120 seconds

    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 5.5 Edge Case: Delete Last Session');
    console.log('[Test] ========================================\n');

    // Step 1: Create a new session group for this test
    console.log('[Test] === STEP 1: Create Test Session Group ===');
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Wait for wallet auto-connection and page render

    // Try multiple selector patterns for create button (matching test-session-group-create.spec.ts)
    const createButton2 = page.locator('button:has-text("Create Session Group")')
      .or(page.locator('button:has-text("New Session Group")'))
      .or(page.locator('button:has-text("Create Group")'))
      .or(page.locator('button:has-text("New Group")'))
      .or(page.locator('a[href="/session-groups/new"]'))
      .or(page.locator('button[title*="Create"]'))
      .first();

    await expect(createButton2).toBeVisible({ timeout: 30000 });
    await createButton2.click();

    // Wait for navigation to create page
    await page.waitForURL('**/session-groups/new', { timeout: 15000 });

    // Wait for form to compile and become visible (Next.js Turbopack can take time)
    await page.waitForTimeout(2000);

    // Wait for the input to be visible
    await page.waitForSelector('input[placeholder*="Engineering" i], input[placeholder*="Project" i]', { timeout: 15000 });

    // Fill in group name
    const nameInput2 = page.locator('input[placeholder*="Engineering" i], input[placeholder*="Project" i]').first();
    await nameInput2.fill('Test Group for Last Session Deletion');

    // Submit form
    const submitButton2 = page.locator('button[type="submit"]').or(page.locator('button:has-text("Create")')).first();
    await submitButton2.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Wait for blockchain transaction

    console.log('[Test] ✅ Created test session group\n');

    // Step 2: Already on session group detail page (auto-navigated after creation)
    console.log('[Test] === STEP 2: Session Group Detail Page ===');

    // Wait for detail page to load
    await page.waitForURL('**/session-groups/sg-*', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const groupUrl = page.url();
    const groupId = groupUrl.split('/session-groups/')[1];
    console.log('[Test] On session group detail page:', groupId);
    console.log('[Test] ✅ Session group detail page ready\n');

    // Step 3: Create 1 chat session for testing edge case
    console.log('[Test] === STEP 3: Create Test Chat Session ===');

    const newChatButton = page.locator('button:has-text("New Chat"), button:has-text("Create Chat Session"), button:has-text("+ New Chat")').first();
    await expect(newChatButton).toBeVisible({ timeout: 10000 });
    await newChatButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Navigate back to session group detail
    await page.goto(`http://localhost:3002/session-groups/${groupId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('[Test] ✅ Created 1 test chat session\n');

    // Step 4: Verify session count
    const sessionLinks = page.locator('a[href*="/sess-"]');
    let sessionCount = await sessionLinks.count();
    console.log('[Test] Current session count:', sessionCount);
    expect(sessionCount).toBe(1);
    console.log('[Test] ✅ Session count verified\n');

    // Step 5: Delete all sessions one by one
    console.log('[Test] === STEP 5: Delete All Sessions ===');

    while (sessionCount > 0) {
      // Hover over first session to reveal delete button
      const sessionLink = page.locator('a[href*="/sess-"]').first();
      await sessionLink.hover();
      await page.waitForTimeout(500);

      const deleteButton = page.locator('button[title="Delete session"]').first();

      if (await deleteButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Register dialog handler BEFORE clicking
        page.once('dialog', async dialog => {
          console.log('[Test] Dialog detected:', dialog.message());
          await dialog.accept();
          console.log('[Test] Accepted dialog');
        });

        await deleteButton.click();
        await page.waitForTimeout(1000);

        // Wait for deletion to process
        await page.waitForTimeout(5000);
        sessionCount--;
        console.log('[Test] Deleted session, remaining:', sessionCount);
      } else {
        break;
      }
    }

    // Step 6: Verify empty state
    console.log('[Test] === STEP 6: Verify Empty State ===');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const finalSessionLinks = page.locator('a[href*="/sess-"]');
    const finalCount = await finalSessionLinks.count();
    console.log('[Test] Final session count:', finalCount);

    // Look for empty state message
    const emptyStateMessages = [
      'No chat sessions yet',
      'No sessions',
      'Start a new chat',
      'Create your first session'
    ];

    let foundEmptyState = false;
    for (const message of emptyStateMessages) {
      const emptyState = page.locator(`text=/${message}/i`);
      if (await emptyState.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[Test] Found empty state message:', message);
        foundEmptyState = true;
        break;
      }
    }

    if (!foundEmptyState && finalCount === 0) {
      console.log('[Test] ⚠️ No explicit empty state message, but session count is 0');
      foundEmptyState = true; // Consider it handled if count is correct
    }

    expect(foundEmptyState || finalCount === 0).toBe(true);
    console.log('[Test] ✅ Empty state handled gracefully\n');

    console.log('[Test] ========================================');
    console.log('[Test] ✅ Edge Case Complete: Last session deletion handled');
    console.log('[Test] ========================================\n');
  });
});
