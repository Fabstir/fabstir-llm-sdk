import { test, expect } from './lib/test-setup';

/**
 * Test Message Duplication and Conversation History
 *
 * Reproduces and fixes:
 * 1. User messages being replaced with AI responses (timestamp collision)
 * 2. Duplicate messages in UI (React Strict Mode)
 * 3. No conversation history (not sending previous messages)
 */

test.describe('Message Duplication Fix', () => {
  test('should display messages correctly and maintain conversation history', async ({ page, testWallet }) => {
    test.setTimeout(180000); // 3 minutes

    // Capture console logs
    const logs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
      if (text.includes('📝') || text.includes('🔍') || text.includes('💾')) {
        console.log(`[Browser] ${text}`);
      }
    });

    console.log('\n=== Test: Message Duplication Fix ===\n');

    // Navigate to session groups
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    console.log('✅ Navigated to session groups');

    // Create session group
    await page.click('a:has-text("+ New Group")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.waitForSelector('input#name', { timeout: 30000 });
    const groupName = `Message Test ${Date.now()}`;
    await page.fill('input#name', groupName);
    await page.fill('textarea#description', 'Testing message display');
    await page.click('button:has-text("Create Session Group")');
    await page.waitForTimeout(3000);

    console.log('✅ Session group created');

    // Start AI Chat
    await page.click('button:has-text("Start AI Chat")');
    await page.waitForSelector('text=Start AI Chat Session', { timeout: 10000 });

    // Fill session details
    await page.fill('input[placeholder*="deposit" i]', '2');
    await page.waitForTimeout(3000);

    // Select host
    const hostSelect = page.locator('select').first();
    if (await hostSelect.isVisible()) {
      await hostSelect.selectOption({ index: 1 });
    }

    await page.waitForTimeout(1000);

    // Start session
    await page.click('button:has-text("Start Chat")');
    await page.waitForURL(/\/session-groups\/.*\/sess-/, { timeout: 60000 });
    await page.waitForTimeout(5000);

    console.log('✅ AI session started');

    // Send first message
    const messageInput = page.locator('textarea[placeholder*="message" i]').first();
    await messageInput.fill('What is the capital of France?');
    await page.keyboard.press('Enter');

    console.log('✅ Sent first message');

    // Wait for AI response
    await page.waitForTimeout(15000);

    // Take screenshot
    await page.screenshot({ path: '/tmp/message-test-1.png' });

    // Count messages in UI
    const messages1 = await page.locator('[data-role], .message, [class*="message"]').count();
    console.log(`Messages after first exchange: ${messages1}`);

    // Send second message (follow-up)
    await messageInput.fill('Tell me more about it');
    await page.keyboard.press('Enter');

    console.log('✅ Sent second message (follow-up)');

    // Wait for AI response
    await page.waitForTimeout(15000);

    // Take screenshot
    await page.screenshot({ path: '/tmp/message-test-2.png' });

    // Count messages again
    const messages2 = await page.locator('[data-role], .message, [class*="message"]').count();
    console.log(`Messages after second exchange: ${messages2}`);

    // Analyze logs
    console.log('\n=== Log Analysis ===');

    const userMessageLogs = logs.filter(l => l.includes('📝 Adding user message'));
    const aiPlaceholderLogs = logs.filter(l => l.includes('📝 Adding AI placeholder'));
    const finalUpdateLogs = logs.filter(l => l.includes('📝 Final update'));

    console.log(`User message additions: ${userMessageLogs.length}`);
    console.log(`AI placeholder additions: ${aiPlaceholderLogs.length}`);
    console.log(`Final updates: ${finalUpdateLogs.length}`);

    // Check for timestamp collision bug
    const timestampCollisions = finalUpdateLogs.filter(l =>
      l.includes("['user', 'assistant', 'assistant'") ||
      l.includes("'assistant', 'assistant', 'assistant'")
    );

    if (timestampCollisions.length > 0) {
      console.log('\n❌ TIMESTAMP COLLISION BUG DETECTED:');
      timestampCollisions.forEach(log => console.log(`  ${log}`));
    } else {
      console.log('\n✅ No timestamp collisions detected');
    }

    // Check for conversation history - look for context being sent
    const contextLogs = logs.filter(l => l.includes('📜 Conversation context'));

    if (contextLogs.length > 0) {
      console.log('\n✅ Conversation context being sent:');
      contextLogs.forEach((log, idx) => {
        console.log(`  Message ${idx + 1}: ${log}`);
      });

      // Check if second message includes previous exchange
      const secondContextLog = contextLogs[0]; // First follow-up message
      if (secondContextLog && secondContextLog.includes('previousMessageCount: 2')) {
        console.log('✅ Second message includes conversation history (2 previous messages)');
      } else {
        console.log('⚠️  Second message context:', secondContextLog);
      }
    } else {
      console.log('❌ No conversation context logs found');
    }

    // Check AI response mentions France
    const secondResponse = logs.find(l =>
      l.includes('AI response complete') &&
      logs.indexOf(l) > logs.findIndex(l2 => l2.includes('✅ Sent second message'))
    );

    if (secondResponse && secondResponse.toLowerCase().includes('france')) {
      console.log('✅ AI response mentions France (has conversation memory)');
    } else if (secondResponse) {
      console.log('⚠️  AI response does not mention France');
      console.log(`  Second response: ${secondResponse.substring(0, 200)}`);
    }

    // Save logs
    require('fs').writeFileSync('/tmp/message-duplication-logs.txt', logs.join('\n'));
    console.log('\n✅ Logs saved to /tmp/message-duplication-logs.txt');

    // Expected: 4 messages total (2 user + 2 AI)
    // Actual might be different due to bugs
    console.log(`\nExpected: 4 messages (2 user + 2 AI)`);
    console.log(`Actual: ${messages2} messages in UI`);
  });
});
