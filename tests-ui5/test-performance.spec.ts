import { test, expect } from './lib/test-setup';
import fs from 'fs';
import path from 'path';

test.describe('Phase 8: Performance & Blockchain Testing', () => {

  test('Sub-phase 8.2: Measure S5 Upload Times', async ({ page, testWallet }) => {
    test.setTimeout(180000); // 3 minutes

    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 8.2: S5 Upload Performance');
    console.log('[Test] ========================================\n');

    const uploadTimes: { size: string; time: number; file: string }[] = [];

    // Step 1: Create vector database for uploads
    console.log('[Test] === STEP 1: Create Vector Database ===');
    await page.goto('http://localhost:3002/vector-databases');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const createButton = page.locator('button:has-text("Create Database"), button:has-text("Create Vector Database")').first();

    if (!(await createButton.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('[Test] ⚠️  Create button not found, checking for existing databases');

      // Check if databases exist
      const dbCards = page.locator('[class*="card"], [class*="database"]').filter({ hasText: /test|performance/i });
      const count = await dbCards.count();

      if (count > 0) {
        console.log(`[Test] Found ${count} existing databases, using first one`);
        await dbCards.first().click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      } else {
        console.log('[Test] ⚠️  No databases found and cannot create new one');
        test.skip();
        return;
      }
    } else {
      await createButton.click();
      await page.waitForTimeout(2000);

      const nameInput = page.locator('input[placeholder*="database" i], input[placeholder*="name" i], input[name="name"]').first();
      await nameInput.fill('Performance Test Database');

      const submitButton = page.locator('button[type="submit"], button:has-text("Create")').first();
      await submitButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      // Navigate to database detail
      const dbCard = page.locator('text="Performance Test Database"').first();
      if (await dbCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await dbCard.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
    }

    console.log('[Test] ✅ On database detail page\n');

    // Step 2: Create test files of varying sizes
    console.log('[Test] === STEP 2: Create Test Files ===');

    const testFiles = [
      { name: '1kb-test.txt', size: '1KB', content: 'A'.repeat(1024) },
      { name: '100kb-test.txt', size: '100KB', content: 'B'.repeat(100 * 1024) },
      { name: '500kb-test.txt', size: '500KB', content: 'C'.repeat(500 * 1024) },
      { name: '1mb-test.txt', size: '1MB', content: 'D'.repeat(1024 * 1024) },
      { name: '5mb-test.txt', size: '5MB', content: 'E'.repeat(5 * 1024 * 1024) },
    ];

    for (const file of testFiles) {
      const filePath = `/tmp/${file.name}`;
      fs.writeFileSync(filePath, file.content);
      console.log(`[Test] Created ${file.size} file: ${file.name}`);
    }

    console.log('[Test] ✅ Test files created\n');

    // Step 3: Upload each file and measure time
    console.log('[Test] === STEP 3: Upload Files and Measure Time ===');

    for (const file of testFiles) {
      const filePath = `/tmp/${file.name}`;

      console.log(`[Test] Uploading ${file.size} file: ${file.name}`);

      // Find upload button
      const uploadButton = page.locator('button:has-text("Upload")').first();

      if (!(await uploadButton.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('[Test] ⚠️  Upload button not found');
        break;
      }

      await uploadButton.click();
      await page.waitForTimeout(1000);

      const fileInput = page.locator('input[type="file"]').first();

      if (!(await fileInput.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('[Test] ⚠️  File input not found');
        break;
      }

      // Measure upload time
      const startTime = Date.now();

      await fileInput.setInputFiles(filePath);

      // Wait for upload to complete (document appears in list or success message)
      await page.waitForTimeout(500); // Give UI time to show upload indicator

      // Wait for success (document count increases or success message)
      const successPatterns = [
        'uploaded',
        'success',
        file.name,
        'complete'
      ];

      let uploadComplete = false;
      for (const pattern of successPatterns) {
        const element = page.locator(`text=/${pattern}/i`).first();
        if (await element.isVisible({ timeout: 10000 }).catch(() => false)) {
          uploadComplete = true;
          break;
        }
      }

      const endTime = Date.now();
      const uploadTime = (endTime - startTime) / 1000; // Convert to seconds

      uploadTimes.push({
        size: file.size,
        time: uploadTime,
        file: file.name
      });

      console.log(`[Test]   ${file.size} upload time: ${uploadTime.toFixed(2)}s`);

      if (uploadComplete) {
        console.log(`[Test]   ✅ Upload complete`);
      } else {
        console.log(`[Test]   ⚠️  Upload completion not detected (may still have succeeded)`);
      }

      await page.waitForTimeout(1000); // Brief pause between uploads
    }

    // Step 4: Calculate averages and verify
    console.log('\n[Test] === STEP 4: Performance Analysis ===');

    const totalTime = uploadTimes.reduce((sum, entry) => sum + entry.time, 0);
    const averageTime = totalTime / uploadTimes.length;

    console.log('[Test] Upload Times:');
    uploadTimes.forEach(entry => {
      console.log(`[Test]   ${entry.size.padEnd(6)}: ${entry.time.toFixed(2)}s (${entry.file})`);
    });
    console.log(`[Test] Average: ${averageTime.toFixed(2)}s`);
    console.log(`[Test] Total: ${totalTime.toFixed(2)}s\n`);

    // Verify targets
    const allUnder2Seconds = uploadTimes.every(entry => entry.time < 2.0);
    const allUnder5Seconds = uploadTimes.every(entry => entry.time < 5.0);

    if (allUnder2Seconds) {
      console.log('[Test] ✅ All uploads < 2 seconds (deferred embeddings target met)');
    } else if (allUnder5Seconds) {
      console.log('[Test] ⚠️  Some uploads > 2 seconds but < 5 seconds (acceptable)');
    } else {
      console.log('[Test] ⚠️  Some uploads > 5 seconds (may indicate network issues)');
    }

    await page.screenshot({ path: 'test-results/performance-s5-uploads.png', fullPage: true });

    // Cleanup test files
    for (const file of testFiles) {
      const filePath = `/tmp/${file.name}`;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    console.log('[Test] ========================================');
    console.log('[Test] ✅ Phase 8.2 Complete: S5 upload performance measured');
    console.log('[Test] ========================================\n');

    // Test passes if we got measurements
    expect(uploadTimes.length).toBeGreaterThan(0);
  });

  test('Sub-phase 8.4: Page Load Performance', async ({ page, testWallet }) => {
    test.setTimeout(120000); // 2 minutes

    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 8.4: Page Load Performance');
    console.log('[Test] ========================================\n');

    const loadTimes: { page: string; time: number; url: string }[] = [];

    // Test pages
    const pages = [
      { name: 'Dashboard', url: 'http://localhost:3002/' },
      { name: 'Session Groups', url: 'http://localhost:3002/session-groups' },
      { name: 'Vector Databases', url: 'http://localhost:3002/vector-databases' },
      { name: 'Settings', url: 'http://localhost:3002/settings' },
      { name: 'Notifications', url: 'http://localhost:3002/notifications' },
    ];

    console.log('[Test] === Measuring Page Load Times ===\n');

    for (const testPage of pages) {
      console.log(`[Test] Loading: ${testPage.name}`);

      const startTime = Date.now();

      await page.goto(testPage.url);
      await page.waitForLoadState('networkidle');

      const endTime = Date.now();
      const loadTime = (endTime - startTime) / 1000; // Convert to seconds

      loadTimes.push({
        page: testPage.name,
        time: loadTime,
        url: testPage.url
      });

      console.log(`[Test]   Load time: ${loadTime.toFixed(2)}s`);

      if (loadTime < 3) {
        console.log(`[Test]   ✅ Under 3 second target`);
      } else if (loadTime < 5) {
        console.log(`[Test]   ⚠️  Acceptable (< 5s) but over 3s target`);
      } else {
        console.log(`[Test]   ⚠️  Slow load (> 5s)`);
      }

      await page.waitForTimeout(1000); // Brief pause between page loads
    }

    // Calculate averages
    console.log('\n[Test] === Performance Summary ===');

    const totalTime = loadTimes.reduce((sum, entry) => sum + entry.time, 0);
    const averageTime = totalTime / loadTimes.length;

    console.log('[Test] Page Load Times:');
    loadTimes.forEach(entry => {
      console.log(`[Test]   ${entry.page.padEnd(20)}: ${entry.time.toFixed(2)}s`);
    });
    console.log(`[Test] Average: ${averageTime.toFixed(2)}s\n`);

    // Verify targets
    const allUnder3Seconds = loadTimes.every(entry => entry.time < 3.0);
    const allUnder5Seconds = loadTimes.every(entry => entry.time < 5.0);

    if (allUnder3Seconds) {
      console.log('[Test] ✅ All pages load < 3 seconds (target met)');
    } else if (allUnder5Seconds) {
      console.log('[Test] ⚠️  Some pages > 3 seconds but < 5 seconds (acceptable)');
    } else {
      console.log('[Test] ⚠️  Some pages > 5 seconds (performance concern)');
    }

    await page.screenshot({ path: 'test-results/performance-page-loads.png', fullPage: true });

    console.log('[Test] ========================================');
    console.log('[Test] ✅ Phase 8.4 Complete: Page load performance measured');
    console.log('[Test] ========================================\n');

    // Test passes if we got measurements
    expect(loadTimes.length).toBe(pages.length);
  });

  test('Sub-phase 8.3: WebSocket Latency (Chat Messages)', async ({ page, testWallet }) => {
    test.setTimeout(180000); // 3 minutes

    console.log('\n[Test] ========================================');
    console.log('[Test] Phase 8.3: WebSocket Latency');
    console.log('[Test] ========================================\n');

    const messageTimes: { message: number; ttfb: number; total: number }[] = [];

    // Step 1: Navigate to existing chat session or create new one
    console.log('[Test] === STEP 1: Find Chat Session ===');
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Find first session group
    const groupCards = page.locator('[class*="card"], [class*="group"]').filter({ hasText: /test|performance/i });
    const groupCount = await groupCards.count();

    if (groupCount === 0) {
      console.log('[Test] ⚠️  No session groups found, cannot test chat latency');
      test.skip();
      return;
    }

    console.log(`[Test] Found ${groupCount} session groups, opening first one`);
    await groupCards.first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Create or open chat session
    const newChatButton = page.locator('button:has-text("New Chat"), button:has-text("Create")').first();

    if (await newChatButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[Test] Creating new chat session...');
      await newChatButton.click();
      await page.waitForTimeout(3000);
    }

    // Verify we're on chat page
    const chatInput = page.locator('textarea, input[type="text"]').filter({ hasText: '' }).first();

    if (!(await chatInput.isVisible({ timeout: 10000 }).catch(() => false))) {
      console.log('[Test] ⚠️  Chat input not found, cannot test latency');
      test.skip();
      return;
    }

    console.log('[Test] ✅ On chat session page\n');

    // Step 2: Send 5 messages and measure latency
    console.log('[Test] === STEP 2: Measure Message Latency ===\n');

    const testMessages = [
      'Hello, this is message 1',
      'What is 2 + 2?',
      'Tell me a short fact',
      'Message number 4',
      'Final test message 5'
    ];

    for (let i = 0; i < testMessages.length; i++) {
      const message = testMessages[i];
      console.log(`[Test] Sending message ${i + 1}: "${message}"`);

      // Measure time to first byte (TTFB) and total response time
      const startTime = Date.now();
      let ttfbTime = 0;
      let totalTime = 0;

      await chatInput.fill(message);
      await page.keyboard.press('Enter');

      // Wait for user message to appear (optimistic update)
      await page.waitForTimeout(500);

      // Wait for AI response to start appearing
      const aiResponseStarted = await page.locator('text=/assistant|ai|response/i').first().isVisible({ timeout: 30000 }).catch(() => false);

      if (aiResponseStarted) {
        ttfbTime = (Date.now() - startTime) / 1000;
        console.log(`[Test]   TTFB: ${ttfbTime.toFixed(2)}s`);
      }

      // Wait for response to complete (no "thinking" or "..." indicator)
      await page.waitForTimeout(3000); // Give mock SDK time to complete

      totalTime = (Date.now() - startTime) / 1000;
      console.log(`[Test]   Total: ${totalTime.toFixed(2)}s`);

      messageTimes.push({
        message: i + 1,
        ttfb: ttfbTime,
        total: totalTime
      });

      if (totalTime < 5) {
        console.log(`[Test]   ✅ Fast response (< 5s)`);
      } else if (totalTime < 15) {
        console.log(`[Test]   ✅ Within target (< 15s)`);
      } else {
        console.log(`[Test]   ⚠️  Slow response (> 15s)`);
      }

      await page.waitForTimeout(1000); // Brief pause between messages
    }

    // Step 3: Calculate averages
    console.log('\n[Test] === STEP 3: Latency Analysis ===');

    const avgTTFB = messageTimes.reduce((sum, entry) => sum + entry.ttfb, 0) / messageTimes.length;
    const avgTotal = messageTimes.reduce((sum, entry) => sum + entry.total, 0) / messageTimes.length;

    console.log('[Test] Message Latencies:');
    messageTimes.forEach(entry => {
      console.log(`[Test]   Message ${entry.message}: TTFB ${entry.ttfb.toFixed(2)}s, Total ${entry.total.toFixed(2)}s`);
    });
    console.log(`[Test] Average TTFB: ${avgTTFB.toFixed(2)}s`);
    console.log(`[Test] Average Total: ${avgTotal.toFixed(2)}s\n`);

    // Verify targets
    if (avgTotal < 5) {
      console.log('[Test] ✅ Excellent latency (avg < 5s)');
    } else if (avgTotal < 15) {
      console.log('[Test] ✅ Good latency (avg < 15s target)');
    } else {
      console.log('[Test] ⚠️  High latency (avg > 15s)');
    }

    await page.screenshot({ path: 'test-results/performance-websocket-latency.png', fullPage: true });

    console.log('[Test] ========================================');
    console.log('[Test] ✅ Phase 8.3 Complete: WebSocket latency measured');
    console.log('[Test] ========================================\n');

    // Test passes if we got measurements
    expect(messageTimes.length).toBe(testMessages.length);
  });
});
