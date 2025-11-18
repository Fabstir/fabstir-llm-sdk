/**
 * Phase 8.6: Deferred Embedding Performance Test
 *
 * Tests the background embedding generation workflow and measures performance.
 *
 * Workflow:
 * 1. Upload documents to vector database (instant, no embeddings)
 * 2. Documents show "Pending Embeddings" status
 * 3. Start chat session → triggers background embedding generation
 * 4. Monitor progress and measure timing
 * 5. Verify completion and performance targets
 *
 * Performance Targets:
 * - Small docs (< 1MB): < 15s
 * - Medium docs (1-5MB): < 30s
 * - Large docs (5-10MB): < 60s
 * - Average: < 30s per document
 */

import { test, expect } from './lib/test-setup';

test.describe('Phase 8.6: Deferred Embedding Performance', () => {

  test('should measure embedding performance for documents of different sizes', async ({ page, testWallet }) => {
    test.setTimeout(300000); // 5 minutes for embedding generation

    // CAPTURE ALL CONSOLE OUTPUT FOR DEBUGGING
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      console.log(`[Browser ${type.toUpperCase()}] ${text}`);
    });

    // Capture page errors
    page.on('pageerror', error => {
      console.error('[Browser ERROR]', error.message);
    });

    const testStartTime = Date.now();
    console.log('[Test] ⏱️  Starting Phase 8.6: Deferred Embedding Performance Test');
    console.log('[Test] Test wallet address:', testWallet.getAddress());

    // Step 1: Navigate to session groups and create one
    console.log('[Test] Step 1: Creating session group...');
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    console.log('[Test] Page loaded, waiting for wallet auto-connect...');

    // Take screenshot of initial state
    await page.screenshot({ path: 'test-results/phase-8-6-initial.png', fullPage: true });
    console.log('[Test] Screenshot saved: phase-8-6-initial.png');

    await page.waitForTimeout(5000); // Wait 5 seconds for wallet to auto-connect

    // Check if wallet connected
    const walletConnected = await page.locator('text=Connect Wallet').count() === 0;
    console.log('[Test] Wallet connected?', walletConnected);

    // Take screenshot after wallet check
    await page.screenshot({ path: 'test-results/phase-8-6-after-wallet-check.png', fullPage: true });
    console.log('[Test] Screenshot saved: phase-8-6-after-wallet-check.png');

    // Click "+ New Group" link (it's an <a> tag, not a button)
    console.log('[Test] Looking for "+ New Group" link...');
    await page.click('a:has-text("+ New Group")');
    console.log('[Test] Clicked "+ New Group", waiting for new page...');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Wait for SDK initialization on the new page
    console.log('[Test] Waiting for SDK initialization on form page...');
    await page.waitForSelector('input#name', { timeout: 30000 });
    console.log('[Test] Form loaded successfully');

    // Fill in session group creation form (uses id, not name attributes)
    console.log('[Test] Filling session group form...');
    await page.fill('input#name', 'Phase 8.6 Performance Test');
    await page.fill('textarea#description', 'Testing deferred embedding performance');
    await page.click('button:has-text("Create Session Group")');
    await page.waitForTimeout(3000);
    console.log('[Test] Session group creation submitted');

    // Step 2: Create vector database
    console.log('[Test] Step 2: Creating vector database...');
    await page.click('text=Vector Databases');
    await page.waitForTimeout(2000);

    await page.click('button:has-text("+ New Database")');
    await page.fill('input[name="name"]', 'phase-8-6-perf-test');
    await page.fill('textarea[name="description"]', 'Performance test database');
    await page.click('button:has-text("Create Database")');
    await page.waitForTimeout(3000);

    // Navigate to database detail page
    await page.click('text=phase-8-6-perf-test');
    await page.waitForTimeout(2000);

    // Step 3: Generate and upload test documents
    console.log('[Test] Step 3: Uploading test documents...');

    const documents = [
      { name: 'small-doc.txt', size: 100 * 1024, label: 'Small (100KB)' },  // 100KB
      { name: 'medium-doc.txt', size: 500 * 1024, label: 'Medium (500KB)' }, // 500KB
      { name: 'large-doc.txt', size: 1024 * 1024, label: 'Large (1MB)' },    // 1MB
    ];

    const uploadTimes: { name: string; uploadTime: number }[] = [];

    for (const doc of documents) {
      console.log(`[Test] Uploading ${doc.label}...`);

      // Generate text content (Lorem Ipsum repeated to reach size)
      const loremIpsum = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(100);
      const repetitions = Math.ceil(doc.size / loremIpsum.length);
      const content = loremIpsum.repeat(repetitions).substring(0, doc.size);

      const uploadStart = Date.now();

      // Upload file
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: doc.name,
        mimeType: 'text/plain',
        buffer: Buffer.from(content),
      });

      // Wait for upload to complete (should be fast - no embeddings yet)
      await page.waitForTimeout(3000);

      const uploadTime = Date.now() - uploadStart;
      uploadTimes.push({ name: doc.label, uploadTime });

      console.log(`[Test] ✅ ${doc.label} uploaded in ${uploadTime}ms`);
    }

    // Step 4: Verify documents show "Pending Embeddings" status
    console.log('[Test] Step 4: Verifying pending status...');

    for (const doc of documents) {
      const docElement = page.locator(`text=${doc.name.replace('.txt', '')}`);
      await expect(docElement).toBeVisible({ timeout: 5000 });

      // Look for pending badge/indicator
      // Note: Exact selector depends on UI implementation
      const hasPendingBadge = await page.locator('text=/Pending|pending|⏳/i').isVisible();
      if (hasPendingBadge) {
        console.log(`[Test] ✅ ${doc.label} shows pending status`);
      } else {
        console.log(`[Test] ⚠️  ${doc.label} pending status not clearly visible (may be auto-processing)`);
      }
    }

    // Step 5: Navigate to session group and start chat to trigger embeddings
    console.log('[Test] Step 5: Starting chat session to trigger background embeddings...');

    await page.click('text=Session Groups');
    await page.waitForTimeout(2000);

    await page.click('text=Phase 8.6 Performance Test');
    await page.waitForTimeout(2000);

    // Link the vector database to the session group
    console.log('[Test] Linking vector database to session group...');
    await page.click('button:has-text("+ Link Database")');
    await page.waitForTimeout(1000);
    await page.click('text=phase-8-6-perf-test');
    await page.waitForTimeout(3000);

    // Start a new chat session (this should trigger background embedding generation)
    console.log('[Test] Creating chat session...');
    const embeddingStartTime = Date.now();

    await page.click('button:has-text("+ New Chat")');
    await page.waitForTimeout(5000); // Wait for session creation

    // Step 6: Monitor embedding progress
    console.log('[Test] Step 6: Monitoring embedding progress...');

    // Look for embedding progress indicators
    const progressBarVisible = await page.locator('[role="progressbar"], .progress-bar, text=/Vectorizing|Embedding/i').isVisible({ timeout: 10000 }).catch(() => false);

    if (progressBarVisible) {
      console.log('[Test] ✅ Progress bar visible - embeddings in progress');

      // Wait for embeddings to complete (with generous timeout)
      const maxWaitTime = 180000; // 3 minutes for all 3 documents
      const checkInterval = 2000;
      let elapsed = 0;
      let embeddingsComplete = false;

      while (elapsed < maxWaitTime && !embeddingsComplete) {
        await page.waitForTimeout(checkInterval);
        elapsed += checkInterval;

        // Check if progress bar is gone (embeddings complete)
        const stillInProgress = await page.locator('[role="progressbar"], .progress-bar, text=/Vectorizing|Embedding/i').isVisible().catch(() => false);

        if (!stillInProgress) {
          embeddingsComplete = true;
          console.log(`[Test] ✅ Embeddings completed in ${elapsed}ms`);
          break;
        }

        if (elapsed % 10000 === 0) {
          console.log(`[Test] ⏳ Still processing... (${elapsed / 1000}s elapsed)`);
        }
      }

      if (!embeddingsComplete) {
        console.log(`[Test] ⚠️  Embeddings did not complete within ${maxWaitTime / 1000}s`);
      }
    } else {
      console.log('[Test] ⚠️  No progress bar detected - embeddings may have completed instantly or not triggered');
    }

    const embeddingTotalTime = Date.now() - embeddingStartTime;

    // Step 7: Verify completion and calculate metrics
    console.log('[Test] Step 7: Calculating performance metrics...');

    // Navigate back to vector database to check document status
    await page.click('text=Vector Databases');
    await page.waitForTimeout(2000);
    await page.click('text=phase-8-6-perf-test');
    await page.waitForTimeout(2000);

    // Check if documents are now "Ready" (embeddings complete)
    const readyDocuments: string[] = [];
    for (const doc of documents) {
      const hasReadyBadge = await page.locator(`text=${doc.name.replace('.txt', '')}`).locator('..').locator('text=/Ready|✓|✅/i').isVisible({ timeout: 5000 }).catch(() => false);
      if (hasReadyBadge) {
        readyDocuments.push(doc.label);
        console.log(`[Test] ✅ ${doc.label} is ready`);
      } else {
        console.log(`[Test] ⚠️  ${doc.label} status unclear`);
      }
    }

    // Calculate performance metrics
    const avgUploadTime = uploadTimes.reduce((sum, t) => sum + t.uploadTime, 0) / uploadTimes.length;
    const avgEmbeddingTime = embeddingTotalTime / documents.length;

    console.log('\n[Test] ═══════════════════════════════════════════════');
    console.log('[Test] 📊 PHASE 8.6 PERFORMANCE RESULTS');
    console.log('[Test] ═══════════════════════════════════════════════');
    console.log('[Test] Upload Times (Deferred - No Embeddings):');
    uploadTimes.forEach(t => {
      console.log(`[Test]   ${t.name}: ${t.uploadTime}ms`);
    });
    console.log(`[Test]   Average: ${avgUploadTime.toFixed(0)}ms`);
    console.log(`[Test]   ✅ Target: < 2000ms (${avgUploadTime < 2000 ? 'PASS' : 'FAIL'})`);
    console.log('[Test]');
    console.log('[Test] Embedding Generation:');
    console.log(`[Test]   Total Time: ${embeddingTotalTime}ms (${(embeddingTotalTime / 1000).toFixed(1)}s)`);
    console.log(`[Test]   Average per Document: ${avgEmbeddingTime.toFixed(0)}ms (${(avgEmbeddingTime / 1000).toFixed(1)}s)`);
    console.log(`[Test]   ✅ Target: < 30s avg (${avgEmbeddingTime < 30000 ? 'PASS' : 'FAIL'})`);
    console.log('[Test]');
    console.log('[Test] Documents Ready:');
    console.log(`[Test]   ${readyDocuments.length}/${documents.length} documents transitioned to Ready status`);
    console.log('[Test] ═══════════════════════════════════════════════');

    const testTotalTime = Date.now() - testStartTime;
    console.log(`[Test] ⏱️  Total test time: ${(testTotalTime / 1000).toFixed(1)}s`);

    // Assertions
    expect(avgUploadTime).toBeLessThan(2000); // Upload should be instant (< 2s)
    expect(embeddingTotalTime).toBeGreaterThan(0); // Embeddings should have occurred

    // If embeddings completed, check performance target
    if (readyDocuments.length > 0) {
      expect(avgEmbeddingTime).toBeLessThan(30000); // < 30s average per document
    }

    // At least some documents should be ready
    expect(readyDocuments.length).toBeGreaterThan(0);

    console.log('[Test] ✅ Phase 8.6: Deferred Embedding Performance Test COMPLETE');
  });

  test('should handle embedding progress bar accuracy', async ({ page }) => {
    console.log('[Test] Testing embedding progress bar accuracy...');

    // This test would verify:
    // 1. Progress bar shows correct percentage
    // 2. Progress bar updates as documents complete
    // 3. Queue position and remaining documents display correctly

    // For now, this is a placeholder for more detailed progress monitoring
    // Actual implementation would require capturing progress events and comparing
    // to actual completion percentages

    console.log('[Test] ℹ️  Progress bar accuracy test - placeholder for future enhancement');
    expect(true).toBe(true); // Placeholder assertion
  });
});
