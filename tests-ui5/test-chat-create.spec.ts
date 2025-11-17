/**
 * Phase 5.1: Create Chat Session
 *
 * Tests chat session creation within a session group.
 *
 * Prerequisites:
 * - UI5 server running on port 3002
 * - Test wallet auto-connected (TEST_USER_1_PRIVATE_KEY)
 * - Existing session group (created by Phase 4.1 test)
 *
 * Expected Duration: 5-10 seconds (metadata creation, no blockchain transaction)
 */

import { test, expect, TEST_CONFIG } from './lib/test-setup';

test.describe('Phase 5.1: Create Chat Session', () => {

  test('should create chat session and navigate to chat page', async ({ page, testWallet }) => {
    // Increase timeout for navigation
    test.setTimeout(60000); // 60 seconds

    console.log('[Test] ========================================');
    console.log('[Test] Phase 5.1: Create Chat Session');
    console.log('[Test] ========================================');

    // Step 1: Navigate to session groups page
    console.log('\n[Test] === STEP 1: Navigate to Session Groups Page ===');
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    console.log('[Test] Session groups page loaded');

    await page.waitForTimeout(2000);

    // Step 2: Verify session groups exist
    console.log('\n[Test] === STEP 2: Verify Session Groups Exist ===');
    const groupCards = page.locator('a[href^="/session-groups/sg-"]');
    const groupCount = await groupCards.count();
    console.log(`[Test] Found ${groupCount} session group(s)`);

    if (groupCount === 0) {
      console.log('[Test] ⚠️  No session groups found - test cannot proceed');
      console.log('[Test] Run Phase 4.1 (create session group) first');
      throw new Error('No session groups found. Run Phase 4.1 first to create a session group.');
    }

    // Step 3: Navigate to first session group detail page
    console.log('\n[Test] === STEP 3: Navigate to Session Group Detail ===');
    const firstGroup = groupCards.first();
    const groupHref = await firstGroup.getAttribute('href');
    const groupId = groupHref?.split('/').pop() || '';
    console.log(`[Test] Navigating to group: ${groupId}`);

    // Click the "Open" button within the first group card
    const openButton = firstGroup.locator('button:has-text("Open")');
    await expect(openButton).toBeVisible({ timeout: 5000 });
    await openButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    console.log(`[Test] Current URL: ${currentUrl}`);
    expect(currentUrl).toContain(`/session-groups/${groupId}`);
    console.log('[Test] ✅ Session group detail page loaded');

    // Step 4: Take screenshot before chat creation
    console.log('\n[Test] === STEP 4: Screenshot Before Chat Creation ===');
    await page.screenshot({
      path: 'test-results/chat-create-before.png',
      fullPage: true
    });
    console.log('[Test] Screenshot taken: before chat creation');

    // Step 5: Find and click "+ New Chat" button
    console.log('\n[Test] === STEP 5: Click New Chat Button ===');
    const newChatButton = page.locator('button:has-text("+ New Chat")');
    await expect(newChatButton).toBeVisible({ timeout: 5000 });
    console.log('[Test] "+ New Chat" button found');

    // Listen for navigation
    const navigationPromise = page.waitForURL(/\/session-groups\/sg-.*\/sess-.*/, { timeout: 15000 });

    await newChatButton.click();
    console.log('[Test] Clicked "+ New Chat" button');

    // Step 6: Wait for navigation to chat page
    console.log('\n[Test] === STEP 6: Wait for Navigation to Chat Page ===');
    try {
      await navigationPromise;
      console.log('[Test] ✅ Navigated to chat page');
    } catch (err) {
      console.error('[Test] ❌ Navigation timeout - chat page did not load');
      throw err;
    }

    const chatUrl = page.url();
    console.log(`[Test] Chat URL: ${chatUrl}`);

    // Verify URL format: /session-groups/{groupId}/{sessionId}
    const urlMatch = chatUrl.match(/\/session-groups\/(sg-[^\/]+)\/(sess-[^\/]+)/);
    if (!urlMatch) {
      throw new Error(`Invalid chat URL format: ${chatUrl}`);
    }

    const [, urlGroupId, sessionId] = urlMatch;
    console.log(`[Test] Group ID: ${urlGroupId}`);
    console.log(`[Test] Session ID: ${sessionId}`);
    expect(urlGroupId).toBe(groupId);
    console.log('[Test] ✅ Chat session created');

    // Step 7: Verify chat page loaded
    console.log('\n[Test] === STEP 7: Verify Chat Page Loaded ===');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for chat interface elements (message input, send button)
    const chatInput = page.locator('textarea[placeholder*="Type"], input[placeholder*="message"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    console.log('[Test] ✅ Chat input found');

    // Step 8: Check for progress bar (if pending documents exist)
    console.log('\n[Test] === STEP 8: Check for Embedding Progress Bar ===');

    // Check for progress indicators (any of these may be present)
    const progressByRole = await page.locator('[role=progressbar]').count();
    const progressByClass = await page.locator('.progress-bar').count();
    const progressByText = await page.locator('text=Vectorizing Documents').count();
    const hasProgressBar = progressByRole > 0 || progressByClass > 0 || progressByText > 0;

    if (hasProgressBar) {
      console.log('[Test] ✅ Embedding progress bar detected');
      console.log('[Test] Background embedding processing started (non-blocking)');
    } else {
      console.log('[Test] No pending documents - no progress bar expected');
    }

    // Step 9: Final screenshot
    console.log('\n[Test] === STEP 9: Final Screenshot ===');
    await page.screenshot({
      path: 'test-results/chat-create-success.png',
      fullPage: true
    });
    console.log('[Test] Screenshot saved: test-results/chat-create-success.png');

    console.log('\n[Test] ========================================');
    console.log('[Test] ✅ Phase 5.1 Complete: Chat session created successfully');
    console.log('[Test] ========================================');
  });

  test('should handle empty state (no chat sessions yet)', async ({ page, testWallet }) => {
    test.setTimeout(60000);

    console.log('[Test] ========================================');
    console.log('[Test] Phase 5.1 Edge Case: Empty Chat State');
    console.log('[Test] ========================================');

    // Navigate to session group
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const groupCards = page.locator('a[href^="/session-groups/sg-"]');
    const groupCount = await groupCards.count();

    if (groupCount === 0) {
      console.log('[Test] No session groups - skipping edge case test');
      return;
    }

    const firstGroup = groupCards.first();
    const openButton = firstGroup.locator('button:has-text("Open")');
    await expect(openButton).toBeVisible({ timeout: 5000 });
    await openButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for empty state message or chat list
    const chatList = page.locator('text=Chat Sessions, text=Recent Chats, text=No chats');
    const hasChats = await chatList.count() > 0;

    console.log(`[Test] Chat list presence: ${hasChats}`);

    if (!hasChats) {
      // Check for "+ New Chat" button in empty state
      const emptyStateButton = page.locator('button:has-text("Start Your First Chat"), button:has-text("+ New Chat")');
      await expect(emptyStateButton.first()).toBeVisible({ timeout: 5000 });
      console.log('[Test] ✅ Empty state button found');
    } else {
      console.log('[Test] Chat sessions already exist');
    }

    console.log('[Test] ✅ Edge case test complete');
  });
});
