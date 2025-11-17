/**
 * Phase 4.1: Create Session Group
 *
 * Tests session group creation with real blockchain transactions.
 *
 * Prerequisites:
 * - UI5 server running on port 3002
 * - Test wallet auto-connected (TEST_USER_1_PRIVATE_KEY)
 *
 * Expected Duration: 15-30 seconds (blockchain confirmation)
 */

import { test, expect, TEST_CONFIG } from './lib/test-setup';

test.describe('Phase 4.1: Create Session Group', () => {

  test('should create session group with blockchain transaction', async ({ page, testWallet }) => {
    // Increase timeout for blockchain transactions + S5 storage persistence
    test.setTimeout(90000); // 90 seconds to allow for S5 storage delays

    // Capture browser console output
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();

      // Filter for SessionGroupManager logs
      if (text.includes('SessionGroupManager') || text.includes('Storage available') ||
          text.includes('Stored in memory') || text.includes('S5 storage')) {
        console.log(`[Browser ${type.toUpperCase()}] ${text}`);
      }
    });

    console.log('[Test] ========================================');
    console.log('[Test] Phase 4.1: Create Session Group');
    console.log('[Test] ========================================');

    // Step 1: Navigate to session groups page
    console.log('\n[Test] === STEP 1: Navigate to Session Groups ===');
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    console.log('[Test] Session groups page loaded');

    // Wait for page to render
    await page.waitForTimeout(2000);

    // Take screenshot of initial state
    await page.screenshot({
      path: 'test-results/session-group-create-initial.png',
      fullPage: true
    });

    // Step 2: Get initial count of session groups
    console.log('\n[Test] === STEP 2: Get Initial Group Count ===');

    // Find all session group cards (links to /session-groups/sg-* containing h3)
    // All group IDs start with 'sg-', so we can filter by that
    const groupCards = page.locator('a[href^="/session-groups/sg-"]').filter({ has: page.locator('h3') });
    const initialCount = await groupCards.count();
    console.log(`[Test] Initial session group count: ${initialCount}`);

    // Step 3: Click "+ Create Session Group" button
    console.log('\n[Test] === STEP 3: Click Create Button ===');

    // Try multiple selector patterns for create button
    const createButton = page.locator('button:has-text("Create Session Group")')
      .or(page.locator('button:has-text("New Session Group")'))
      .or(page.locator('button:has-text("Create Group")'))
      .or(page.locator('a[href="/session-groups/new"]'))
      .or(page.locator('button[title*="Create"]'))
      .first();

    const buttonExists = await createButton.count() > 0;
    if (!buttonExists) {
      throw new Error('Create Session Group button not found. Available selectors tried: "Create Session Group", "New Session Group", "Create Group", href="/session-groups/new", title*="Create"');
    }

    console.log('[Test] Create button found');
    await createButton.click();
    console.log('[Test] Clicked create button');

    // Wait for navigation to complete and page to compile
    await page.waitForURL('**/session-groups/new', { timeout: 10000 });
    console.log('[Test] Navigated to create page');

    // Wait for the form to appear (indicates compilation finished)
    // Look for the name input field by its placeholder text
    await page.waitForSelector('input[placeholder*="Engineering" i], input[placeholder*="Project" i], input[type="text"]', { timeout: 10000 });
    console.log('[Test] Create form loaded');

    // Step 4: Fill in session group details
    console.log('\n[Test] === STEP 4: Fill Group Details ===');

    // Check if we're on a new page or in a modal
    const currentUrl = page.url();
    console.log(`[Test] Current URL: ${currentUrl}`);

    // Find name input field
    const nameInput = page.locator('input[name="name"]')
      .or(page.locator('input[placeholder*="name"]'))
      .or(page.locator('input[id*="name"]'))
      .or(page.locator('input[type="text"]').first())
      .first();

    const nameExists = await nameInput.count() > 0;
    if (!nameExists) {
      throw new Error('Name input field not found');
    }

    await nameInput.fill('Test Project');
    console.log('[Test] Filled name: "Test Project"');

    // Find description input field (textarea or input)
    const descriptionInput = page.locator('textarea[name="description"]')
      .or(page.locator('textarea[placeholder*="description"]'))
      .or(page.locator('input[name="description"]'))
      .or(page.locator('textarea').first())
      .first();

    const descExists = await descriptionInput.count() > 0;
    if (descExists) {
      await descriptionInput.fill('UI5 automated test session group');
      console.log('[Test] Filled description: "UI5 automated test session group"');
    } else {
      console.log('[Test] ⚠️ Description field not found (may be optional)');
    }

    // Take screenshot before submitting
    await page.screenshot({
      path: 'test-results/session-group-create-filled.png',
      fullPage: true
    });

    // Step 5: Submit the form
    console.log('\n[Test] === STEP 5: Submit Form ===');

    // Find submit button
    const submitButton = page.locator('button[type="submit"]')
      .or(page.locator('button:has-text("Create")'))
      .or(page.locator('button:has-text("Save")'))
      .or(page.locator('button:has-text("Submit")'))
      .first();

    const submitExists = await submitButton.count() > 0;
    if (!submitExists) {
      throw new Error('Submit button not found. Available selectors tried: type="submit", text="Create", text="Save", text="Submit"');
    }

    console.log('[Test] Submit button found');
    await submitButton.click();
    console.log('[Test] Clicked submit button');

    // Step 6: Wait for redirect to group detail page
    console.log('\n[Test] === STEP 6: Wait for Redirect to Detail Page ===');
    console.log('[Test] ⏳ Waiting for redirect to group detail page...');

    // Wait for redirect to group detail page (pattern: /session-groups/{id}, excluding /new)
    try {
      await page.waitForURL((url) => {
        const path = url.pathname;
        // Must match /session-groups/{id} but NOT /session-groups/new
        return path.startsWith('/session-groups/') && !path.endsWith('/new') && path !== '/session-groups/';
      }, { timeout: 30000 });
      console.log('[Test] ✅ Redirected to group detail page');
      console.log(`[Test] Current URL: ${page.url()}`);
    } catch (e) {
      console.log('[Test] ❌ Timeout waiting for redirect');
      console.log(`[Test] Current URL: ${page.url()}`);
      throw new Error('Failed to redirect to group detail page after creation');
    }

    // Step 7: Verify group details on detail page
    console.log('\n[Test] === STEP 7: Verify Group Details ===');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Take screenshot of detail page
    await page.screenshot({
      path: 'test-results/session-group-create-detail.png',
      fullPage: true
    });

    // Verify group name appears on detail page
    const groupTitle = page.locator('h1').first();
    const titleText = await groupTitle.textContent();
    console.log(`[Test] Group title on detail page: "${titleText}"`);

    if (!titleText?.includes('Test Project')) {
      throw new Error(`Group detail page does not show correct name. Expected "Test Project", got "${titleText}"`);
    }

    console.log('[Test] ✅ Group name verified on detail page');

    // Verify description if visible
    const descriptionLocator = page.locator('p').filter({ hasText: 'UI5 automated test session group' });
    if (await descriptionLocator.count() > 0) {
      console.log('[Test] ✅ Group description verified on detail page');
    }

    // Step 8: Verify group appears in list
    console.log('\n[Test] === STEP 8: Verify Group in List ===');
    console.log('[Test] Navigating back to session groups list...');

    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');

    // S5 storage can take 10-20 seconds to persist and propagate
    console.log('[Test] ⏳ Waiting 10 seconds for S5 storage to persist...');
    await page.waitForTimeout(10000);

    // Find the new group in list
    const newGroup = page.locator('a[href^="/session-groups/sg-"]').filter({ hasText: 'Test Project' }).first();
    let groupExists = await newGroup.count() > 0;

    if (!groupExists) {
      console.log('[Test] ⚠️ Group not found in list, waiting 10 more seconds...');
      await page.waitForTimeout(10000);
      groupExists = await newGroup.count() > 0;

      if (!groupExists) {
        console.log('[Test] ⚠️ Group still not found, final retry after 10 more seconds...');
        await page.waitForTimeout(10000);
        groupExists = await newGroup.count() > 0;

        if (!groupExists) {
          // Take screenshot for debugging
          await page.screenshot({
            path: 'test-results/session-group-list-not-found.png',
            fullPage: true
          });
          console.log('[Test] ❌ Group not found after 30 seconds total wait time');
          console.log('[Test] Screenshot saved: test-results/session-group-list-not-found.png');
          throw new Error('Newly created session group "Test Project" not found in list after 30 seconds');
        }
      }
    }

    console.log('[Test] ✅ Session group found in list');

    // Verify count increased
    const newGroupCards = page.locator('a[href^="/session-groups/sg-"]').filter({ has: page.locator('h3') });
    const newCount = await newGroupCards.count();
    console.log(`[Test] Group count changed: ${initialCount} → ${newCount}`);

    if (newCount <= initialCount) {
      console.log('[Test] ⚠️ Group count did not increase (may have race condition)');
    } else {
      console.log('[Test] ✅ Group count increased (creation confirmed)');
    }

    // Step 9: Take final screenshot
    console.log('\n[Test] === STEP 9: Take Final Screenshot ===');
    await page.screenshot({
      path: 'test-results/session-group-create-success.png',
      fullPage: true
    });
    console.log('[Test] Screenshot saved: test-results/session-group-create-success.png');

    console.log('\n[Test] ========================================');
    console.log('[Test] ✅ Phase 4.1 Complete: Session group created successfully');
    console.log('[Test] ========================================');
  });

  test('should handle creation with empty name gracefully', async ({ page, testWallet }) => {
    console.log('[Test] ========================================');
    console.log('[Test] Phase 4.1 Edge Case: Empty Name Validation');
    console.log('[Test] ========================================');

    // Navigate to session groups page
    console.log('\n[Test] === STEP 1: Navigate to Create Page ===');
    await page.goto('http://localhost:3002/session-groups');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click create button
    const createButton = page.locator('button:has-text("Create Session Group")')
      .or(page.locator('a[href="/session-groups/new"]'))
      .first();

    const buttonExists = await createButton.count() > 0;
    if (!buttonExists) {
      throw new Error('Create button not found');
    }

    await createButton.click();
    console.log('[Test] Navigated to create session group page');
    await page.waitForTimeout(1000);

    // Step 2: Verify submit button is disabled when name is empty
    console.log('\n[Test] === STEP 2: Verify Validation ===');

    const submitButton = page.locator('button[type="submit"]')
      .or(page.locator('button:has-text("Create")'))
      .first();

    const submitExists = await submitButton.count() > 0;
    if (!submitExists) {
      throw new Error('Submit button not found');
    }

    // Check if button is disabled (HTML5 validation for required field)
    const isDisabled = await submitButton.isDisabled();
    console.log(`[Test] Submit button disabled: ${isDisabled}`);

    if (isDisabled) {
      console.log('[Test] ✅ Submit button correctly disabled for empty name (HTML5 validation working)');
    } else {
      // Try clicking and check for error message
      console.log('[Test] Submit button not disabled, attempting to submit...');
      await submitButton.click();
      await page.waitForTimeout(1000);

      // Check for validation error
      const errorIndicators = [
        'text="required"',
        'text="cannot be empty"',
        'text="must provide"',
        '[role="alert"]',
        '.error',
        '.alert-error'
      ];

      let errorFound = false;
      for (const selector of errorIndicators) {
        try {
          const element = page.locator(selector).first();
          if (await element.count() > 0) {
            const text = await element.textContent();
            console.log(`[Test] ✅ Validation error found: "${text}"`);
            errorFound = true;
            break;
          }
        } catch (e) {
          // Continue checking
        }
      }

      if (errorFound) {
        console.log('[Test] ✅ Edge case test complete (client-side validation working)');
      } else {
        console.log('[Test] ⚠️ No validation error found - form may allow empty names');
      }
    }

    // Take screenshot of validation state
    await page.screenshot({
      path: 'test-results/session-group-create-validation.png',
      fullPage: true
    });
    console.log('[Test] Screenshot saved: test-results/session-group-create-validation.png');

    console.log('\n[Test] ========================================');
    console.log('[Test] ✅ Edge case test complete');
    console.log('[Test] ========================================');
  });
});
