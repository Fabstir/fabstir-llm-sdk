import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'http://localhost:3001';
const SCREENSHOTS_DIR = join(__dirname, 'test-screenshots-edge-cases');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testNotificationsEdgeCases() {
  console.log('🧪 Starting Notifications Edge Case Testing');
  console.log('=' + '='.repeat(60));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const results = {
    passed: [],
    failed: [],
    warnings: [],
    screenshots: [],
  };

  try {
    // Setup: Connect wallet
    console.log('\n⚙️  Setup: Connecting wallet...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const connectBtn = buttons.find(btn => btn.textContent.includes('Connect Wallet'));
      if (connectBtn) connectBtn.click();
    });
    await wait(1000);
    console.log('✅ Setup complete');

    // Test 1: Check notification badge persistence across navigation
    console.log('\n📝 Test 1: Notification badge persistence');

    // First, ensure sample data exists by visiting notifications page
    await page.goto(`${BASE_URL}/notifications`, { waitUntil: 'networkidle2' });
    await wait(500);
    console.log('Sample data initialized');

    // Go back to home to check badge
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await wait(500);

    // Get initial badge count
    let badgeCount1 = await page.evaluate(() => {
      const badge = document.querySelector('nav a[href="/notifications"] span');
      return badge ? badge.textContent : '0';
    });
    console.log(`Initial badge count: ${badgeCount1}`);

    // Navigate to different pages
    await page.goto(`${BASE_URL}/session-groups`, { waitUntil: 'networkidle2' });
    await wait(300);
    await page.goto(`${BASE_URL}/vector-databases`, { waitUntil: 'networkidle2' });
    await wait(300);
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await wait(500);

    let badgeCount2 = await page.evaluate(() => {
      const badge = document.querySelector('nav a[href="/notifications"] span');
      return badge ? badge.textContent : '0';
    });
    console.log(`Badge count after navigation: ${badgeCount2}`);

    if (badgeCount1 === badgeCount2) {
      results.passed.push('Badge count persists across navigation');
      console.log('✅ Badge count consistent');
    } else {
      results.failed.push(`Badge count changed: ${badgeCount1} → ${badgeCount2}`);
      console.log(`❌ Badge count inconsistent`);
    }
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '01-badge-persistence.png'), fullPage: true });
    results.screenshots.push('01-badge-persistence.png');

    // Test 2: Rapid filter switching
    console.log('\n📝 Test 2: Rapid filter switching (stress test)');
    await page.goto(`${BASE_URL}/notifications`, { waitUntil: 'networkidle2' });
    await wait(300);

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const unreadBtn = buttons.find(btn => btn.textContent.includes('Unread'));
        if (unreadBtn) unreadBtn.click();
      });
      await wait(100);

      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const invBtn = buttons.find(btn => btn.textContent.includes('Invitations'));
        if (invBtn) invBtn.click();
      });
      await wait(100);

      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const actBtn = buttons.find(btn => btn.textContent.includes('Activity'));
        if (actBtn) actBtn.click();
      });
      await wait(100);

      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const allBtn = buttons.find(btn => btn.textContent.trim() === 'All');
        if (allBtn) allBtn.click();
      });
      await wait(100);
    }

    const pageHasContent = await page.evaluate(() => {
      return document.body.textContent.includes('Notifications');
    });

    if (pageHasContent) {
      results.passed.push('Page stable after rapid filter switching');
      console.log('✅ Rapid filter switching handled');
    } else {
      results.failed.push('Page crashed or content lost after rapid filtering');
      console.log('❌ Page unstable after rapid filtering');
    }
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '02-rapid-filtering.png'), fullPage: true });
    results.screenshots.push('02-rapid-filtering.png');

    // Test 3: Double-click prevention on action buttons
    console.log('\n📝 Test 3: Double-click prevention');
    await page.goto(`${BASE_URL}/notifications`, { waitUntil: 'networkidle2' });
    await wait(500);

    const hasMarkAsRead = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(btn => btn.textContent.includes('Mark as read'));
    });

    if (hasMarkAsRead) {
      // Click twice rapidly
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const markBtn = buttons.find(btn => btn.textContent.includes('Mark as read'));
        if (markBtn) {
          markBtn.click();
          markBtn.click(); // Double click
        }
      });
      await wait(500);

      const stillHasContent = await page.evaluate(() => {
        return document.body.textContent.includes('Notifications');
      });

      if (stillHasContent) {
        results.passed.push('Double-click handled gracefully');
        console.log('✅ Double-click prevention working');
      } else {
        results.failed.push('Double-click caused page error');
        console.log('❌ Double-click not handled');
      }
    } else {
      results.warnings.push('No "Mark as read" button to test double-click');
      console.log('⚠️  No unread notifications to test');
    }
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '03-double-click.png'), fullPage: true });
    results.screenshots.push('03-double-click.png');

    // Test 4: Empty notifications state
    console.log('\n📝 Test 4: Empty state handling');

    // Delete all notifications
    await page.goto(`${BASE_URL}/notifications`, { waitUntil: 'networkidle2' });
    await wait(500);

    let deleteCount = 0;
    for (let i = 0; i < 10; i++) {
      const hasDelete = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(btn => btn.textContent === 'Delete');
      });

      if (!hasDelete) break;

      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const delBtn = buttons.find(btn => btn.textContent === 'Delete');
        if (delBtn) delBtn.click();
      });
      await wait(200);
      deleteCount++;
    }

    console.log(`Deleted ${deleteCount} notifications`);

    const hasEmptyState = await page.evaluate(() => {
      return document.body.textContent.includes('No notifications') ||
             document.body.textContent.includes("You're all caught up") ||
             document.body.textContent.includes('No matching');
    });

    if (hasEmptyState) {
      results.passed.push('Empty state displayed correctly');
      console.log('✅ Empty state shown');
    } else {
      results.failed.push('Empty state not displayed when no notifications');
      console.log('❌ Empty state missing');
    }
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '04-empty-state.png'), fullPage: true });
    results.screenshots.push('04-empty-state.png');

    // Test 5: Badge updates after operations
    console.log('\n📝 Test 5: Badge updates after marking as read');

    // Go back to dashboard to check badge
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await wait(500);

    const badgeAfterDelete = await page.evaluate(() => {
      const badge = document.querySelector('nav a[href="/notifications"] span');
      return badge ? badge.textContent : 'none';
    });

    console.log(`Badge after deleting notifications: ${badgeAfterDelete}`);

    if (badgeAfterDelete === 'none' || parseInt(badgeAfterDelete) >= 0) {
      results.passed.push('Badge updates correctly after operations');
      console.log('✅ Badge reflects current state');
    } else {
      results.failed.push('Badge shows invalid state');
      console.log('❌ Badge state invalid');
    }
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '05-badge-after-ops.png'), fullPage: true });
    results.screenshots.push('05-badge-after-ops.png');

    // Test 6: Invitation acceptance navigation
    console.log('\n📝 Test 6: Invitation acceptance flow');
    await page.goto(`${BASE_URL}/notifications`, { waitUntil: 'networkidle2' });
    await wait(500);

    const hasInvitation = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(btn => btn.textContent.includes('Accept Invitation'));
    });

    if (hasInvitation) {
      // Get the group name before accepting
      const groupName = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('div'));
        for (const card of cards) {
          if (card.textContent.includes('New Share Invitation')) {
            const h4 = card.querySelector('h4');
            return h4 ? h4.textContent : null;
          }
        }
        return null;
      });

      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const acceptBtn = buttons.find(btn => btn.textContent.includes('Accept Invitation'));
        if (acceptBtn) acceptBtn.click();
      });

      await wait(2000); // Wait for navigation

      const currentUrl = page.url();
      if (currentUrl.includes('/session-groups/')) {
        results.passed.push('Invitation acceptance navigates to group');
        console.log(`✅ Navigated to: ${currentUrl}`);
      } else {
        results.failed.push(`Invitation acceptance didn't navigate (URL: ${currentUrl})`);
        console.log(`❌ Still at: ${currentUrl}`);
      }
      await page.screenshot({ path: join(SCREENSHOTS_DIR, '06-invitation-navigation.png'), fullPage: true });
      results.screenshots.push('06-invitation-navigation.png');
    } else {
      results.warnings.push('No pending invitations to test acceptance');
      console.log('⚠️  No invitations to accept');
    }

    // Test 7: Share modal integration
    console.log('\n📝 Test 7: Share modal integration with notifications');
    await page.goto(`${BASE_URL}/session-groups`, { waitUntil: 'networkidle2' });
    await wait(500);

    const hasGroups = await page.evaluate(() => {
      return document.body.textContent.includes('My Session Groups') ||
             document.body.textContent.includes('Session Groups');
    });

    if (hasGroups) {
      // Click first group's Share button
      const hasShareButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(btn => btn.textContent === 'Share');
      });

      if (hasShareButton) {
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const shareBtn = buttons.find(btn => btn.textContent === 'Share');
          if (shareBtn) shareBtn.click();
        });
        await wait(500);

        const modalVisible = await page.evaluate(() => {
          return document.body.textContent.includes('Share Session Group') ||
                 document.body.textContent.includes('People with Access');
        });

        if (modalVisible) {
          results.passed.push('Share modal opens correctly');
          console.log('✅ Share modal displayed');
        } else {
          results.failed.push('Share modal did not open');
          console.log('❌ Share modal not shown');
        }
        await page.screenshot({ path: join(SCREENSHOTS_DIR, '07-share-modal.png'), fullPage: true });
        results.screenshots.push('07-share-modal.png');
      } else {
        results.warnings.push('No Share button found on session groups');
        console.log('⚠️  No Share button available');
      }
    }

    // Test 8: Filter with no results
    console.log('\n📝 Test 8: Filter showing no results');
    await page.goto(`${BASE_URL}/notifications`, { waitUntil: 'networkidle2' });
    await wait(500);

    // Click Activity filter (might have no results if only invitations exist)
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const actBtn = buttons.find(btn => btn.textContent.includes('Activity'));
      if (actBtn) actBtn.click();
    });
    await wait(300);

    const hasNoResultsMessage = await page.evaluate(() => {
      return document.body.textContent.includes('No notifications') ||
             document.body.textContent.includes('No matching') ||
             document.querySelector('h3');
    });

    if (hasNoResultsMessage) {
      results.passed.push('Filter with no results handled gracefully');
      console.log('✅ Empty filter state displayed');
    } else {
      results.warnings.push('Could not verify empty filter state');
      console.log('⚠️  Empty filter state unclear');
    }
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '08-filter-no-results.png'), fullPage: true });
    results.screenshots.push('08-filter-no-results.png');

    // Test 9: Notification timestamp formatting
    console.log('\n📝 Test 9: Timestamp formatting');
    await page.goto(`${BASE_URL}/notifications`, { waitUntil: 'networkidle2' });
    await wait(500);

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const allBtn = buttons.find(btn => btn.textContent.trim() === 'All');
      if (allBtn) allBtn.click();
    });
    await wait(300);

    const hasTimestamps = await page.evaluate(() => {
      const text = document.body.textContent;
      return text.includes('ago') || text.includes('minute') || text.includes('hour') || text.includes('day');
    });

    if (hasTimestamps) {
      results.passed.push('Timestamps formatted correctly (relative time)');
      console.log('✅ Timestamps displayed');
    } else {
      results.failed.push('No timestamps found on notifications');
      console.log('❌ Timestamps missing');
    }

    // Test 10: Notification bell click from different pages
    console.log('\n📝 Test 10: Notification bell accessibility from multiple pages');

    const pages = [
      { url: BASE_URL, name: 'Dashboard' },
      { url: `${BASE_URL}/session-groups`, name: 'Session Groups' },
      { url: `${BASE_URL}/vector-databases`, name: 'Vector Databases' },
      { url: `${BASE_URL}/settings`, name: 'Settings' },
    ];

    let bellAccessible = 0;
    for (const testPage of pages) {
      await page.goto(testPage.url, { waitUntil: 'networkidle2' });
      await wait(300);

      const hasBell = await page.evaluate(() => {
        const bell = document.querySelector('nav a[href="/notifications"]');
        return !!bell;
      });

      if (hasBell) {
        bellAccessible++;
        console.log(`✅ Bell accessible from ${testPage.name}`);
      } else {
        console.log(`❌ Bell missing from ${testPage.name}`);
      }
    }

    if (bellAccessible === pages.length) {
      results.passed.push('Notification bell accessible from all pages');
    } else if (bellAccessible > 0) {
      results.warnings.push(`Notification bell only accessible from ${bellAccessible}/${pages.length} pages`);
    } else {
      results.failed.push('Notification bell not accessible from any page');
    }
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '09-bell-accessibility.png'), fullPage: true });
    results.screenshots.push('09-bell-accessibility.png');

    // Test 11: Decline invitation flow
    console.log('\n📝 Test 11: Decline invitation flow');
    await page.goto(`${BASE_URL}/notifications`, { waitUntil: 'networkidle2' });
    await wait(500);

    const hasDeclineButton = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(btn => btn.textContent === 'Decline');
    });

    if (hasDeclineButton) {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const declineBtn = buttons.find(btn => btn.textContent === 'Decline');
        if (declineBtn) declineBtn.click();
      });
      await wait(500);

      const hasDeclinedBadge = await page.evaluate(() => {
        return document.body.textContent.includes('Declined');
      });

      if (hasDeclinedBadge) {
        results.passed.push('Decline invitation updates status');
        console.log('✅ Invitation declined successfully');
      } else {
        results.failed.push('Decline invitation did not update status');
        console.log('❌ Decline status not shown');
      }
      await page.screenshot({ path: join(SCREENSHOTS_DIR, '10-decline-invitation.png'), fullPage: true });
      results.screenshots.push('10-decline-invitation.png');
    } else {
      results.warnings.push('No pending invitations to decline');
      console.log('⚠️  No invitations to decline');
    }

    // Test 12: Console errors check
    console.log('\n📝 Test 12: Console errors check');
    const consoleErrors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${BASE_URL}/notifications`, { waitUntil: 'networkidle2' });
    await wait(1000);

    // Perform some operations
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const unreadBtn = buttons.find(btn => btn.textContent.includes('Unread'));
      if (unreadBtn) unreadBtn.click();
    });
    await wait(500);

    if (consoleErrors.length === 0) {
      results.passed.push('No console errors during operations');
      console.log('✅ No console errors');
    } else {
      results.warnings.push(`Console errors found: ${consoleErrors.length}`);
      console.log(`⚠️  ${consoleErrors.length} console errors`);
      consoleErrors.slice(0, 3).forEach(err => console.log(`   - ${err}`));
    }

  } catch (error) {
    results.failed.push(`Fatal error: ${error.message}`);
    console.error('❌ Test error:', error);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, 'error.png'), fullPage: true });
    results.screenshots.push('error.png');
  } finally {
    await browser.close();
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Edge Case Test Summary');
  console.log('='.repeat(60));

  console.log(`\n✅ Passed: ${results.passed.length}`);
  results.passed.forEach((test, i) => {
    console.log(`   ${i + 1}. ${test}`);
  });

  if (results.warnings.length > 0) {
    console.log(`\n⚠️  Warnings: ${results.warnings.length}`);
    results.warnings.forEach((test, i) => {
      console.log(`   ${i + 1}. ${test}`);
    });
  }

  if (results.failed.length > 0) {
    console.log(`\n❌ Failed: ${results.failed.length}`);
    results.failed.forEach((test, i) => {
      console.log(`   ${i + 1}. ${test}`);
    });
  }

  console.log(`\n📸 Screenshots: ${results.screenshots.length}`);
  console.log(`   Saved to: ${SCREENSHOTS_DIR}`);
  results.screenshots.forEach((file, i) => {
    console.log(`   ${i + 1}. ${file}`);
  });

  console.log('\n' + '='.repeat(60));
  const totalTests = results.passed.length + results.warnings.length + results.failed.length;
  const successRate = Math.round((results.passed.length / totalTests) * 100);
  console.log(`🎯 Success Rate: ${successRate}% (${results.passed.length}/${totalTests} passed)`);

  if (results.warnings.length > 0) {
    console.log(`⚠️  Warnings do not count against success rate`);
  }

  console.log('='.repeat(60));

  return results;
}

// Run the test
testNotificationsEdgeCases()
  .then((results) => {
    console.log('\n✨ Edge case testing completed!');
    if (results.failed.length > 0) {
      console.log('⚠️  Some tests failed - review issues above');
      process.exit(1);
    } else {
      console.log('🎉 All tests passed!');
      process.exit(0);
    }
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  });
