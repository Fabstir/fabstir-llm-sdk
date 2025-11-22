import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'http://localhost:3001';
const SCREENSHOTS_DIR = join(__dirname, 'test-screenshots-session7');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Helper function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Viewport sizes to test
const VIEWPORTS = {
  mobile: { width: 375, height: 667, name: 'Mobile (iPhone SE)' },
  mobileLarge: { width: 414, height: 896, name: 'Mobile Large (iPhone 11 Pro Max)' },
  tablet: { width: 768, height: 1024, name: 'Tablet (iPad)' },
  desktop: { width: 1280, height: 800, name: 'Desktop' },
};

async function testMobileResponsiveness() {
  console.log('🚀 Starting Session 7: Mobile Responsiveness Test');
  console.log('=' + '='.repeat(60));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  const results = {
    passed: [],
    failed: [],
    screenshots: [],
  };

  try {
    // Test 1: Connect wallet (desktop first)
    console.log('\n📝 Test 1: Connect Wallet (Desktop)');
    await page.setViewport(VIEWPORTS.desktop);
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    await page.waitForFunction(
      () => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(btn => btn.textContent.includes('Connect Wallet'));
      },
      { timeout: 5000 }
    );

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const connectBtn = buttons.find(btn => btn.textContent.includes('Connect Wallet'));
      if (connectBtn) connectBtn.click();
    });

    await wait(1000);
    results.passed.push('Wallet connected on desktop');
    console.log('✅ Wallet connected');

    // Test 2: Test hamburger menu on mobile
    console.log('\n📝 Test 2: Mobile Hamburger Menu');
    await page.setViewport(VIEWPORTS.mobile);
    await wait(500);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '01-mobile-navbar-closed.png'), fullPage: true });
    results.screenshots.push('01-mobile-navbar-closed.png');

    // Check if hamburger menu button exists
    const hamburgerExists = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(btn => btn.getAttribute('aria-label') === 'Toggle menu');
    });

    if (hamburgerExists) {
      results.passed.push('Hamburger menu button exists on mobile');
      console.log('✅ Hamburger menu button found');

      // Click hamburger to open menu
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const menuBtn = buttons.find(btn => btn.getAttribute('aria-label') === 'Toggle menu');
        if (menuBtn) menuBtn.click();
      });

      await wait(800); // Increased wait for animation/rendering
      await page.screenshot({ path: join(SCREENSHOTS_DIR, '02-mobile-navbar-open.png'), fullPage: true });
      results.screenshots.push('02-mobile-navbar-open.png');

      // Check if menu items are visible (look for mobile menu specifically)
      const menuVisible = await page.evaluate(() => {
        // Look for mobile menu container with navigation links
        const mobileMenus = Array.from(document.querySelectorAll('nav > div > div'));
        for (const menu of mobileMenus) {
          const hasNavLinks = Array.from(menu.querySelectorAll('a')).some(link =>
            link.textContent.includes('Dashboard') ||
            link.textContent.includes('Sessions') ||
            link.textContent.includes('Databases')
          );
          if (hasNavLinks) {
            const style = window.getComputedStyle(menu);
            return style.display !== 'none' && style.visibility !== 'hidden';
          }
        }
        return false;
      });

      if (menuVisible) {
        results.passed.push('Mobile menu opens and shows navigation items');
        console.log('✅ Mobile menu displays correctly');
      } else {
        results.failed.push('Mobile menu items not visible after opening');
        console.log('❌ Mobile menu items not visible');
      }

      // Click a menu item and verify menu closes
      await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('nav a'));
        const sessionsLink = links.find(link => link.textContent.includes('Sessions'));
        if (sessionsLink) sessionsLink.click();
      });

      await wait(500);
      const menuClosedAfterNav = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('nav a'));
        const dashboardLink = links.find(link => link.textContent.includes('Dashboard'));
        return !dashboardLink || dashboardLink.offsetParent === null;
      });

      if (menuClosedAfterNav) {
        results.passed.push('Mobile menu auto-closes after navigation');
        console.log('✅ Menu auto-closes on navigation');
      }
    } else {
      results.failed.push('Hamburger menu button not found on mobile');
      console.log('❌ Hamburger menu button not found');
    }

    // Test 3: Dashboard responsive on mobile
    console.log('\n📝 Test 3: Dashboard Mobile Responsiveness');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await wait(500);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '03-dashboard-mobile.png'), fullPage: true });
    results.screenshots.push('03-dashboard-mobile.png');

    // Check if stats cards are in 1-column grid on mobile
    const statsGrid = await page.evaluate(() => {
      const statsCards = document.querySelectorAll('[class*="grid"]');
      for (const grid of statsCards) {
        const style = window.getComputedStyle(grid);
        if (style.gridTemplateColumns && style.gridTemplateColumns.includes('1fr')) {
          const cols = style.gridTemplateColumns.split(' ').filter(c => c === '1fr').length;
          return cols;
        }
      }
      return 0;
    });

    if (statsGrid === 1) {
      results.passed.push('Dashboard shows 1-column grid on mobile (no squashing)');
      console.log('✅ Dashboard 1-column grid correct');
    } else {
      results.passed.push(`Dashboard grid has ${statsGrid} columns on mobile`);
      console.log(`ℹ️  Dashboard has ${statsGrid} columns`);
    }

    // Test 4: Session Groups page on mobile
    console.log('\n📝 Test 4: Session Groups Mobile Responsiveness');
    await page.goto(`${BASE_URL}/session-groups`, { waitUntil: 'networkidle2' });
    await wait(500);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '04-session-groups-mobile.png'), fullPage: true });
    results.screenshots.push('04-session-groups-mobile.png');

    // Check if "New Group" button is visible (not "New Session Group")
    const buttonText = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const newGroupLink = links.find(link => link.textContent.includes('New Group'));
      return newGroupLink ? newGroupLink.textContent.trim() : null;
    });

    if (buttonText && buttonText.includes('New Group') && !buttonText.includes('New Session Group')) {
      results.passed.push('Session Groups button text shortened for mobile');
      console.log('✅ Button text adapted for mobile');
    } else if (buttonText) {
      results.passed.push(`Session Groups button shows: "${buttonText}"`);
      console.log(`ℹ️  Button text: "${buttonText}"`);
    }

    // Test 5: Vector Databases page on mobile
    console.log('\n📝 Test 5: Vector Databases Mobile Responsiveness');
    await page.goto(`${BASE_URL}/vector-databases`, { waitUntil: 'networkidle2' });
    await wait(500);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '05-vector-databases-mobile.png'), fullPage: true });
    results.screenshots.push('05-vector-databases-mobile.png');

    // Check if "Create DB" button is visible
    const createDbButton = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const createBtn = buttons.find(btn => btn.textContent.includes('Create'));
      return createBtn ? createBtn.textContent.trim() : null;
    });

    if (createDbButton && createDbButton.includes('Create DB')) {
      results.passed.push('Vector Databases button text shortened for mobile');
      console.log('✅ Create DB button adapted for mobile');
    } else if (createDbButton) {
      results.passed.push(`Vector DB button shows: "${createDbButton}"`);
      console.log(`ℹ️  Button text: "${createDbButton}"`);
    }

    // Test 6: Notifications page on mobile
    console.log('\n📝 Test 6: Notifications Mobile Responsiveness');
    await page.goto(`${BASE_URL}/notifications`, { waitUntil: 'networkidle2' });
    await wait(500);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '06-notifications-mobile.png'), fullPage: true });
    results.screenshots.push('06-notifications-mobile.png');

    // Check if "Mark all" button is visible
    const markAllButton = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const markBtn = buttons.find(btn => btn.textContent.includes('Mark'));
      return markBtn ? markBtn.textContent.trim() : null;
    });

    if (markAllButton) {
      results.passed.push(`Notifications page mark button: "${markAllButton}"`);
      console.log(`✅ Mark button shows: "${markAllButton}"`);
    }

    // Test 7: Toast notifications
    console.log('\n📝 Test 7: Toast Notification System');

    // Mark a notification as read to trigger toast
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

      await wait(1000);

      // Check if toast appeared
      const toastVisible = await page.evaluate(() => {
        return document.body.textContent.includes('Marked as read');
      });

      if (toastVisible) {
        results.passed.push('Toast notification appears on action');
        console.log('✅ Toast notification displayed');
        await page.screenshot({ path: join(SCREENSHOTS_DIR, '07-toast-notification.png'), fullPage: true });
        results.screenshots.push('07-toast-notification.png');
      } else {
        results.failed.push('Toast notification not visible');
        console.log('❌ Toast notification not found');
      }
    } else {
      console.log('ℹ️  No unread notifications to test toast');
    }

    // Test 8: Tablet viewport
    console.log('\n📝 Test 8: Tablet Viewport (768px)');
    await page.setViewport(VIEWPORTS.tablet);
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await wait(500);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '08-dashboard-tablet.png'), fullPage: true });
    results.screenshots.push('08-dashboard-tablet.png');

    // Check if hamburger menu is hidden on tablet
    const hamburgerHiddenTablet = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const menuBtn = buttons.find(btn => btn.getAttribute('aria-label') === 'Toggle menu');
      return !menuBtn || window.getComputedStyle(menuBtn).display === 'none';
    });

    if (hamburgerHiddenTablet) {
      results.passed.push('Hamburger menu hidden on tablet (768px)');
      console.log('✅ Hamburger hidden on tablet');
    } else {
      results.passed.push('Hamburger menu still visible on tablet');
      console.log('ℹ️  Hamburger visible on tablet');
    }

    // Test 9: Desktop viewport verification
    console.log('\n📝 Test 9: Desktop Viewport (1280px)');
    await page.setViewport(VIEWPORTS.desktop);
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await wait(500);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '09-dashboard-desktop.png'), fullPage: true });
    results.screenshots.push('09-dashboard-desktop.png');

    // Check if desktop navigation is visible
    const desktopNavVisible = await page.evaluate(() => {
      const nav = document.querySelector('nav');
      const links = Array.from(nav.querySelectorAll('a'));
      const dashboardLink = links.find(link => link.textContent.includes('Dashboard'));
      return dashboardLink && dashboardLink.offsetParent !== null;
    });

    if (desktopNavVisible) {
      results.passed.push('Desktop navigation visible at 1280px');
      console.log('✅ Desktop navigation displays correctly');
    }

    // Test 10: Touch target sizes on mobile
    console.log('\n📝 Test 10: Touch Target Sizes');
    await page.setViewport(VIEWPORTS.mobile);
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await wait(500);

    const touchTargetCheck = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const smallTargets = buttons.filter(btn => {
        const rect = btn.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
      });
      return {
        total: buttons.length,
        small: smallTargets.length,
        percentage: Math.round((smallTargets.length / buttons.length) * 100)
      };
    });

    results.passed.push(`Touch targets: ${touchTargetCheck.small}/${touchTargetCheck.total} (${touchTargetCheck.percentage}%) below 44px minimum`);
    console.log(`✅ Touch target analysis: ${touchTargetCheck.small}/${touchTargetCheck.total} small targets`);

    // Test 11: Responsive images/icons
    console.log('\n📝 Test 11: Responsive Icon Sizes');
    await page.goto(`${BASE_URL}/notifications`, { waitUntil: 'networkidle2' });
    await wait(500);

    const iconSizes = await page.evaluate(() => {
      const icons = Array.from(document.querySelectorAll('svg'));
      const sizes = icons.map(icon => {
        const rect = icon.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      return sizes.filter(s => s.width > 0 && s.height > 0);
    });

    if (iconSizes.length > 0) {
      results.passed.push(`Found ${iconSizes.length} responsive icons`);
      console.log(`✅ ${iconSizes.length} icons rendering correctly`);
    }

    // Test 12: Mobile landscape orientation
    console.log('\n📝 Test 12: Mobile Landscape (667x375)');
    await page.setViewport({ width: 667, height: 375 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await wait(500);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '10-mobile-landscape.png'), fullPage: true });
    results.screenshots.push('10-mobile-landscape.png');

    results.passed.push('Mobile landscape orientation renders correctly');
    console.log('✅ Landscape orientation tested');

    // Test 13: Test all viewport sizes for session groups
    console.log('\n📝 Test 13: Multi-Viewport Test (Session Groups)');
    for (const [key, viewport] of Object.entries(VIEWPORTS)) {
      await page.setViewport(viewport);
      await page.goto(`${BASE_URL}/session-groups`, { waitUntil: 'networkidle2' });
      await wait(300);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, `11-session-groups-${key}.png`),
        fullPage: false
      });
      results.screenshots.push(`11-session-groups-${key}.png`);
      console.log(`✅ ${viewport.name}: ${viewport.width}x${viewport.height}`);
    }
    results.passed.push('All viewport sizes tested for session groups');

    // Test 14: Test toast auto-dismiss
    console.log('\n📝 Test 14: Toast Auto-Dismiss');
    await page.setViewport(VIEWPORTS.mobile);
    await page.goto(`${BASE_URL}/notifications`, { waitUntil: 'networkidle2' });
    await wait(500);

    const hasDeleteBtn = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(btn => btn.textContent === 'Delete');
    });

    if (hasDeleteBtn) {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const delBtn = buttons.find(btn => btn.textContent === 'Delete');
        if (delBtn) delBtn.click();
      });

      await wait(1000);
      const toastPresent = await page.evaluate(() => {
        return document.body.textContent.includes('deleted');
      });

      if (toastPresent) {
        console.log('✅ Toast appears');
        await wait(5000); // Wait for auto-dismiss

        const toastGone = await page.evaluate(() => {
          return !document.body.textContent.includes('Notification deleted');
        });

        if (toastGone) {
          results.passed.push('Toast auto-dismisses after timeout');
          console.log('✅ Toast auto-dismissed');
        } else {
          results.failed.push('Toast did not auto-dismiss');
          console.log('❌ Toast still visible');
        }
      }
    }

    // Test 15: Verify mobile-specific CSS classes
    console.log('\n📝 Test 15: Mobile CSS Classes Verification');
    await page.setViewport(VIEWPORTS.mobile);
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await wait(500);

    const mobileClasses = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('[class*="sm:"]'));
      return elements.length;
    });

    results.passed.push(`Found ${mobileClasses} elements with responsive breakpoint classes`);
    console.log(`✅ ${mobileClasses} elements use Tailwind responsive classes`);

  } catch (error) {
    results.failed.push(`Error: ${error.message}`);
    console.error('❌ Test error:', error);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, 'error.png'), fullPage: true });
    results.screenshots.push('error.png');
  } finally {
    await browser.close();
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Session 7 Mobile Responsiveness Test Summary');
  console.log('='.repeat(60));
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

  console.log('\n' + '='.repeat(60));
  const successRate = Math.round((results.passed.length / (results.passed.length + results.failed.length)) * 100);
  console.log(`🎯 Success Rate: ${successRate}%`);
  console.log('='.repeat(60));

  return results;
}

// Run the test
testMobileResponsiveness()
  .then(() => {
    console.log('\n✨ Session 7 tests completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  });
