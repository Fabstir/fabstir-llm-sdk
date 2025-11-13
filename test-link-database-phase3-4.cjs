/**
 * Phase 3.4: Link Vector Database to Session Group
 *
 * Tests database linking and unlinking functionality
 */

const { chromium } = require('playwright');

async function testDatabaseLinking() {
  console.log('🚀 Starting Phase 3.4: Link Vector Database Test\n');

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
    console.log('📋 Phase 3.4: Link Vector Database to Session Group\n');

    // ============================================================
    // STEP 1: Navigate to Session Groups and Connect Wallet
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

    const screenshotPath1 = '/workspace/test-screenshots/phase3-4-01-session-groups.png';
    await page.screenshot({ path: screenshotPath1, fullPage: true });
    screenshots.push(screenshotPath1);

    // ============================================================
    // STEP 3: Select a Session Group
    // ============================================================
    console.log('\nStep 3: Select a session group...');

    const groupName = 'Personal Notes';

    // Find group card and click it
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

    const screenshotPath2 = '/workspace/test-screenshots/phase3-4-02-group-detail.png';
    await page.screenshot({ path: screenshotPath2, fullPage: true });
    screenshots.push(screenshotPath2);

    // ============================================================
    // STEP 4: Check Linked Databases Section Exists
    // ============================================================
    console.log('\nStep 4: Check Linked Databases section...');

    const linkedDbSection = await page.locator('text="Linked Databases"').count();
    if (linkedDbSection > 0) {
      console.log('  ✅ Linked Databases section found');
      testsPassed++;
    } else {
      console.log('  ❌ Linked Databases section not found');
      testsFailed++;
    }

    // ============================================================
    // STEP 5: Find and Click "+ Link Database" Button
    // ============================================================
    console.log('\nStep 5: Find and click "+ Link Database" button...');

    const linkButton = await page.locator('button:has-text("+ Link Database")').first();
    const buttonExists = await linkButton.count() > 0;

    if (!buttonExists) {
      console.log('  ❌ "+ Link Database" button not found');
      testsFailed++;
      throw new Error('Link Database button not found');
    }

    console.log('  ✅ Found "+ Link Database" button');
    testsPassed++;

    await linkButton.click();
    await page.waitForTimeout(1000);

    const screenshotPath3 = '/workspace/test-screenshots/phase3-4-03-modal-opened.png';
    await page.screenshot({ path: screenshotPath3, fullPage: true });
    screenshots.push(screenshotPath3);

    // ============================================================
    // STEP 6: Verify Modal Opened
    // ============================================================
    console.log('\nStep 6: Verify link database modal opened...');

    const modalTitle = await page.locator('text="Link Vector Database"').count();
    if (modalTitle > 0) {
      console.log('  ✅ Link database modal opened');
      testsPassed++;
    } else {
      console.log('  ❌ Modal did not open');
      testsFailed++;
    }

    // ============================================================
    // STEP 7: Select a Database to Link
    // ============================================================
    console.log('\nStep 7: Select a database to link...');

    const databaseName = 'api-documentation';

    // Find database in modal
    const dbOption = await page.locator(`text="${databaseName}"`).first();
    const dbExists = await dbOption.count() > 0;

    if (!dbExists) {
      console.log(`  ❌ Database "${databaseName}" not found in modal`);
      testsFailed++;
      throw new Error(`Database "${databaseName}" not found`);
    }

    console.log(`  ✅ Found "${databaseName}" database option`);
    testsPassed++;

    await dbOption.click();
    await page.waitForTimeout(2000);

    const screenshotPath4 = '/workspace/test-screenshots/phase3-4-04-after-link.png';
    await page.screenshot({ path: screenshotPath4, fullPage: true });
    screenshots.push(screenshotPath4);

    // ============================================================
    // STEP 8: Verify Database is Linked
    // ============================================================
    console.log('\nStep 8: Verify database is linked...');

    // Check that database now appears in Linked Databases section
    const linkedDbCard = await page.locator(`.border:has-text("${databaseName}")`).count();
    if (linkedDbCard > 0) {
      console.log(`  ✅ Database "${databaseName}" now appears in Linked Databases`);
      testsPassed++;
    } else {
      console.log(`  ❌ Database "${databaseName}" not found in Linked Databases`);
      testsFailed++;
    }

    // ============================================================
    // STEP 9: Test Unlink Database
    // ============================================================
    console.log('\nStep 9: Test unlinking database...');

    // Set up dialog handler to ACCEPT the confirmation
    page.once('dialog', async dialog => {
      console.log(`  📋 Confirmation dialog: "${dialog.message()}"`);
      await dialog.accept(); // Click OK
      console.log('  ✅ Clicked OK on confirmation dialog');
    });

    // Find the unlink button (X icon)
    const linkedDbsSection = await page.locator('text="Linked Databases"').locator('..').locator('..');
    const unlinkButton = await linkedDbsSection.locator(`text="${databaseName}"`).locator('..').locator('..').locator('button').last();

    // Hover to make button visible (it's opacity-0 group-hover:opacity-100)
    await unlinkButton.hover();
    await page.waitForTimeout(500);

    await unlinkButton.click();
    await page.waitForTimeout(2000);

    const screenshotPath5 = '/workspace/test-screenshots/phase3-4-05-after-unlink.png';
    await page.screenshot({ path: screenshotPath5, fullPage: true });
    screenshots.push(screenshotPath5);

    // ============================================================
    // STEP 10: Verify Database is Unlinked
    // ============================================================
    console.log('\nStep 10: Verify database is unlinked...');

    const stillLinked = await page.locator(`.border:has-text("${databaseName}")`).count();
    if (stillLinked === 0) {
      console.log(`  ✅ Database "${databaseName}" successfully unlinked`);
      testsPassed++;
    } else {
      console.log(`  ❌ Database "${databaseName}" still appears in Linked Databases`);
      testsFailed++;
    }

    // ============================================================
    // FINAL RESULTS
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 Phase 3.4: Link Database - TEST RESULTS');
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

    console.log('\n🎉 Phase 3.4 Testing Complete!\n');

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
      const errorScreenshot = '/workspace/test-screenshots/phase3-4-ERROR.png';
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
testDatabaseLinking();
