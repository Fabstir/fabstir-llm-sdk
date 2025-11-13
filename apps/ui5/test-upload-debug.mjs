#!/usr/bin/env node

import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testUpload() {
  const browser = await puppeteer.launch({
    headless: true,  // Run in headless mode for container
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Listen to all console messages
  page.on('console', msg => {
    console.log(`[Browser ${msg.type()}]:`, msg.text());
  });

  page.on('pageerror', error => {
    console.error('[Browser Error]:', error.message);
  });

  try {
    console.log('\n=== Testing Group Document Upload ===\n');

    // First navigate to the domain to set localStorage
    console.log('1. Setting up mock wallet...');
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle2' });

    // Inject mock wallet state into localStorage
    await page.evaluate(() => {
      localStorage.setItem('ui4-mock-wallet-address', '0x1234567890ABCDEF1234567890ABCDEF12345678');
    });
    console.log('Mock wallet connected');

    // Now navigate to the Personal Notes group
    console.log('2. Navigating to Personal Notes group...');
    await page.goto('http://localhost:3001/session-groups/group-personal', {
      waitUntil: 'networkidle2'
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Take a screenshot
    await page.screenshot({ path: 'upload-test-1-loaded.png' });
    console.log('Screenshot saved: upload-test-1-loaded.png');

    // Check if file input exists
    const fileInputExists = await page.$('#group-file-upload');
    console.log('File input exists:', !!fileInputExists);

    // Check if label exists
    const labelExists = await page.$('label[for="group-file-upload"]');
    console.log('Upload label exists:', !!labelExists);

    if (labelExists) {
      const labelText = await page.$eval('label[for="group-file-upload"]', el => el.textContent);
      console.log('Label text:', labelText);
    }

    // Create a test file
    const testFilePath = join(__dirname, 'test-upload-debug.txt');
    fs.writeFileSync(testFilePath, 'This is a test document for debugging upload.');
    console.log(`Created test file: ${testFilePath}`);

    // Try to upload the file
    console.log('\n3. Attempting file upload...');

    if (fileInputExists) {
      // Method 1: Direct file input
      console.log('Using direct file input...');
      await fileInputExists.uploadFile(testFilePath);

      // Wait a bit for onChange to fire
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Take another screenshot
      await page.screenshot({ path: 'upload-test-2-after-upload.png' });
      console.log('Screenshot saved: upload-test-2-after-upload.png');

      // Check if document appeared
      const docList = await page.$$('.space-y-2 > div');
      console.log(`Documents in list: ${docList.length}`);

      // Check for "No documents" message
      const noDocsMsg = await page.$('text/No documents uploaded yet');
      console.log('Still showing "No documents":', !!noDocsMsg);

      // Check for "Uploading..." state
      const uploadingLabel = await page.$('text/Uploading...');
      console.log('Showing "Uploading...":', !!uploadingLabel);
    }

    // Clean up test file
    fs.unlinkSync(testFilePath);

    console.log('\n=== Test Complete - Press Ctrl+C to close ===\n');

    // Keep browser open for inspection
    await new Promise(resolve => setTimeout(resolve, 30000));

  } catch (error) {
    console.error('Test failed:', error);
    await page.screenshot({ path: 'upload-test-error.png' });
  } finally {
    await browser.close();
  }
}

testUpload().catch(console.error);
