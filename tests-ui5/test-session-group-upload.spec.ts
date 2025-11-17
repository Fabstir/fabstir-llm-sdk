/**
 * Phase 4.2: Upload Group Documents
 *
 * Tests document upload to session groups with S5 storage.
 *
 * Prerequisites:
 * - UI5 server running on port 3002
 * - Test wallet auto-connected (TEST_USER_1_PRIVATE_KEY)
 * - Session group exists (created in Phase 4.1)
 *
 * Expected Duration: 5-15 seconds (S5 upload)
 */

import { test, expect, TEST_CONFIG } from './lib/test-setup';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Phase 4.2: Upload Group Documents', () => {

  test('should upload document to session group', async ({ page, testWallet }) => {
    test.setTimeout(60000); // 60 seconds for S5 upload

    console.log('[Test] ========================================');
    console.log('[Test] Phase 4.2: Upload Group Documents');
    console.log('[Test] ========================================');

    // Step 1: Navigate to session groups page and find/create test group
    console.log('\n[Test] === STEP 1: Navigate to Session Groups ===');
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('[Test] Session groups page loaded');

    // Find "Test Project" group from Phase 4.1 (or any existing group)
    const testGroupLink = page.locator('a[href^="/session-groups/sg-"]').filter({ hasText: 'Test Project' }).first();
    const groupExists = await testGroupLink.count() > 0;

    let groupUrl = '';
    if (!groupExists) {
      console.log('[Test] "Test Project" not found, creating new group for test...');

      // Create new group
      const createButton = page.locator('button:has-text("Create Session Group")').first();
      await createButton.click();
      await page.waitForURL('**/session-groups/new', { timeout: 10000 });

      const nameInput = page.locator('input[name="name"], input[id="name"]').first();
      await nameInput.fill('Test Project');

      const submitButton = page.locator('button[type="submit"]').first();
      await submitButton.click();

      // Wait for redirect to group detail page
      await page.waitForURL(/\/session-groups\/sg-/, { timeout: 15000 });
      groupUrl = page.url();
      console.log('[Test] Created new group:', groupUrl);
    } else {
      // Click on existing group
      await testGroupLink.click();
      await page.waitForLoadState('networkidle');
      groupUrl = page.url();
      console.log('[Test] Navigated to existing group:', groupUrl);
    }

    // Step 2: Take screenshot of group detail page
    console.log('\n[Test] === STEP 2: Group Detail Page ===');
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'test-results/session-group-upload-initial.png',
      fullPage: true
    });
    console.log('[Test] Screenshot taken: group detail page');

    // Step 3: Find "Group Documents" section
    console.log('\n[Test] === STEP 3: Locate Group Documents Section ===');
    const groupDocsHeading = page.locator('h3:has-text("Group Documents")');
    await expect(groupDocsHeading).toBeVisible({ timeout: 5000 });
    console.log('[Test] ✅ "Group Documents" section found');

    // Get initial document count - select the card container, not just the heading row
    const documentsCard = page.locator('div.bg-white.rounded-lg:has(h3:has-text("Group Documents"))').first();
    const initialDocElements = documentsCard.locator('div.flex.items-center.gap-2.p-2').filter({ has: page.locator('p.text-sm.font-medium') });
    const initialCount = await initialDocElements.count();
    console.log(`[Test] Initial document count: ${initialCount}`);

    // Step 4: Click "+ Upload" button
    console.log('\n[Test] === STEP 4: Upload Document ===');
    const uploadButton = page.locator('button:has-text("Upload")').first();
    await expect(uploadButton).toBeVisible({ timeout: 5000 });
    console.log('[Test] Upload button found');

    // Prepare file upload
    const testFilePath = path.join(__dirname, 'test-data', 'test-doc-1.txt');

    // Set up file chooser handler before clicking
    const fileChooserPromise = page.waitForEvent('filechooser');
    await uploadButton.click();
    console.log('[Test] Clicked upload button');

    // Upload file
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([testFilePath]);
    console.log('[Test] Selected file: test-doc-1.txt');

    // Step 5: Wait for S5 upload to complete
    console.log('\n[Test] === STEP 5: Wait for S5 Upload ===');
    console.log('[Test] ⏳ Waiting for S5 upload (2-10 seconds)...');

    // Wait for "Uploading..." to appear and disappear
    await page.waitForSelector('button:has-text("Uploading...")', { timeout: 5000 }).catch(() => {
      console.log('[Test] ⚠️ "Uploading..." button not visible (upload may have been instant)');
    });

    // Wait for upload to complete (button text returns to "+ Upload")
    await page.waitForSelector('button:has-text("+ Upload")', { state: 'visible', timeout: 15000 });
    console.log('[Test] ✅ Upload completed');

    // Step 6: Verify document appears in list
    console.log('\n[Test] === STEP 6: Verify Document in List ===');

    // Wait for document to appear in the UI
    await expect(page.locator('p.text-sm.font-medium:has-text("test-doc-1.txt")').first()).toBeVisible({ timeout: 5000 });

    const newDocElements = documentsCard.locator('div.flex.items-center.gap-2.p-2').filter({ has: page.locator('p.text-sm.font-medium') });
    const newCount = await newDocElements.count();
    console.log(`[Test] Document count after upload: ${newCount}`);

    if (newCount <= initialCount) {
      throw new Error(`Document count did not increase! Before: ${initialCount}, After: ${newCount}`);
    }
    console.log('[Test] ✅ Document count increased');

    // Verify at least one document with this name exists (there may be multiple from previous test runs)
    const uploadedDoc = page.locator('p.text-sm.font-medium:has-text("test-doc-1.txt")').first();
    await expect(uploadedDoc).toBeVisible({ timeout: 5000 });
    console.log('[Test] ✅ Document "test-doc-1.txt" appears in list');

    // Step 7: Verify document metadata
    console.log('\n[Test] === STEP 7: Verify Document Metadata ===');

    // Find the document card container (use first() since there may be duplicates from previous test runs)
    const docCard = page.locator('div.flex.items-center.gap-2.p-2').filter({ has: page.locator('p.text-sm.font-medium:has-text("test-doc-1.txt")') }).first();
    await expect(docCard).toBeVisible();

    // Check for file size display (should show "XKB")
    const sizeText = docCard.locator('p.text-xs.text-gray-500');
    const sizeContent = await sizeText.textContent();
    console.log(`[Test] Document size: ${sizeContent}`);

    if (!sizeContent?.includes('KB')) {
      console.log('[Test] ⚠️ Size format unexpected, but continuing...');
    } else {
      console.log('[Test] ✅ Document size displayed correctly');
    }

    // Check for FileText icon
    const fileIcon = docCard.locator('svg').first();
    await expect(fileIcon).toBeVisible();
    console.log('[Test] ✅ Document icon displayed');

    // Step 8: Take final screenshot
    console.log('\n[Test] === STEP 8: Final Screenshot ===');
    await page.screenshot({
      path: 'test-results/session-group-upload-success.png',
      fullPage: true
    });
    console.log('[Test] Screenshot saved: test-results/session-group-upload-success.png');

    console.log('\n[Test] ========================================');
    console.log('[Test] ✅ Phase 4.2 Complete: Document uploaded successfully');
    console.log('[Test] ========================================');
  });

  test('should handle upload with empty file selection', async ({ page, testWallet }) => {
    console.log('[Test] ========================================');
    console.log('[Test] Phase 4.2 Edge Case: Empty File Selection');
    console.log('[Test] ========================================');

    // Navigate to a session group
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const firstGroup = page.locator('a[href^="/session-groups/sg-"]').first();
    const hasGroups = await firstGroup.count() > 0;

    if (!hasGroups) {
      console.log('[Test] ⚠️ No session groups found, skipping edge case test');
      test.skip();
      return;
    }

    await firstGroup.click();
    await page.waitForLoadState('networkidle');
    console.log('[Test] Navigated to session group');

    // Click upload button but cancel file selection
    const uploadButton = page.locator('button:has-text("Upload")').first();
    await expect(uploadButton).toBeVisible({ timeout: 5000 });

    const fileChooserPromise = page.waitForEvent('filechooser');
    await uploadButton.click();

    const fileChooser = await fileChooserPromise;
    // Cancel by not setting any files (equivalent to clicking cancel in dialog)
    await fileChooser.setFiles([]);
    console.log('[Test] Cancelled file selection');

    await page.waitForTimeout(500);

    // Verify upload button is still visible and ready
    await expect(uploadButton).toBeVisible();
    await expect(uploadButton).toHaveText(/Upload/);
    console.log('[Test] ✅ Upload button still functional after cancel');

    console.log('\n[Test] ========================================');
    console.log('[Test] ✅ Edge case test complete');
    console.log('[Test] ========================================');
  });
});
