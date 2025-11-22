/**
 * Debug Test: Verify Pending Status UI Implementation
 *
 * This test verifies that the pending embeddings UI is working:
 * 1. Upload document
 * 2. Capture browser console logs
 * 3. Check database.pendingDocuments in browser state
 * 4. Inspect DOM for badges
 * 5. Take detailed screenshots
 */
import { test, expect, TEST_CONFIG } from './lib/test-setup';
import fs from 'fs';

test.describe('Debug: Pending Status UI', () => {
  test('should verify pending status implementation', async ({ page, testWallet }) => {
    test.setTimeout(120000);

    console.log('\n[Debug] ========================================');
    console.log('[Debug] Verifying Pending Status UI Implementation');
    console.log('[Debug] ========================================\n');

    // Capture all console messages
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleMessages.push(`[${msg.type()}] ${text}`);

      // Log important messages immediately
      if (text.includes('pending') || text.includes('Document') || text.includes('Upload')) {
        console.log(`[Browser Console] ${text}`);
      }
    });

    // Navigate and connect
    await page.goto(TEST_CONFIG.UI5_URL);
    await page.waitForSelector('text=Dashboard', { timeout: 30000 });
    await page.waitForSelector('text=Disconnect', { timeout: 10000 });
    console.log('[Debug] ✅ Connected to UI5');

    // Go to vector databases
    await page.click('a[href="/vector-databases"]');
    await page.waitForSelector('text=Vector Databases', { timeout: 10000 });
    console.log('[Debug] ✅ Vector databases page loaded');

    // Open Test Database 1
    await page.click('text=Test Database 1');
    await page.waitForSelector('text=/Database|Details/i', { timeout: 10000 });
    console.log('[Debug] ✅ Database detail page loaded');

    // Take screenshot BEFORE upload
    await page.screenshot({ path: 'test-results/debug-before-upload.png' });

    // Check initial state
    const beforeHtml = await page.content();
    const beforeHasPending = beforeHtml.includes('Pending');
    console.log(`[Debug] Before upload - Has "Pending" in HTML: ${beforeHasPending}`);

    // Upload test document
    console.log('\n[Debug] === Uploading Document ===');

    const uploadButton = page.locator('button:has-text("Upload Documents")').first();
    await uploadButton.click();
    console.log('[Debug] Clicked Upload button');

    await page.waitForTimeout(1000);

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles('/tmp/test-doc-1.txt');
    console.log('[Debug] Selected file');

    const submitButton = page.locator('button:has-text("Upload"):has-text("File")').first();
    await submitButton.click();
    console.log('[Debug] Clicked submit');

    // Wait for upload to complete
    await page.waitForTimeout(3000);

    console.log('\n[Debug] === Checking Browser State ===');

    // Check if database state has pendingDocuments
    const databaseState = await page.evaluate(() => {
      // Try to access React state via window object
      const state: any = {
        hasDatabase: false,
        hasPendingDocuments: false,
        pendingCount: 0,
        pendingDocs: []
      };

      // Check if there's any global state
      if ((window as any).__REACT_STATE__) {
        state.reactState = (window as any).__REACT_STATE__;
      }

      return state;
    });

    console.log('[Debug] Browser state:', JSON.stringify(databaseState, null, 2));

    // Check DOM for pending badges
    console.log('\n[Debug] === Checking DOM for Badges ===');

    // Get all badge-like elements
    const allBadges = await page.locator('span[class*="badge"], span[class*="inline-flex"], span[class*="rounded"]').all();
    console.log(`[Debug] Found ${allBadges.length} badge-like elements`);

    for (let i = 0; i < Math.min(allBadges.length, 10); i++) {
      const text = await allBadges[i].textContent();
      const classes = await allBadges[i].getAttribute('class');
      console.log(`[Debug] Badge ${i + 1}: "${text}" (classes: ${classes?.substring(0, 50)}...)`);
    }

    // Check for specific "Pending" text
    const pendingText = page.locator('text=/pending/i');
    const pendingCount = await pendingText.count();
    console.log(`[Debug] Elements with "pending" text: ${pendingCount}`);

    if (pendingCount > 0) {
      for (let i = 0; i < Math.min(pendingCount, 5); i++) {
        const text = await pendingText.nth(i).textContent();
        console.log(`[Debug] Pending element ${i + 1}: "${text}"`);
      }
    }

    // Check for AlertTriangle icon
    const alertIcons = page.locator('svg').filter({ hasText: '' });
    const iconCount = await page.locator('svg').count();
    console.log(`[Debug] Total SVG icons found: ${iconCount}`);

    // Check file list
    console.log('\n[Debug] === Checking File List ===');

    const fileInList = page.locator('text=test-doc-1.txt');
    const fileExists = await fileInList.count();
    console.log(`[Debug] File "test-doc-1.txt" appears ${fileExists} times`);

    if (fileExists > 0) {
      const fileRow = fileInList.locator('..').first();
      const rowHtml = await fileRow.innerHTML();
      console.log(`[Debug] File row HTML (first 500 chars):\n${rowHtml.substring(0, 500)}`);

      // Check for status indicators near the file
      const hasYellow = rowHtml.includes('yellow');
      const hasPending = rowHtml.includes('pending') || rowHtml.includes('Pending');
      const hasAlert = rowHtml.includes('alert') || rowHtml.includes('Alert');

      console.log(`[Debug] Row contains yellow: ${hasYellow}`);
      console.log(`[Debug] Row contains "pending": ${hasPending}`);
      console.log(`[Debug] Row contains "alert": ${hasAlert}`);
    }

    // Take screenshot AFTER upload
    await page.screenshot({ path: 'test-results/debug-after-upload.png', fullPage: true });

    // Get full page HTML
    const afterHtml = await page.content();
    fs.writeFileSync('test-results/debug-page.html', afterHtml);
    console.log('[Debug] Saved full page HTML to test-results/debug-page.html');

    // Check for console errors
    const errors = consoleMessages.filter(msg => msg.startsWith('[error]'));
    console.log(`\n[Debug] Console errors: ${errors.length}`);
    if (errors.length > 0) {
      console.log('[Debug] Errors:', errors.slice(0, 5));
    }

    // Check for success messages
    const uploads = consoleMessages.filter(msg =>
      msg.includes('upload') || msg.includes('Upload') ||
      msg.includes('pending') || msg.includes('Document')
    );
    console.log(`\n[Debug] Upload-related messages: ${uploads.length}`);
    uploads.forEach(msg => console.log(`  ${msg}`));

    console.log('\n[Debug] ========================================');
    console.log('[Debug] Verification Complete');
    console.log('[Debug] ========================================\n');
  });
});
