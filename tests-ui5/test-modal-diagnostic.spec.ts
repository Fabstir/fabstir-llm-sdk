/**
 * Modal Upload Diagnostic Test
 *
 * Investigates why handleUpload() is never called despite:
 * - Playwright reporting successful button click
 * - Vectors being successfully added to database
 *
 * Tests:
 * 1. Window focus state before/during click
 * 2. Which button is actually being clicked
 * 3. Whether onClick handler is attached in DOM
 * 4. Multiple buttons matching the selector
 */
import { test, expect, TEST_CONFIG } from './lib/test-setup';
import fs from 'fs';

test.describe('Modal Upload - Diagnostics', () => {
  test('should diagnose button click and window focus issues', async ({ page, testWallet }) => {
    test.setTimeout(180000); // 3 minutes

    // Enable browser console capture
    const browserLogs: string[] = [];
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      const prefix = type === 'error' ? '[Browser Error]' : type === 'warning' ? '[Browser Warning]' : '[Browser]';
      const logLine = `${prefix} ${text}`;
      browserLogs.push(logLine);
      console.log(logLine);
    });

    console.log('[Test] Starting modal diagnostic test');

    // Navigate to UI5
    await page.goto(TEST_CONFIG.UI5_URL);
    await page.waitForSelector('text=Dashboard', { timeout: 30000 });
    await page.waitForSelector('text=Disconnect', { timeout: 10000 });
    console.log('[Test] Dashboard loaded, wallet connected');

    // Navigate to vector databases page
    await page.click('a[href="/vector-databases"]');
    await page.waitForSelector('text=Vector Databases', { timeout: 10000 });
    await page.getByTestId('app-ready').waitFor({ state: 'attached', timeout: 10000 });
    console.log('[Test] Vector databases page loaded');

    // Open Test Database 1
    const databaseCard = page.locator('text=Test Database 1').first();
    await expect(databaseCard).toBeVisible({ timeout: 10000 });
    await databaseCard.click();
    await page.waitForSelector('text=/Database|Details/i', { timeout: 10000 });
    console.log('[Test] Database detail page loaded');

    await page.waitForTimeout(2000);

    // Click Upload button
    const uploadButton = page.locator('button:has-text("Upload Documents")').first();
    await expect(uploadButton).toBeVisible({ timeout: 5000 });
    await uploadButton.click();
    console.log('[Test] Clicked Upload button');

    // Wait for upload modal
    await page.waitForSelector('text=/Upload Document|Add Document/i', { timeout: 5000 });
    console.log('[Test] Upload modal appeared');

    // Create test file
    const testDocumentContent = 'Test document for window focus diagnostic test. Vector database testing.';
    const buffer = Buffer.from(testDocumentContent, 'utf-8');
    const testFilePath = '/tmp/test-diagnostic-document.txt';
    fs.writeFileSync(testFilePath, buffer);
    console.log('[Test] Created temporary test file');

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFilePath);
    console.log('[Test] File uploaded to file input');
    await page.waitForTimeout(1000);

    // === DIAGNOSTIC 1: Check window focus state ===
    console.log('[Test] === DIAGNOSTIC 1: Window Focus State ===');
    const focusState = await page.evaluate(() => ({
      hasFocus: document.hasFocus(),
      activeElement: document.activeElement?.tagName,
      activeElementText: document.activeElement?.textContent?.substring(0, 50),
      visibility: document.visibilityState,
    }));
    console.log('[Test] Window focus state:', JSON.stringify(focusState, null, 2));

    // === DIAGNOSTIC 2: Find all matching buttons ===
    console.log('[Test] === DIAGNOSTIC 2: Find All Matching Buttons ===');
    const allMatchingButtons = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons
        .filter(btn => {
          const text = btn.textContent || '';
          const type = btn.getAttribute('type');
          return (
            text.includes('Upload') ||
            text.includes('Submit') ||
            text.includes('Add') ||
            type === 'submit'
          );
        })
        .map((btn, idx) => ({
          index: idx,
          text: btn.textContent?.substring(0, 100),
          type: btn.getAttribute('type'),
          disabled: btn.disabled,
          hasOnClick: !!btn.onclick,
          hasReactProps: !!(btn as any)['__reactProps$' + Object.keys(btn).find(k => k.startsWith('__reactProps$'))?.split('$')[1]],
          className: btn.className,
        }));
    });
    console.log('[Test] Found matching buttons:', JSON.stringify(allMatchingButtons, null, 2));

    // === DIAGNOSTIC 3: Inspect the actual submit button we're about to click ===
    console.log('[Test] === DIAGNOSTIC 3: Inspect Target Submit Button ===');

    // Use the same selector as the real test
    const submitButton = page.locator('button:has-text("Upload"), button:has-text("Submit"), button:has-text("Add"), button[type="submit"]')
      .filter({ hasNot: page.locator('[disabled]') })
      .first();

    await submitButton.waitFor({ timeout: 5000 });

    const submitButtonInfo = await submitButton.evaluate((btn: HTMLButtonElement) => {
      // Get React props keys
      const reactPropsKey = Object.keys(btn).find(k => k.startsWith('__reactProps$'));
      const reactProps = reactPropsKey ? (btn as any)[reactPropsKey] : null;

      return {
        tagName: btn.tagName,
        text: btn.textContent?.substring(0, 100),
        type: btn.getAttribute('type'),
        disabled: btn.disabled,
        className: btn.className,
        hasOnClick: !!btn.onclick,
        hasReactPropsKey: !!reactPropsKey,
        reactPropsKeys: reactProps ? Object.keys(reactProps) : [],
        hasReactOnClick: reactProps?.onClick ? true : false,
        boundingBox: {
          top: btn.getBoundingClientRect().top,
          left: btn.getBoundingClientRect().left,
          width: btn.getBoundingClientRect().width,
          height: btn.getBoundingClientRect().height,
        },
        isVisible: btn.offsetParent !== null,
        computedPointerEvents: window.getComputedStyle(btn).pointerEvents,
      };
    });
    console.log('[Test] Submit button details:', JSON.stringify(submitButtonInfo, null, 2));

    // === DIAGNOSTIC 4: Check if modal backdrop is blocking ===
    console.log('[Test] === DIAGNOSTIC 4: Modal Backdrop Inspection ===');
    const modalBackdropInfo = await page.evaluate(() => {
      // Find elements with pointer-events: none
      const allElements = Array.from(document.querySelectorAll('*'));
      const pointerEventsNone = allElements.filter(el => {
        const style = window.getComputedStyle(el);
        return style.pointerEvents === 'none';
      });

      return {
        count: pointerEventsNone.length,
        elements: pointerEventsNone.slice(0, 5).map(el => ({
          tagName: el.tagName,
          className: el.className,
          text: el.textContent?.substring(0, 50),
        })),
      };
    });
    console.log('[Test] Elements with pointer-events:none:', JSON.stringify(modalBackdropInfo, null, 2));

    // === DIAGNOSTIC 5: Focus window before click ===
    console.log('[Test] === DIAGNOSTIC 5: Ensure Window Has Focus ===');
    await page.bringToFront();
    await page.waitForTimeout(500);

    const focusStateAfterBringToFront = await page.evaluate(() => ({
      hasFocus: document.hasFocus(),
      activeElement: document.activeElement?.tagName,
    }));
    console.log('[Test] Focus state after bringToFront():', JSON.stringify(focusStateAfterBringToFront, null, 2));

    // === DIAGNOSTIC 6: Try clicking with force option ===
    console.log('[Test] === DIAGNOSTIC 6: Click Submit Button ===');
    console.log('[Test] About to click submit button...');

    await submitButton.click({ force: true }); // Force click to bypass actionability checks
    console.log('[Test] ✅ Clicked submit button (force: true)');

    // Clean up temp file
    fs.unlinkSync(testFilePath);

    // Wait for any console logs from handleUpload to appear
    console.log('[Test] Waiting 3 seconds for handleUpload() logs...');
    await page.waitForTimeout(3000);

    // === DIAGNOSTIC 7: Analyze browser logs ===
    console.log('[Test] === DIAGNOSTIC 7: Browser Log Analysis ===');
    const handleUploadLogs = browserLogs.filter(log =>
      log.includes('handleUpload') ||
      log.includes('🚀') ||
      log.includes('📤') ||
      log.includes('[Modal]')
    );

    console.log('[Test] Browser logs matching handleUpload:', handleUploadLogs.length);
    if (handleUploadLogs.length > 0) {
      console.log('[Test] ✅ handleUpload() WAS CALLED!');
      handleUploadLogs.forEach(log => console.log(log));
    } else {
      console.log('[Test] ❌ handleUpload() WAS NOT CALLED!');
      console.log('[Test] Total browser logs captured:', browserLogs.length);
      console.log('[Test] Sample logs (last 10):');
      browserLogs.slice(-10).forEach(log => console.log(log));
    }

    // Take screenshot
    await page.screenshot({ path: 'test-results/modal-diagnostic.png' });
    console.log('[Test] Screenshot taken');

    console.log('[Test] ✅ Diagnostic test complete');
  });
});
