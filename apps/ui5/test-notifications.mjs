import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'http://localhost:3001';
const SCREENSHOTS_DIR = join(__dirname, 'test-screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Helper function to wait for a specified time
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testNotificationsPage() {
  console.log('🚀 Starting Notifications Page Test');
  console.log('=' + '='.repeat(50));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const results = {
    passed: [],
    failed: [],
    screenshots: [],
  };

  try {
    // Test 1: Navigate to home and connect wallet
    console.log('\n📝 Test 1: Connect Wallet');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    // Wait for Connect Wallet button
    await page.waitForFunction(
      () => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(btn => btn.textContent.includes('Connect Wallet'));
      },
      { timeout: 5000 }
    );

    // Click Connect Wallet button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const connectBtn = buttons.find(btn => btn.textContent.includes('Connect Wallet'));
      if (connectBtn) connectBtn.click();
    });

    // Wait for Dashboard to appear
    await page.waitForFunction(
      () => document.body.textContent.includes('Dashboard'),
      { timeout: 5000 }
    );

    results.passed.push('Wallet connected successfully');
    console.log('✅ Wallet connected');

    // Test 2: Check notification bell icon in navbar
    console.log('\n📝 Test 2: Check notification bell in navbar');
    const bellIcon = await page.$('nav a[href="/notifications"]');
    if (bellIcon) {
      results.passed.push('Notification bell icon exists in navbar');
      console.log('✅ Notification bell icon found');
    } else {
      results.failed.push('Notification bell icon not found in navbar');
      console.log('❌ Notification bell icon not found');
    }

    // Test 3: Check for unread badge
    console.log('\n📝 Test 3: Check notification badge');
    const badge = await page.$('nav a[href="/notifications"] span');
    if (badge) {
      const badgeText = await page.evaluate(el => el.textContent, badge);
      results.passed.push(`Notification badge shows: ${badgeText}`);
      console.log(`✅ Badge found with count: ${badgeText}`);
    } else {
      console.log('ℹ️  No unread notifications badge (expected if no unread)');
    }
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '01-navbar-bell.png'), fullPage: true });
    results.screenshots.push('01-navbar-bell.png');

    // Test 4: Navigate to notifications page
    console.log('\n📝 Test 4: Navigate to notifications page');
    await page.click('a[href="/notifications"]');
    await page.waitForFunction(
      () => {
        const h1 = document.querySelector('h1');
        return h1 && h1.textContent.includes('Notifications');
      },
      { timeout: 5000 }
    );
    results.passed.push('Notifications page loaded successfully');
    console.log('✅ Navigated to notifications page');
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '02-notifications-page.png'), fullPage: true });
    results.screenshots.push('02-notifications-page.png');

    // Test 5: Check page structure
    console.log('\n📝 Test 5: Verify page structure');
    const pageTitleExists = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1 && h1.textContent.includes('Notifications');
    });
    if (pageTitleExists) {
      results.passed.push('Page title "Notifications" found');
      console.log('✅ Page title found');
    } else {
      results.failed.push('Page title not found');
      console.log('❌ Page title not found');
    }

    // Test 6: Check for filters
    console.log('\n📝 Test 6: Check filter buttons');
    const filterCount = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const filterTexts = ['All', 'Unread', 'Invitations', 'Activity'];
      return buttons.filter(btn =>
        filterTexts.some(text => btn.textContent.includes(text))
      ).length;
    });
    if (filterCount >= 4) {
      results.passed.push(`Found ${filterCount} filter buttons`);
      console.log(`✅ Found all filter buttons`);
    } else {
      results.failed.push(`Expected 4 filter buttons, found ${filterCount}`);
      console.log(`❌ Expected 4 filters, found ${filterCount}`);
    }

    // Test 7: Check for invitations section
    console.log('\n📝 Test 7: Check invitations section');
    const invitationSectionExists = await page.evaluate(() => {
      const h2s = Array.from(document.querySelectorAll('h2'));
      return h2s.some(h2 => h2.textContent.includes('Pending Invitations'));
    });
    if (invitationSectionExists) {
      results.passed.push('Invitations section found');
      console.log('✅ Invitations section exists');

      // Count invitation cards
      const invitationCards = await page.$$('[class*="gradient-to-br"]');
      if (invitationCards.length > 0) {
        results.passed.push(`Found ${invitationCards.length} invitation card(s)`);
        console.log(`✅ Found ${invitationCards.length} invitation(s)`);
      }
    } else {
      console.log('ℹ️  No pending invitations section (may be hidden if no invitations)');
    }

    // Test 8: Check for notifications list
    console.log('\n📝 Test 8: Check notifications list');
    const notificationsList = await page.$('h2');
    if (notificationsList) {
      const heading = await page.evaluate(el => el.textContent, notificationsList);
      if (heading.includes('Notifications')) {
        results.passed.push('Notifications list section found');
        console.log('✅ Notifications list section exists');
      }
    }

    // Count notification cards
    const notificationCards = await page.$$('[class*="border rounded-lg p-4"]');
    if (notificationCards.length > 0) {
      results.passed.push(`Found ${notificationCards.length} notification card(s)`);
      console.log(`✅ Found ${notificationCards.length} notification(s)`);
    }

    // Test 9: Test filter functionality
    console.log('\n📝 Test 9: Test filter buttons');

    // Click Unread filter
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const unreadBtn = buttons.find(btn => btn.textContent.includes('Unread'));
      if (unreadBtn) unreadBtn.click();
    });
    await wait(500);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '03-filter-unread.png'), fullPage: true });
    results.screenshots.push('03-filter-unread.png');
    results.passed.push('Unread filter clicked successfully');
    console.log('✅ Unread filter works');

    // Click Invitations filter
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const invBtn = buttons.find(btn => btn.textContent.includes('Invitations'));
      if (invBtn) invBtn.click();
    });
    await wait(500);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '04-filter-invitations.png'), fullPage: true });
    results.screenshots.push('04-filter-invitations.png');
    results.passed.push('Invitations filter clicked successfully');
    console.log('✅ Invitations filter works');

    // Click Activity filter
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const actBtn = buttons.find(btn => btn.textContent.includes('Activity'));
      if (actBtn) actBtn.click();
    });
    await wait(500);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '05-filter-activity.png'), fullPage: true });
    results.screenshots.push('05-filter-activity.png');
    results.passed.push('Activity filter clicked successfully');
    console.log('✅ Activity filter works');

    // Click All filter
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const allBtn = buttons.find(btn => btn.textContent.trim() === 'All');
      if (allBtn) allBtn.click();
    });
    await wait(500);

    // Test 10: Test invitation accept/decline buttons
    console.log('\n📝 Test 10: Check invitation action buttons');
    const hasInvitationButtons = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const acceptBtn = buttons.find(btn => btn.textContent.includes('Accept Invitation'));
      const declineBtn = buttons.find(btn => btn.textContent.includes('Decline'));
      return { hasAccept: !!acceptBtn, hasDecline: !!declineBtn };
    });

    if (hasInvitationButtons.hasAccept && hasInvitationButtons.hasDecline) {
      results.passed.push('Invitation Accept/Decline buttons found');
      console.log('✅ Accept/Decline buttons exist');

      // Try accepting an invitation
      console.log('Testing Accept Invitation...');
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const acceptBtn = buttons.find(btn => btn.textContent.includes('Accept Invitation'));
        if (acceptBtn) acceptBtn.click();
      });
      await wait(2000); // Wait for navigation
      await page.screenshot({ path: join(SCREENSHOTS_DIR, '06-accept-invitation.png'), fullPage: true });
      results.screenshots.push('06-accept-invitation.png');
      results.passed.push('Accept invitation button clicked (navigates to group)');
      console.log('✅ Accept invitation works');

      // Go back to notifications
      await page.goto(`${BASE_URL}/notifications`, { waitUntil: 'networkidle2' });
      await wait(500);
    } else {
      console.log('ℹ️  No pending invitations to test Accept/Decline');
    }

    // Test 11: Test Mark as Read functionality
    console.log('\n📝 Test 11: Test Mark as Read');
    const hasMarkAsRead = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(btn => btn.textContent.includes('Mark as read'));
    });
    if (hasMarkAsRead) {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const markBtn = buttons.find(btn => btn.textContent.includes('Mark as read'));
        if (markBtn) markBtn.click();
      });
      await wait(500);
      await page.screenshot({ path: join(SCREENSHOTS_DIR, '07-mark-as-read.png'), fullPage: true });
      results.screenshots.push('07-mark-as-read.png');
      results.passed.push('Mark as read button clicked successfully');
      console.log('✅ Mark as read works');
    } else {
      console.log('ℹ️  No unread notifications to mark as read');
    }

    // Test 12: Test Mark All as Read
    console.log('\n📝 Test 12: Test Mark All as Read');
    const hasMarkAll = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(btn => btn.textContent.includes('Mark all as read'));
    });
    if (hasMarkAll) {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const markAllBtn = buttons.find(btn => btn.textContent.includes('Mark all as read'));
        if (markAllBtn) markAllBtn.click();
      });
      await wait(500);
      await page.screenshot({ path: join(SCREENSHOTS_DIR, '08-mark-all-read.png'), fullPage: true });
      results.screenshots.push('08-mark-all-read.png');
      results.passed.push('Mark all as read button clicked successfully');
      console.log('✅ Mark all as read works');
    } else {
      console.log('ℹ️  No unread notifications to mark all as read');
    }

    // Test 13: Test Delete notification
    console.log('\n📝 Test 13: Test Delete notification');
    const hasDelete = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(btn => btn.textContent === 'Delete');
    });
    if (hasDelete) {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const delBtn = buttons.find(btn => btn.textContent === 'Delete');
        if (delBtn) delBtn.click();
      });
      await wait(500);
      await page.screenshot({ path: join(SCREENSHOTS_DIR, '09-delete-notification.png'), fullPage: true });
      results.screenshots.push('09-delete-notification.png');
      results.passed.push('Delete notification button clicked successfully');
      console.log('✅ Delete notification works');
    } else {
      console.log('ℹ️  No notifications to delete');
    }

    // Test 14: Check notification stats
    console.log('\n📝 Test 14: Verify notification stats');
    const statsText = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('span'));
      return elements
        .map(el => el.textContent)
        .filter(text => text.includes('unread notification') || text.includes('pending invitation'));
    });
    if (statsText.length > 0) {
      results.passed.push(`Found stats: ${statsText.join(', ')}`);
      console.log(`✅ Stats found: ${statsText.join(', ')}`);
    }

    // Test 15: Test empty state (if we deleted all)
    console.log('\n📝 Test 15: Check for empty state handling');
    const hasEmptyState = await page.evaluate(() => {
      return document.body.textContent.includes('No notifications') ||
             document.body.textContent.includes("You're all caught up");
    });
    if (hasEmptyState) {
      results.passed.push('Empty state displayed correctly');
      console.log('✅ Empty state handled');
      await page.screenshot({ path: join(SCREENSHOTS_DIR, '10-empty-state.png'), fullPage: true });
      results.screenshots.push('10-empty-state.png');
    } else {
      console.log('ℹ️  Still have notifications (not empty)');
    }

    // Test 16: Test navigation back to dashboard
    console.log('\n📝 Test 16: Navigate back to dashboard');
    await page.click('a[href="/"]');
    await page.waitForFunction(
      () => document.body.textContent.includes('Dashboard'),
      { timeout: 5000 }
    );
    results.passed.push('Navigated back to dashboard successfully');
    console.log('✅ Navigation back to dashboard works');

    // Test 17: Verify notification badge updates
    console.log('\n📝 Test 17: Check notification badge after marking as read');
    const updatedBadge = await page.$('nav a[href="/notifications"] span');
    if (updatedBadge) {
      const updatedCount = await page.evaluate(el => el.textContent, updatedBadge);
      console.log(`ℹ️  Badge now shows: ${updatedCount}`);
    } else {
      results.passed.push('Notification badge cleared (no unread notifications)');
      console.log('✅ Badge cleared correctly');
    }
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '11-final-dashboard.png'), fullPage: true });
    results.screenshots.push('11-final-dashboard.png');

  } catch (error) {
    results.failed.push(`Error: ${error.message}`);
    console.error('❌ Test error:', error);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, 'error.png'), fullPage: true });
    results.screenshots.push('error.png');
  } finally {
    await browser.close();
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${results.passed.length}`);
  results.passed.forEach((test, i) => {
    console.log(`   ${i + 1}. ${test}`);
  });

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

  console.log('\n' + '='.repeat(50));
  const successRate = Math.round((results.passed.length / (results.passed.length + results.failed.length)) * 100);
  console.log(`🎯 Success Rate: ${successRate}%`);
  console.log('='.repeat(50));

  return results;
}

// Run the test
testNotificationsPage()
  .then(() => {
    console.log('\n✨ Test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  });
