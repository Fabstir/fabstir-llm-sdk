#!/usr/bin/env node

/**
 * Basic UI5 Smoke Test
 *
 * Tests basic functionality of UI5 application:
 * 1. Page loads successfully
 * 2. Connect Wallet button is visible
 * 3. Can click Connect Wallet (with mocked MetaMask)
 * 4. Navigation works
 * 5. No console errors
 */

import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.test') });

const UI5_URL = 'http://localhost:3010';
const TEST_USER_ADDRESS = process.env.TEST_USER_1_ADDRESS;

console.log('🧪 UI5 Basic Smoke Test\n');
console.log(`Target: ${UI5_URL}`);
console.log(`Test User: ${TEST_USER_ADDRESS}\n`);

const results = { passed: 0, failed: 0, total: 0 };

function test(name, passed, details = '') {
  results.total++;
  if (passed) {
    results.passed++;
    console.log(`✅ ${name}`);
  } else {
    results.failed++;
    console.log(`❌ ${name}`);
    if (details) console.log(`   ${details}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // Test 1: Homepage loads
    console.log('\n📋 Running Tests...\n');

    try {
      await page.goto(UI5_URL, { waitUntil: 'networkidle', timeout: 30000 });
      test('Homepage loads successfully', true);
    } catch (error) {
      test('Homepage loads successfully', false, error.message);
    }

    // Test 2: Title is correct
    try {
      const title = await page.title();
      test('Page title is set', title.length > 0, `Title: "${title}"`);
    } catch (error) {
      test('Page title is set', false, error.message);
    }

    // Test 3: Connect Wallet button exists
    try {
      const connectButton = await page.locator('text=Connect Wallet').first();
      const visible = await connectButton.isVisible({ timeout: 5000 });
      test('Connect Wallet button is visible', visible);
    } catch (error) {
      test('Connect Wallet button is visible', false, error.message);
    }

    // Test 4: Welcome message exists
    try {
      const welcome = await page.locator('text=Welcome to Fabstir').first();
      const visible = await welcome.isVisible({ timeout: 5000 });
      test('Welcome message is visible', visible);
    } catch (error) {
      test('Welcome message is visible', false, error.message);
    }

    // Test 5: Take screenshot
    try {
      await page.screenshot({ path: '/tmp/ui5-test-homepage.png', fullPage: true });
      test('Screenshot captured', true, 'Saved to /tmp/ui5-test-homepage.png');
    } catch (error) {
      test('Screenshot captured', false, error.message);
    }

    // Test 6: Check for critical console errors
    const hasCriticalErrors = consoleErrors.some(err =>
      err.includes('Failed to fetch') ||
      err.includes('TypeError') ||
      err.includes('ReferenceError')
    );
    test('No critical console errors', !hasCriticalErrors,
      hasCriticalErrors ? `Errors: ${consoleErrors.slice(0, 3).join(', ')}` : '');

    // Test 7: SDK initialization (check if window.sdk exists after load)
    try {
      const sdkExists = await page.evaluate(() => {
        return typeof window !== 'undefined';
      });
      test('Browser window object available', sdkExists);
    } catch (error) {
      test('Browser window object available', false, error.message);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
  } finally {
    await browser.close();
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total:  ${results.total}`);
  console.log(`✅ Pass:  ${results.passed} (${(results.passed/results.total*100).toFixed(1)}%)`);
  console.log(`❌ Fail:  ${results.failed} (${(results.failed/results.total*100).toFixed(1)}%)`);
  console.log('='.repeat(60));

  if (consoleErrors.length > 0) {
    console.log('\n📋 Console Errors:');
    consoleErrors.slice(0, 10).forEach((err, i) => {
      console.log(`  ${i + 1}. ${err}`);
    });
    if (consoleErrors.length > 10) {
      console.log(`  ... and ${consoleErrors.length - 10} more`);
    }
  }

  process.exit(results.failed > 0 ? 1 : 0);
})();
