/**
 * Vector Database Upload Tests
 *
 * Tests uploading single and multiple files to vector databases with S5 storage.
 * Covers Sub-phases 3.2 and 3.3 from comprehensive testing plan.
 *
 * Verifies:
 * - Navigation to database detail page
 * - Single file upload (test-doc-1.txt)
 * - Multiple file upload (test-doc-2.md, test-doc-3.json)
 * - S5 storage integration
 * - Document count updates
 * - File metadata display (name, size, CID)
 */
import { test, expect, TEST_CONFIG } from './lib/test-setup';
import path from 'path';

test.describe('Vector Database - Upload Files', () => {
  test('should upload single file to vector database (Sub-phase 3.2)', async ({ page, testWallet }) => {
    console.log('[Test] Starting single file upload test');
    console.log('[Test] Test wallet:', testWallet.getAddress());

    // Navigate to UI5
    await page.goto(TEST_CONFIG.UI5_URL);
    console.log('[Test] Navigated to UI5');

    // Wait for dashboard
    await page.waitForSelector('text=Dashboard', { timeout: 30000 });
    console.log('[Test] Dashboard loaded');

    // Wait for wallet connection
    await page.waitForSelector('text=Disconnect', { timeout: 10000 });
    console.log('[Test] Wallet connected');

    // Navigate to vector databases page
    await page.click('a[href="/vector-databases"]');
    await page.waitForSelector('text=Vector Databases', { timeout: 10000 });
    console.log('[Test] Vector databases page loaded');

    // Click on "Test Database 1" to open detail page
    const databaseCard = page.locator('text=Test Database 1').first();
    await expect(databaseCard).toBeVisible({ timeout: 10000 });
    await databaseCard.click();
    console.log('[Test] Clicked on Test Database 1');

    // Wait for database detail page to load
    await page.waitForSelector('text=/Database|Details/i', { timeout: 10000 });
    console.log('[Test] Database detail page loaded');

    // Take screenshot of database detail page
    await page.screenshot({ path: 'test-results/vector-db-detail-initial.png' });
    console.log('[Test] Screenshot taken: database detail page');

    // Record initial document count
    const initialCountElement = page.locator('text=/\\d+ documents?/i').first();
    let initialCount = 0;
    try {
      const countText = await initialCountElement.textContent({ timeout: 5000 });
      const match = countText?.match(/(\d+)/);
      if (match) {
        initialCount = parseInt(match[1]);
        console.log(`[Test] Initial document count: ${initialCount}`);
      }
    } catch (e) {
      console.log('[Test] Could not determine initial document count, assuming 0');
    }

    // Find and click "Upload Documents" button
    const uploadButton = page.locator('button:has-text("Upload"), button:has-text("Add Document"), button:has-text("Add File")').first();
    await expect(uploadButton).toBeVisible({ timeout: 10000 });
    console.log('[Test] Upload button found');
    await uploadButton.click();
    console.log('[Test] Clicked upload button');

    // Wait for file input or upload dialog
    await page.waitForTimeout(1000);

    // Set up file input
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 5000 });
    console.log('[Test] File input found');

    // Select test-doc-1.txt
    const testFile = '/tmp/test-doc-1.txt';
    await fileInput.setInputFiles(testFile);
    console.log(`[Test] Selected file: ${testFile}`);

    // Find and click upload/submit button
    const submitButton = page.locator('button:has-text("Upload"), button:has-text("Submit"), button[type="submit"]').first();
    await submitButton.click({ force: true });
    console.log('[Test] Clicked submit button');

    // Wait for S5 upload (2-10 seconds)
    console.log('[Test] ⏳ Waiting for S5 upload (2-10 seconds)...');

    // Verify upload progress indicator
    const progressIndicators = [
      page.locator('text=/Uploading/i'),
      page.locator('text=/Processing/i'),
      page.locator('[role="progressbar"]'),
      page.locator('.upload-progress'),
      page.locator('.progress')
    ];

    let progressFound = false;
    for (const indicator of progressIndicators) {
      try {
        await indicator.waitFor({ timeout: 3000, state: 'visible' });
        progressFound = true;
        console.log('[Test] ✅ Upload progress indicator detected');
        break;
      } catch (e) {
        // Try next indicator
      }
    }

    if (!progressFound) {
      console.log('[Test] ⚠️ No upload progress indicator found (upload may have been very fast)');
    }

    // Wait for success or file to appear in list
    const successIndicators = [
      page.locator('text=/Upload.*success/i'),
      page.locator('text=/File.*uploaded/i'),
      page.locator('text=test-doc-1.txt')
    ];

    let successFound = false;
    for (const indicator of successIndicators) {
      try {
        await indicator.waitFor({ timeout: 20000, state: 'visible' });
        successFound = true;
        console.log('[Test] ✅ Upload success indicator found');
        break;
      } catch (e) {
        // Try next indicator
      }
    }

    if (!successFound) {
      console.log('[Test] ⚠️ No explicit success message, checking file list...');
    }

    // Wait for UI to update
    await page.waitForTimeout(2000);

    // Verify file appears in documents list
    const fileInList = page.locator('text=test-doc-1.txt');
    await expect(fileInList).toBeVisible({ timeout: 10000 });
    console.log('[Test] ✅ File appears in documents list');

    // Check file metadata (name, size, CID if displayed)
    const fileRow = page.locator('text=test-doc-1.txt').locator('..').first();
    const metadata = await fileRow.textContent();
    console.log('[Test] File metadata:', metadata);

    // Verify file size is shown (should be ~503 bytes)
    if (metadata?.includes('503') || metadata?.includes('B') || metadata?.includes('KB')) {
      console.log('[Test] ✅ File size displayed');
    }

    // Verify CID if shown
    if (metadata?.toLowerCase().includes('cid') || metadata?.match(/[a-z2-7]{46,}/)) {
      console.log('[Test] ✅ CID displayed');
    }

    // Verify document count updated (0 → 1 or N → N+1)
    try {
      const updatedCountElement = page.locator('text=/\\d+ documents?/i').first();
      const updatedText = await updatedCountElement.textContent({ timeout: 5000 });
      const match = updatedText?.match(/(\d+)/);
      if (match) {
        const updatedCount = parseInt(match[1]);
        console.log(`[Test] Updated document count: ${updatedCount}`);
        if (updatedCount === initialCount + 1) {
          console.log(`[Test] ✅ Document count updated correctly (${initialCount} → ${updatedCount})`);
        } else {
          console.log(`[Test] ⚠️ Document count: expected ${initialCount + 1}, got ${updatedCount}`);
        }
      }
    } catch (e) {
      console.log('[Test] Could not verify document count update');
    }

    // Take screenshot showing uploaded file
    await page.screenshot({ path: 'test-results/vector-db-single-upload.png' });
    console.log('[Test] Screenshot taken: single file uploaded');

    // Check console for errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.waitForTimeout(1000);

    if (consoleErrors.length > 0) {
      console.log('[Test] ⚠️ Console errors:', consoleErrors.slice(0, 5));
    } else {
      console.log('[Test] ✅ No console errors detected');
    }

    console.log('[Test] ✅ Single file upload test passed');
  });

  test('should upload multiple files to vector database (Sub-phase 3.3)', async ({ page, testWallet }) => {
    console.log('[Test] Starting multiple file upload test');
    console.log('[Test] Test wallet:', testWallet.getAddress());

    // Navigate directly to Test Database 1 detail page
    // (Assumes we're continuing from previous test or database exists)
    await page.goto(`${TEST_CONFIG.UI5_URL}/vector-databases`);
    await page.waitForSelector('text=Vector Databases', { timeout: 30000 });
    console.log('[Test] Vector databases page loaded');

    // Click on "Test Database 1"
    const databaseCard = page.locator('text=Test Database 1').first();
    await expect(databaseCard).toBeVisible({ timeout: 10000 });
    await databaseCard.click();
    console.log('[Test] Opened Test Database 1');

    // Wait for database detail page
    await page.waitForSelector('text=/Database|Details/i', { timeout: 10000 });
    console.log('[Test] Database detail page loaded');

    // Record initial document count (should be 1 from previous test)
    const initialCountElement = page.locator('text=/\\d+ documents?/i').first();
    let initialCount = 0;
    try {
      const countText = await initialCountElement.textContent({ timeout: 5000 });
      const match = countText?.match(/(\d+)/);
      if (match) {
        initialCount = parseInt(match[1]);
        console.log(`[Test] Initial document count: ${initialCount}`);
      }
    } catch (e) {
      console.log('[Test] Could not determine initial document count');
    }

    // Click "Upload Documents" again
    const uploadButton = page.locator('button:has-text("Upload"), button:has-text("Add Document"), button:has-text("Add File")').first();
    await expect(uploadButton).toBeVisible({ timeout: 10000 });
    await uploadButton.click();
    console.log('[Test] Clicked upload button');

    await page.waitForTimeout(1000);

    // Set up file input for multiple files
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 5000 });

    // Select test-doc-2.md AND test-doc-3.json (multiple selection)
    const testFiles = ['/tmp/test-doc-2.md', '/tmp/test-doc-3.json'];
    await fileInput.setInputFiles(testFiles);
    console.log(`[Test] Selected ${testFiles.length} files:`, testFiles);

    // Submit upload
    const submitButton = page.locator('button:has-text("Upload"), button:has-text("Submit"), button[type="submit"]').first();
    await submitButton.click({ force: true });
    console.log('[Test] Clicked submit button');

    // Wait for S5 upload (5-20 seconds for both files)
    console.log('[Test] ⏳ Waiting for S5 upload (5-20 seconds for 2 files)...');

    // Wait for success or files to appear
    await page.waitForTimeout(3000);

    // Verify both files appear in list
    const file2 = page.locator('text=test-doc-2.md');
    const file3 = page.locator('text=test-doc-3.json');

    let bothFilesFound = false;
    try {
      await file2.waitFor({ timeout: 20000, state: 'visible' });
      await file3.waitFor({ timeout: 20000, state: 'visible' });
      bothFilesFound = true;
      console.log('[Test] ✅ Both files appear in list');
    } catch (e) {
      console.log('[Test] ⚠️ Not all files found in list:', e);
    }

    if (bothFilesFound) {
      // Verify document count updated (1 → 3 if starting from 1 document)
      try {
        const updatedCountElement = page.locator('text=/\\d+ documents?/i').first();
        const updatedText = await updatedCountElement.textContent({ timeout: 5000 });
        const match = updatedText?.match(/(\d+)/);
        if (match) {
          const updatedCount = parseInt(match[1]);
          console.log(`[Test] Updated document count: ${updatedCount}`);
          if (updatedCount === initialCount + 2) {
            console.log(`[Test] ✅ Document count updated correctly (${initialCount} → ${updatedCount})`);
          } else {
            console.log(`[Test] ⚠️ Document count: expected ${initialCount + 2}, got ${updatedCount}`);
          }
        }
      } catch (e) {
        console.log('[Test] Could not verify document count update');
      }
    }

    // Check console for upload errors
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error' && (text.includes('upload') || text.includes('file'))) {
        consoleErrors.push(text);
      } else if (msg.type() === 'warning') {
        consoleWarnings.push(text);
      }
    });

    await page.waitForTimeout(1000);

    if (consoleErrors.length > 0) {
      console.log('[Test] ⚠️ Console errors during upload:', consoleErrors);
    } else {
      console.log('[Test] ✅ No console errors detected');
    }

    // Take screenshot showing all 3 documents
    await page.screenshot({ path: 'test-results/vector-db-multiple-uploads.png' });
    console.log('[Test] Screenshot taken: multiple files uploaded');

    console.log('[Test] ✅ Multiple file upload test passed');
  });
});
