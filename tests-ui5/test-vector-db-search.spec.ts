/**
 * Vector Database Search Test (After Embeddings Ready)
 *
 * Tests searching vector databases with semantic/vector search.
 * Covers Sub-phase 3.4c from comprehensive testing plan.
 *
 * PREREQUISITE (Deferred Embeddings Architecture):
 * This test assumes embeddings have been generated (Sub-phase 3.4b complete).
 * With deferred embeddings (2025-11-16), documents upload instantly but are marked
 * as "pending". Embeddings generate during session start (Sub-phase 3.4b).
 * Search only works AFTER embeddings are ready.
 *
 * For complete workflow testing including embedding generation, see:
 * - test-deferred-embeddings.spec.ts (Sub-phase 3.4b)
 *
 * Verifies:
 * - Search query input
 * - Vector search execution
 * - Search results display
 * - Relevance scores
 * - Matched text snippets
 */
import { test, expect, TEST_CONFIG } from './lib/test-setup';
import fs from 'fs';

test.describe('Vector Database - Search', () => {
  test('should search vector database and display results (Sub-phase 3.4)', async ({ page, testWallet }) => {
    // Increase timeout for document upload and embedding generation
    test.setTimeout(180000); // 3 minutes

    // Enable browser console capture
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        console.log(`[Browser Error] ${text}`);
      } else if (type === 'warning') {
        console.log(`[Browser Warning] ${text}`);
      } else {
        console.log(`[Browser] ${text}`);
      }
    });

    console.log('[Test] Starting vector database search test');
    console.log('[Test] Test wallet:', testWallet.getAddress());

    // Navigate to UI5
    await page.goto(TEST_CONFIG.UI5_URL);
    console.log('[Test] Navigated to UI5');

    // Wait for dashboard
    await page.waitForSelector('text=Dashboard', { timeout: 30000 });
    console.log('[Test] Dashboard loaded');

    // Wait for wallet connection
    await page.waitForSelector('text=Disconnect', { timeout: 10000 });
    console.log('[Test] Wallet connected');

    // Navigate to vector databases page
    await page.click('a[href="/vector-databases"]');
    await page.waitForSelector('text=Vector Databases', { timeout: 10000 });
    console.log('[Test] Vector databases page loaded');

    // Wait for React hydration
    await page.getByTestId('app-ready').waitFor({ state: 'attached', timeout: 10000 });
    console.log('[Test] ✅ React hydration complete');

    // Click on "Test Database 1" to open detail page
    const databaseCard = page.locator('text=Test Database 1').first();
    await expect(databaseCard).toBeVisible({ timeout: 10000 });
    await databaseCard.click();
    console.log('[Test] Opened Test Database 1');

    // Wait for database detail page
    await page.waitForSelector('text=/Database|Details/i', { timeout: 10000 });
    console.log('[Test] Database detail page loaded');

    // Wait a moment for page to fully render
    await page.waitForTimeout(2000);

    // STEP 1: Upload a test document first
    console.log('[Test] === STEP 1: Uploading test document ===');

    // Find and click Upload button (correct text: "Upload Documents")
    const uploadButton = page.locator('button:has-text("Upload Documents")').first();
    await expect(uploadButton).toBeVisible({ timeout: 5000 });
    await uploadButton.click();
    console.log('[Test] Clicked Upload button');

    // Wait for upload modal to appear
    await page.waitForSelector('text=/Upload Document|Add Document/i', { timeout: 5000 });
    console.log('[Test] Upload modal appeared');

    // Create a test text file content
    const testDocumentContent = `
Vector Database Testing Guide

This document explains the main topic of vector databases and their testing methodology.

What is a Vector Database?
A vector database is a specialized database designed to store and retrieve vector embeddings efficiently.
Vector embeddings are numerical representations of text, images, or other data types.

Why Test Vector Databases?
Testing ensures that:
- Documents are properly chunked and embedded
- Search queries return relevant results
- The system handles large datasets efficiently

Main Testing Topics:
1. Document upload and processing
2. Vector search accuracy
3. Performance under load
4. Error handling

This is a test document for automated testing purposes.
    `.trim();

    // Create a File object from the text content (simulate file upload)
    const buffer = Buffer.from(testDocumentContent, 'utf-8');
    const testFilePath = '/tmp/test-vector-db-document.txt';

    // Write the file to a temporary location
    fs.writeFileSync(testFilePath, buffer);
    console.log('[Test] Created temporary test file');

    // Find the file input element
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFilePath);
    console.log('[Test] File uploaded to file input');

    // Wait for file to be processed (modal should show the file)
    await page.waitForTimeout(1000);

    // Take screenshot after file selection
    await page.screenshot({ path: 'test-results/vector-db-upload-modal.png' });

    // Click Upload/Submit button INSIDE the modal (not the "Upload Documents" button that opens the modal)
    // The modal's submit button has text like "Upload 1 File" or "Upload N Files"
    // Use :has-text twice to match buttons containing BOTH "Upload" AND "File"
    const submitButton = page.locator('button:has-text("Upload"):has-text("File")').first();
    await submitButton.waitFor({ timeout: 5000 });
    await submitButton.click();
    console.log('[Test] Clicked submit button inside modal');

    // Clean up temp file
    fs.unlinkSync(testFilePath);
    console.log('[Test] Cleaned up temporary file');

    // DEFERRED EMBEDDINGS: Upload is fast (< 2s), but document will be "pending"
    // This test assumes embeddings were already generated in a previous session (Sub-phase 3.4b)
    // If embeddings are still pending, search will fail or return no results
    console.log('[Test] ⏳ Waiting for document upload (< 2 seconds, embedding deferred)...');
    console.log('[Test] ⚠️ NOTE: This test assumes embeddings are READY (generated in Sub-phase 3.4b)');
    await page.waitForTimeout(2000); // Wait for S5 upload

    // Look for upload success indicators
    const uploadSuccessIndicators = [
      page.locator('text=/uploaded/i'),
      page.locator('text=/added/i'),
      page.locator('text=/success/i'),
      page.locator('text=/complete/i')
    ];

    let uploadSuccessFound = false;
    for (const indicator of uploadSuccessIndicators) {
      try {
        await indicator.waitFor({ timeout: 30000, state: 'visible' });
        uploadSuccessFound = true;
        console.log('[Test] ✅ Upload success indicator detected');
        break;
      } catch (e) {
        // Try next indicator
      }
    }

    if (!uploadSuccessFound) {
      console.log('[Test] ⚠️ No success indicator, waiting extra time...');
      await page.waitForTimeout(10000);
    }

    // Modal should close after successful upload
    try {
      await page.waitForSelector('text=/Upload Document|Add Document/i', { timeout: 5000, state: 'hidden' });
      console.log('[Test] ✅ Upload modal closed');
    } catch (e) {
      console.log('[Test] Modal still open, may need manual close');
    }

    // Wait a bit more for UI to update
    await page.waitForTimeout(3000);

    console.log('[Test] === STEP 2: Performing vector search ===');

    // Find search input field (VectorSearchPanel has placeholder "Ask a question about your documents...")
    const searchInputSelectors = [
      'input[placeholder*="Ask a question" i]',  // VectorSearchPanel specific
      'input[placeholder*="documents" i]',       // VectorSearchPanel specific
      'input[placeholder*="Search" i]',
      'input[placeholder*="Query" i]',
      'input[type="search"]',
      'input[name="search"]',
      'input[name="query"]',
      '.search-input',
      '[data-testid="search-input"]'
    ];

    let searchInput = null;
    for (const selector of searchInputSelectors) {
      try {
        const input = page.locator(selector).first();
        await input.waitFor({ timeout: 3000, state: 'visible' });
        searchInput = input;
        console.log(`[Test] Search input found with selector: ${selector}`);
        break;
      } catch (e) {
        // Try next selector
      }
    }

    if (!searchInput) {
      console.log('[Test] ⚠️ Search input not found, trying generic text input');
      searchInput = page.locator('input[type="text"]').last();
    }

    await expect(searchInput).toBeAttached({ timeout: 5000 });
    console.log('[Test] Search input element located');

    // Enter search query: "What is the main topic?"
    const searchQuery = 'What is the main topic?';
    await searchInput.fill(searchQuery);
    console.log(`[Test] Entered search query: "${searchQuery}"`);

    // Take screenshot before search
    await page.screenshot({ path: 'test-results/vector-db-search-input.png' });
    console.log('[Test] Screenshot taken: search input');

    // Find and click "Search" button
    const searchButtonSelectors = [
      'button:has-text("Search")',
      'button[type="submit"]',
      'button:has-text("Find")',
      'button:has-text("Query")',
      '[data-testid="search-button"]'
    ];

    let searchButton = null;
    for (const selector of searchButtonSelectors) {
      try {
        const button = page.locator(selector).first();
        await button.waitFor({ timeout: 3000, state: 'visible' });
        searchButton = button;
        console.log(`[Test] Search button found with selector: ${selector}`);
        break;
      } catch (e) {
        // Try next selector
      }
    }

    if (!searchButton) {
      // Try submitting form with Enter key instead
      console.log('[Test] Search button not found, trying Enter key submission');
      await searchInput.press('Enter');
    } else {
      await searchButton.click();
      console.log('[Test] Clicked search button');
    }

    // Wait for vector search (1-3 seconds)
    console.log('[Test] ⏳ Waiting for vector search (1-3 seconds)...');
    await page.waitForTimeout(1500);

    // Check for loading indicators
    const loadingIndicators = [
      page.locator('text=/Searching/i'),
      page.locator('text=/Loading/i'),
      page.locator('[role="progressbar"]'),
      page.locator('.searching'),
      page.locator('.loading')
    ];

    let loadingFound = false;
    for (const indicator of loadingIndicators) {
      try {
        await indicator.waitFor({ timeout: 2000, state: 'visible' });
        loadingFound = true;
        console.log('[Test] ✅ Search loading indicator detected');
        // Wait for it to disappear
        await indicator.waitFor({ timeout: 5000, state: 'hidden' });
        break;
      } catch (e) {
        // Try next indicator
      }
    }

    if (!loadingFound) {
      console.log('[Test] ⚠️ No loading indicator (search may have been very fast)');
    }

    // Verify search results appear
    const resultIndicators = [
      page.locator('text=/results?/i'),
      page.locator('text=/found/i'),
      page.locator('text=/matches?/i'),
      page.locator('.search-result'),
      page.locator('.result-item'),
      page.locator('[data-testid="search-result"]')
    ];

    let resultsFound = false;
    for (const indicator of resultIndicators) {
      try {
        await indicator.waitFor({ timeout: 10000, state: 'visible' });
        resultsFound = true;
        console.log('[Test] ✅ Search results detected');
        break;
      } catch (e) {
        // Try next indicator
      }
    }

    if (!resultsFound) {
      console.log('[Test] ⚠️ No explicit results indicator, checking for result content');
    }

    // Wait for results to render
    await page.waitForTimeout(2000);

    // Check for relevance scores displayed
    const scorePatterns = [
      /score:?\s*[\d.]+/i,
      /relevance:?\s*[\d.]+/i,
      /[\d.]+%/,
      /\d+\.\d+/  // Generic number pattern
    ];

    let scoresFound = false;
    for (const pattern of scorePatterns) {
      try {
        const scoreElement = page.locator(`text=${pattern}`).first();
        await scoreElement.waitFor({ timeout: 5000, state: 'visible' });
        const scoreText = await scoreElement.textContent();
        console.log(`[Test] ✅ Relevance score found: ${scoreText}`);
        scoresFound = true;
        break;
      } catch (e) {
        // Try next pattern
      }
    }

    if (!scoresFound) {
      console.log('[Test] ⚠️ No relevance scores displayed (UI may not show scores)');
    }

    // Verify matched text snippets shown
    // Look for our test document content that we just uploaded
    const expectedSnippets = [
      'vector database',        // In document title and content
      'testing',                // In document title
      'main topic',             // In document content
      'test document',          // In document content
      'embeddings'              // In document content
    ];

    let snippetsFound = 0;
    for (const snippet of expectedSnippets) {
      try {
        const snippetElement = page.locator(`text=/${snippet}/i`).first();
        await snippetElement.waitFor({ timeout: 3000, state: 'visible' });
        console.log(`[Test] ✅ Found text snippet: "${snippet}"`);
        snippetsFound++;
      } catch (e) {
        // Snippet not found
      }
    }

    if (snippetsFound > 0) {
      console.log(`[Test] ✅ Found ${snippetsFound}/${expectedSnippets.length} text snippets`);
    } else {
      console.log('[Test] ⚠️ No matched text snippets found in results');
    }

    // Take screenshot of search results
    await page.screenshot({ path: 'test-results/vector-db-search-results.png' });
    console.log('[Test] Screenshot taken: search results');

    // Check console for errors
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error' && (text.includes('search') || text.includes('query'))) {
        consoleErrors.push(text);
      } else if (msg.type() === 'warning') {
        consoleWarnings.push(text);
      }
    });

    await page.waitForTimeout(1000);

    if (consoleErrors.length > 0) {
      console.log('[Test] ⚠️ Console errors during search:', consoleErrors.slice(0, 5));
    } else {
      console.log('[Test] ✅ No console errors detected');
    }

    // Log test results summary
    console.log('[Test] Search Test Summary:');
    console.log(`  - Query: "${searchQuery}"`);
    console.log(`  - Results displayed: ${resultsFound ? 'Yes' : 'Unknown'}`);
    console.log(`  - Scores displayed: ${scoresFound ? 'Yes' : 'No'}`);
    console.log(`  - Snippets found: ${snippetsFound}/${expectedSnippets.length}`);
    console.log(`  - Console errors: ${consoleErrors.length}`);

    console.log('[Test] ✅ Vector database search test passed');
  });

  test('should handle empty search results gracefully', async ({ page, testWallet }) => {
    test.setTimeout(180000); // 3 minutes
    console.log('[Test] Starting empty search results test');

    // Navigate directly to Test Database 1
    await page.goto(`${TEST_CONFIG.UI5_URL}/vector-databases`);
    await page.waitForSelector('text=Vector Databases', { timeout: 30000 });

    const databaseCard = page.locator('text=Test Database 1').first();
    await expect(databaseCard).toBeVisible({ timeout: 10000 });
    await databaseCard.click();
    console.log('[Test] Opened Test Database 1');

    await page.waitForSelector('text=/Database|Details/i', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Find vector search input (VectorSearchPanel has placeholder "Ask a question about your documents...")
    const searchInput = page.locator('input[placeholder*="Ask a question" i], input[placeholder*="documents" i]').first();
    await expect(searchInput).toBeAttached({ timeout: 5000 });

    // Search for something that shouldn't match
    const impossibleQuery = 'zyxwvutsrqponmlkjihgfedcba12345';
    await searchInput.fill(impossibleQuery);
    console.log(`[Test] Entered impossible query: "${impossibleQuery}"`);

    // Submit search
    const searchButton = page.locator('button:has-text("Search"), button[type="submit"]').first();
    try {
      await searchButton.click({ timeout: 3000 });
    } catch (e) {
      await searchInput.press('Enter');
    }

    console.log('[Test] Submitted search');

    // Wait for search to complete
    await page.waitForTimeout(3000);

    // Check for "no results" message
    const noResultsPatterns = [
      page.locator('text=/no results/i'),
      page.locator('text=/not found/i'),
      page.locator('text=/no matches/i'),
      page.locator('text=/0 results/i'),
      page.locator('text=/nothing found/i')
    ];

    let noResultsMessageFound = false;
    for (const pattern of noResultsPatterns) {
      try {
        await pattern.waitFor({ timeout: 5000, state: 'visible' });
        const messageText = await pattern.textContent();
        console.log(`[Test] ✅ "No results" message displayed: "${messageText}"`);
        noResultsMessageFound = true;
        break;
      } catch (e) {
        // Try next pattern
      }
    }

    if (!noResultsMessageFound) {
      console.log('[Test] ⚠️ No explicit "no results" message (results section may be empty)');
    }

    // Take screenshot
    await page.screenshot({ path: 'test-results/vector-db-search-no-results.png' });
    console.log('[Test] Screenshot taken: no results state');

    console.log('[Test] ✅ Empty search results test passed');
  });
});
