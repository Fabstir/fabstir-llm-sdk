/**
 * Phase 3.5: Remove Group Document
 *
 * Tests document removal from session groups with confirmation dialog
 */

const { chromium } = require('playwright');

async function testRemoveDocument() {
  console.log('🚀 Starting Phase 3.5: Remove Group Document Test\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error' || text.includes('[Mock]') || text.includes('BUG')) {
      console.log(`  Browser: [${msg.type()}] ${text}`);
    }
  });

  page.on('pageerror', error => {
    console.error(`  ❌ Page error: ${error.message}`);
  });

  let testsPassed = 0;
  let testsFailed = 0;
  const screenshots = [];

  try {
    console.log('📋 Phase 3.5: Remove Group Document\n');

    // ============================================================
    // STEP 1: Navigate and Connect Wallet
    // ============================================================
    console.log('Step 1: Navigate to session groups page...');
    await page.goto('http://localhost:3001/session-groups', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log('Step 2: Connect wallet...');
    const connectButton = await page.waitForSelector('button:has-text("Connect Wallet")', { timeout: 5000 });
    await connectButton.click();
    await page.waitForTimeout(3000);

    const groupCount = await page.locator('text="Session Groups"').count();
    if (groupCount > 0) {
      console.log('  ✅ Wallet connected and session groups loaded');
      testsPassed++;
    }

    const screenshotPath1 = '/workspace/test-screenshots/phase3-5-01-session-groups.png';
    await page.screenshot({ path: screenshotPath1, fullPage: true });
    screenshots.push(screenshotPath1);

    // ============================================================
    // STEP 3: Select Engineering Project (has 3 documents)
    // ============================================================
    console.log('\nStep 3: Select "Engineering Project" group...');

    const groupName = 'Engineering Project';

    const groupCard = await page.locator(`text="${groupName}"`).first();
    const cardExists = await groupCard.count() > 0;

    if (!cardExists) {
      console.log(`  ❌ Group "${groupName}" not found`);
      testsFailed++;
      throw new Error(`Group "${groupName}" not found`);
    }

    console.log(`  ✅ Found "${groupName}" group`);
    testsPassed++;

    await groupCard.click();
    await page.waitForTimeout(2000);

    const screenshotPath2 = '/workspace/test-screenshots/phase3-5-02-group-detail.png';
    await page.screenshot({ path: screenshotPath2, fullPage: true });
    screenshots.push(screenshotPath2);

    // ============================================================
    // STEP 4: Upload Test Documents
    // ============================================================
    console.log('\nStep 4: Upload test documents...');

    const groupDocsSection = await page.locator('text="Group Documents"').count();
    if (groupDocsSection > 0) {
      console.log('  ✅ Group Documents section found');
      testsPassed++;
    } else {
      console.log('  ❌ Group Documents section not found');
      testsFailed++;
    }

    // Check if documents already exist
    let documentCards = await page.locator('.border').filter({ hasText: 'KB' }).count();
    console.log(`  📄 Currently ${documentCards} documents in group`);

    // If no documents, upload some for testing
    if (documentCards === 0) {
      console.log('  📤 Uploading test documents...');

      // Find the file input
      const fileInput = await page.locator('input[type="file"]').first();

      // Create test files in /tmp
      const fs = require('fs');
      const testFiles = [
        '/tmp/test-doc-phase3-5-1.txt',
        '/tmp/test-doc-phase3-5-2.md',
        '/tmp/test-doc-phase3-5-3.pdf'
      ];

      // Create mock file content
      fs.writeFileSync(testFiles[0], 'Test document 1 content for Phase 3.5');
      fs.writeFileSync(testFiles[1], '# Test Markdown\n\nTest document 2 for Phase 3.5');
      fs.writeFileSync(testFiles[2], 'Mock PDF content for Phase 3.5');

      // Upload all files at once
      await fileInput.setInputFiles(testFiles);
      await page.waitForTimeout(3000); // Wait for upload processing

      documentCards = await page.locator('.border').filter({ hasText: 'KB' }).count();

      if (documentCards > 0) {
        console.log(`  ✅ Uploaded ${documentCards} test documents`);
        testsPassed++;
      } else {
        console.log('  ❌ Failed to upload documents');
        testsFailed++;
      }

      const screenshotPath2b = '/workspace/test-screenshots/phase3-5-02b-after-upload.png';
      await page.screenshot({ path: screenshotPath2b, fullPage: true });
      screenshots.push(screenshotPath2b);
    }

    // ============================================================
    // STEP 5: Test Remove with Cancel
    // ============================================================
    console.log('\nStep 5: Test remove with CANCEL...');

    // Set up dialog handler to DISMISS (Cancel) the confirmation
    let dialogAppeared = false;
    let dialogMessage = '';

    page.once('dialog', async dialog => {
      dialogAppeared = true;
      dialogMessage = dialog.message();
      console.log(`  📋 Confirmation dialog: "${dialogMessage}"`);
      await dialog.dismiss(); // Click Cancel
      console.log('  ✅ Clicked Cancel on confirmation dialog');
    });

    // Find the first document's remove button
    // The X button is in the document card with opacity-0 group-hover:opacity-100
    const firstDocCard = await page.locator('.border').filter({ hasText: 'KB' }).first();

    // Hover over the card to make the X button visible
    await firstDocCard.hover();
    await page.waitForTimeout(500);

    // Find and click the X button (last button in the card)
    const removeButton = await firstDocCard.locator('button').last();
    await removeButton.click();
    await page.waitForTimeout(1000);

    if (dialogAppeared) {
      console.log('  ✅ Confirmation dialog appeared');
      testsPassed++;
    } else {
      console.log('  ❌ Confirmation dialog did not appear');
      testsFailed++;
    }

    const screenshotPath3 = '/workspace/test-screenshots/phase3-5-03-after-cancel.png';
    await page.screenshot({ path: screenshotPath3, fullPage: true });
    screenshots.push(screenshotPath3);

    // ============================================================
    // STEP 6: Verify Document Still Exists After Cancel
    // ============================================================
    console.log('\nStep 6: Verify documents unchanged after cancel...');

    const docsAfterCancel = await page.locator('.border').filter({ hasText: 'KB' }).count();
    if (docsAfterCancel === documentCards) {
      console.log(`  ✅ Document count unchanged (${documentCards} documents)`);
      testsPassed++;
    } else {
      console.log(`  ❌ Document count changed (${documentCards} → ${docsAfterCancel})`);
      testsFailed++;
    }

    // ============================================================
    // STEP 7: Remove Document (Confirm Deletion)
    // ============================================================
    console.log('\nStep 7: Remove document (confirm deletion)...');

    // Set up dialog handler to ACCEPT the confirmation
    page.once('dialog', async dialog => {
      console.log(`  📋 Confirmation dialog: "${dialog.message()}"`);
      await dialog.accept(); // Click OK
      console.log('  ✅ Clicked OK on confirmation dialog');
    });

    // Hover over the first document card again
    const firstDocCard2 = await page.locator('.border').filter({ hasText: 'KB' }).first();
    await firstDocCard2.hover();
    await page.waitForTimeout(500);

    // Find and click the X button
    const removeButton2 = await firstDocCard2.locator('button').last();
    await removeButton2.click();
    await page.waitForTimeout(2000);

    const screenshotPath4 = '/workspace/test-screenshots/phase3-5-04-after-delete.png';
    await page.screenshot({ path: screenshotPath4, fullPage: true });
    screenshots.push(screenshotPath4);

    // ============================================================
    // STEP 8: Verify Document Removed
    // ============================================================
    console.log('\nStep 8: Verify document removed...');

    const docsAfterDelete = await page.locator('.border').filter({ hasText: 'KB' }).count();
    const expectedCount = documentCards - 1;

    if (docsAfterDelete === expectedCount) {
      console.log(`  ✅ Document successfully removed (${documentCards} → ${docsAfterDelete})`);
      testsPassed++;
    } else {
      console.log(`  ❌ Document count incorrect (expected ${expectedCount}, got ${docsAfterDelete})`);
      testsFailed++;
    }

    // ============================================================
    // STEP 9: Verify No Empty State (Still Have Documents)
    // ============================================================
    console.log('\nStep 9: Verify remaining documents visible...');

    if (docsAfterDelete > 0) {
      console.log(`  ✅ ${docsAfterDelete} documents still visible`);
      testsPassed++;
    } else {
      console.log('  ⚠️  All documents removed');
    }

    const screenshotPath5 = '/workspace/test-screenshots/phase3-5-05-final-state.png';
    await page.screenshot({ path: screenshotPath5, fullPage: true });
    screenshots.push(screenshotPath5);

    // ============================================================
    // FINAL RESULTS
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 Phase 3.5: Remove Document - TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}`);
    console.log(`📸 Screenshots: ${screenshots.length}`);
    console.log('='.repeat(60));

    screenshots.forEach((path, i) => {
      console.log(`  ${i + 1}. ${path}`);
    });

    console.log('\n📝 Console Logs Summary:');
    const errorLogs = consoleLogs.filter(log => log.includes('[error]'));
    if (errorLogs.length > 0) {
      console.log(`  ❌ ${errorLogs.length} errors detected`);
      errorLogs.slice(0, 5).forEach(log => console.log(`     ${log}`));
    } else {
      console.log('  ✅ No console errors detected');
    }

    console.log('\n🎉 Phase 3.5 Testing Complete!\n');

    if (testsFailed === 0) {
      console.log('✅ ALL TESTS PASSED!\n');
      process.exit(0);
    } else {
      console.log('⚠️  Some tests failed - review results above\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error('Stack trace:', error.stack);

    try {
      const errorScreenshot = '/workspace/test-screenshots/phase3-5-ERROR.png';
      await page.screenshot({ path: errorScreenshot, fullPage: true });
      console.log(`📸 Error screenshot saved: ${errorScreenshot}`);
    } catch (screenshotError) {
      console.error('Failed to capture error screenshot:', screenshotError.message);
    }

    process.exit(1);
  } finally {
    await browser.close();
  }
}

// Run the test
testRemoveDocument();
