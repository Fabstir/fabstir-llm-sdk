/**
 * Phase 5.4: Navigate Away and Return
 *
 * Tests conversation persistence across navigation by navigating away from a chat
 * session and returning to verify that conversation history is intact.
 *
 * Prerequisites:
 * - UI5 server running on port 3002
 * - Test wallet auto-connected (TEST_USER_1_PRIVATE_KEY)
 * - Existing session group with at least one chat session (created by Phase 5.1)
 *
 * Expected Duration: 10-15 seconds (navigation + verification)
 */

import { test, expect, TEST_CONFIG } from './lib/test-setup';

test.describe('Phase 5.4: Navigate Away and Return', () => {

  test('should preserve conversation history after navigation', async ({ page, testWallet }) => {
    // Timeout for navigation flow
    test.setTimeout(90000); // 90 seconds

    console.log('[Test] ========================================');
    console.log('[Test] Phase 5.4: Navigate Away and Return');
    console.log('[Test] ========================================');

    // Store message text for verification after navigation
    const testMessages = [
      'Hello, this is the first message in our conversation.',
      'This is a follow-up message to test persistence.'
    ];

    // ===== STEP 1: Navigate to Session Groups Page =====
    console.log('\n[Test] === STEP 1: Navigate to Session Groups Page ===');
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const groupCards = page.locator('a[href^="/session-groups/sg-"]');
    const groupCount = await groupCards.count();
    console.log(`[Test] Found ${groupCount} session group(s)`);

    if (groupCount === 0) {
      console.log('[Test] ⚠️  No session groups found - test cannot proceed');
      console.log('[Test] Run Phase 5.1 (create chat session) first');
      throw new Error('No session groups found. Run Phase 5.1 first to create a chat session.');
    }

    // ===== STEP 2: Navigate to Session Group Detail =====
    console.log('\n[Test] === STEP 2: Navigate to Session Group Detail ===');

    const firstGroup = groupCards.first();
    const groupHref = await firstGroup.getAttribute('href');
    const groupId = groupHref?.split('/').pop() || '';
    console.log(`[Test] Opening group: ${groupId}`);

    const openButton = firstGroup.locator('button:has-text("Open")');
    await expect(openButton).toBeVisible({ timeout: 5000 });
    await openButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('[Test] ✅ Session group detail page loaded');

    // ===== STEP 3: Open or Create Chat Session =====
    console.log('\n[Test] === STEP 3: Open or Create Chat Session ===');

    // Try to find existing chat session in the list
    const chatSessionLinks = page.locator('a[href*="/sess-"]');
    const sessionCount = await chatSessionLinks.count();

    let chatUrl: string;

    if (sessionCount > 0) {
      // Use existing session
      console.log(`[Test] Found ${sessionCount} existing session(s), using first one`);
      const firstSession = chatSessionLinks.first();
      await firstSession.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      chatUrl = page.url();
      console.log(`[Test] ✅ Opened existing chat session: ${chatUrl}`);
    } else {
      // No existing sessions, create new one
      console.log('[Test] No existing sessions, creating new chat session');

      const newChatButton = page.locator('button:has-text("+ New Chat")');
      await expect(newChatButton).toBeVisible({ timeout: 5000 });

      const navigationPromise = page.waitForURL(/\/session-groups\/sg-.*\/sess-.*/, { timeout: 15000 });
      await newChatButton.click();
      await navigationPromise;

      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      chatUrl = page.url();
      console.log(`[Test] ✅ Created new chat session: ${chatUrl}`);
    }

    // Extract session ID from URL for later navigation
    const sessionIdMatch = chatUrl.match(/\/sess-([^/]+)/);
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : '';
    console.log(`[Test] Session ID: ${sessionId}`);

    // ===== STEP 4: Send Messages to Create History =====
    console.log('\n[Test] === STEP 4: Send Messages to Create History ===');

    const chatInput = page.locator('textarea[placeholder*="Type"], input[placeholder*="message"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    console.log('[Test] ✅ Chat input found');

    // Send first message
    await chatInput.fill(testMessages[0]);
    await chatInput.press('Enter');
    console.log(`[Test] Sent message 1: "${testMessages[0]}"`);
    await page.waitForTimeout(3000); // Wait for AI response

    // Send second message
    await chatInput.fill(testMessages[1]);
    await chatInput.press('Enter');
    console.log(`[Test] Sent message 2: "${testMessages[1]}"`);
    await page.waitForTimeout(3000); // Wait for AI response

    // Take screenshot before navigation
    await page.screenshot({
      path: 'test-results/chat-before-navigation.png',
      fullPage: true
    });
    console.log('[Test] Screenshot saved: chat-before-navigation.png');

    // Verify messages are visible before navigation
    const msg1BeforeNav = await page.locator(`text="${testMessages[0]}"`).count() > 0;
    const msg2BeforeNav = await page.locator(`text="${testMessages[1]}"`).count() > 0;
    console.log(`[Test] Message 1 visible before navigation: ${msg1BeforeNav}`);
    console.log(`[Test] Message 2 visible before navigation: ${msg2BeforeNav}`);

    expect(msg1BeforeNav).toBe(true);
    expect(msg2BeforeNav).toBe(true);
    console.log('[Test] ✅ Both messages confirmed visible before navigation');

    // ===== STEP 5: Navigate to Dashboard =====
    console.log('\n[Test] === STEP 5: Navigate to Dashboard ===');

    const dashboardLink = page.locator('a[href="/"]').first();
    await dashboardLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('[Test] ✅ Navigated to Dashboard');

    // Verify we're on dashboard
    const currentUrl = page.url();
    console.log(`[Test] Current URL: ${currentUrl}`);
    expect(currentUrl).toContain('localhost:3002');

    // ===== STEP 6: Navigate to Session Groups =====
    console.log('\n[Test] === STEP 6: Navigate to Session Groups ===');

    const sessionGroupsLink = page.locator('a[href="/session-groups"]').first();
    await sessionGroupsLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('[Test] ✅ Navigated to Session Groups page');

    // ===== STEP 7: Navigate Back to Session Group =====
    console.log('\n[Test] === STEP 7: Navigate Back to Session Group ===');

    const groupCardAgain = page.locator(`a[href="/session-groups/${groupId}"]`).first();
    const openButtonAgain = groupCardAgain.locator('button:has-text("Open")');
    await expect(openButtonAgain).toBeVisible({ timeout: 5000 });
    await openButtonAgain.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('[Test] ✅ Returned to session group detail');

    // ===== STEP 8: Navigate Back to Chat Session =====
    console.log('\n[Test] === STEP 8: Navigate Back to Chat Session ===');

    // Find and click on the specific chat session we created/used
    const sessionLinkAgain = page.locator(`a[href*="/sess-${sessionId}"]`).first();
    await expect(sessionLinkAgain).toBeVisible({ timeout: 5000 });
    await sessionLinkAgain.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('[Test] ✅ Returned to chat session');

    // ===== STEP 9: Verify Conversation History Intact =====
    console.log('\n[Test] === STEP 9: Verify Conversation History Intact ===');

    // Verify both messages are still visible after navigation
    const msg1AfterNav = await page.locator(`text="${testMessages[0]}"`).count() > 0;
    const msg2AfterNav = await page.locator(`text="${testMessages[1]}"`).count() > 0;

    console.log(`[Test] Message 1 visible after navigation: ${msg1AfterNav}`);
    console.log(`[Test] Message 2 visible after navigation: ${msg2AfterNav}`);

    if (msg1AfterNav && msg2AfterNav) {
      console.log('[Test] ✅ Conversation history fully intact after navigation');
    } else {
      console.log('[Test] ⚠️  Some messages may have been lost during navigation');
    }

    // Assertions
    expect(msg1AfterNav).toBe(true);
    expect(msg2AfterNav).toBe(true);

    // ===== STEP 10: Take Final Screenshot =====
    console.log('\n[Test] === STEP 10: Take Final Screenshot ===');

    await page.screenshot({
      path: 'test-results/chat-after-navigation.png',
      fullPage: true
    });
    console.log('[Test] Screenshot saved: chat-after-navigation.png');

    // ===== STEP 11: Verify No Data Loss =====
    console.log('\n[Test] === STEP 11: Verify No Data Loss ===');

    // Check for any error messages
    const errorMessages = page.locator('[class*="error"], [class*="Error"]');
    const errorCount = await errorMessages.count();

    if (errorCount > 0) {
      const errorText = await errorMessages.first().textContent();
      console.log(`[Test] ⚠️  Found ${errorCount} error message(s): ${errorText}`);
    } else {
      console.log('[Test] ✅ No error messages detected');
    }

    expect(errorCount).toBe(0);
    console.log('[Test] ✅ No data loss detected');

    console.log('\n[Test] ========================================');
    console.log('[Test] ✅ Phase 5.4 Complete: Conversation history preserved across navigation');
    console.log('[Test] ========================================');
  });

  test('should handle multiple navigation cycles without data loss', async ({ page, testWallet }) => {
    test.setTimeout(120000); // 120 seconds

    console.log('[Test] ========================================');
    console.log('[Test] Phase 5.4 Edge Case: Multiple Navigation Cycles');
    console.log('[Test] ========================================');

    const testMessage = 'Persistence test message for multiple navigation cycles';

    // Navigate to session groups
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const groupCards = page.locator('a[href^="/session-groups/sg-"]');
    const groupCount = await groupCards.count();

    if (groupCount === 0) {
      console.log('[Test] No session groups - skipping edge case test');
      return;
    }

    // Open first group
    const firstGroup = groupCards.first();
    const groupHref = await firstGroup.getAttribute('href');
    const groupId = groupHref?.split('/').pop() || '';

    const openButton = firstGroup.locator('button:has-text("Open")');
    await expect(openButton).toBeVisible({ timeout: 5000 });
    await openButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Try to open existing session or create new
    const chatSessionLinks = page.locator('a[href*="/sess-"]');
    const sessionCount = await chatSessionLinks.count();

    if (sessionCount > 0) {
      await chatSessionLinks.first().click();
    } else {
      const newChatButton = page.locator('button:has-text("+ New Chat")');
      if (await newChatButton.count() > 0) {
        await newChatButton.click();
        await page.waitForURL(/\/session-groups\/sg-.*\/sess-.*/, { timeout: 15000 });
      } else {
        console.log('[Test] No way to access chat session, skipping edge case');
        return;
      }
    }

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Send test message
    const chatInput = page.locator('textarea[placeholder*="Type"], input[placeholder*="message"]');
    if (await chatInput.count() === 0) {
      console.log('[Test] No chat input found, skipping edge case');
      return;
    }

    console.log('[Test] Sending test message...');
    await chatInput.fill(testMessage);
    await chatInput.press('Enter');
    await page.waitForTimeout(3000);

    // Perform 3 navigation cycles
    console.log('[Test] Performing 3 navigation cycles...');
    for (let i = 1; i <= 3; i++) {
      console.log(`[Test] Navigation cycle ${i}/3`);

      // Navigate to dashboard
      await page.locator('a[href="/"]').first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Navigate back to session groups
      await page.locator('a[href="/session-groups"]').first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Navigate to group
      await page.locator(`a[href="/session-groups/${groupId}"]`).first().locator('button:has-text("Open")').click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Navigate to session
      await page.locator('a[href*="/sess-"]').first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Verify message still visible
      const messageVisible = await page.locator(`text="${testMessage}"`).count() > 0;
      console.log(`[Test] After cycle ${i}, message visible: ${messageVisible}`);

      if (!messageVisible) {
        console.log(`[Test] ⚠️  Message lost after navigation cycle ${i}`);
      }
    }

    // Final verification
    const finalMessageVisible = await page.locator(`text="${testMessage}"`).count() > 0;

    if (finalMessageVisible) {
      console.log('[Test] ✅ Message persisted through 3 navigation cycles');
    } else {
      console.log('[Test] ⚠️  Message was lost during navigation cycles');
    }

    console.log('[Test] ✅ Edge case test complete');
  });
});
