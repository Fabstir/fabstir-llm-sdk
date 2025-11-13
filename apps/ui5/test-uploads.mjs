#!/usr/bin/env node

import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testUploads() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Set viewport
  await page.setViewport({ width: 1920, height: 1080 });

  // Listen to console messages
  page.on('console', msg => {
    console.log(`[Browser Console ${msg.type()}]:`, msg.text());
  });

  // Listen to errors
  page.on('pageerror', error => {
    console.error('[Browser Error]:', error.message);
  });

  try {
    console.log('\n=== Testing UI4 Upload Features ===\n');

    // Navigate directly to the existing test session group
    console.log('1. Navigating to session group...');
    const testGroupId = 'group-1762820648302-cs0ubq4';
    await page.goto(`http://localhost:3001/session-groups/${testGroupId}`, { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 1: Group Document Upload
    console.log('\n=== Test 1: Group Document Upload ===');

    // Check if we're on the group detail page
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // Look for Group Documents section
    const groupDocsHeading = await page.$('h3::-p-text(Group Documents)');
    if (!groupDocsHeading) {
      console.error('❌ Group Documents section not found');
    } else {
      console.log('✓ Group Documents section found');
    }

    // Find the file input
    console.log('Looking for file input...');
    const fileInput = await page.$('#group-file-upload');
    if (!fileInput) {
      console.error('❌ File input #group-file-upload not found');

      // Debug: List all inputs
      const allInputs = await page.$$('input');
      console.log(`Total inputs on page: ${allInputs.length}`);
      for (let i = 0; i < allInputs.length; i++) {
        const type = await allInputs[i].evaluate(el => el.type);
        const id = await allInputs[i].evaluate(el => el.id);
        const className = await allInputs[i].evaluate(el => el.className);
        console.log(`  Input ${i}: type=${type}, id=${id}, class=${className}`);
      }
    } else {
      console.log('✓ File input found');

      // Create a test file
      const testFilePath = join(__dirname, 'test-upload.txt');
      fs.writeFileSync(testFilePath, 'This is a test document for upload testing.');
      console.log(`Created test file: ${testFilePath}`);

      // Upload file
      console.log('Uploading test file...');
      await fileInput.uploadFile(testFilePath);

      // Wait for upload to process
      console.log('Waiting for upload to process...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if document appears in list
      const docItems = await page.$$('.group .flex.items-center.gap-2');
      console.log(`Document items found: ${docItems.length}`);

      // Check for "No documents uploaded yet" message
      const noDocsMsg = await page.$('text/No documents uploaded yet');
      if (noDocsMsg) {
        console.error('❌ Upload failed - still showing "No documents uploaded yet"');

        // Check if uploading state is stuck
        const uploadingLabel = await page.$('text/Uploading...');
        if (uploadingLabel) {
          console.error('❌ Upload appears stuck in "Uploading..." state');
        }

        // Check console for errors
        console.log('Checking for JavaScript errors...');

      } else {
        console.log('✓ Upload succeeded - document list updated');
      }

      // Clean up test file
      fs.unlinkSync(testFilePath);
    }

    // Test 2: Session-Level Upload (Paperclip)
    console.log('\n=== Test 2: Session-Level Upload (Paperclip in Chat) ===');

    // Navigate to a chat session
    console.log('Looking for chat sessions...');
    const sessionCards = await page.$$('[class*="cursor-pointer"]');
    let foundSession = false;

    for (const card of sessionCards) {
      const onClick = await card.evaluate(el => el.getAttribute('onclick'));
      const text = await card.evaluate(el => el.textContent);
      if (text && text.includes('messages')) {
        console.log('Found session card, clicking...');
        await card.click();
        foundSession = true;
        break;
      }
    }

    if (!foundSession) {
      console.log('No existing sessions, clicking New Chat button...');
      const newChatBtn = await page.$('button::-p-text(New Chat)');
      if (newChatBtn) {
        await newChatBtn.click();
      } else {
        console.error('❌ Could not find New Chat button');
      }
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Look for paperclip button
    console.log('Looking for paperclip button...');
    const paperclipBtn = await page.$('button[title="Attach files"]');
    if (!paperclipBtn) {
      console.error('❌ Paperclip button not found');

      // Debug: Find all buttons
      const allButtons = await page.$$('button');
      console.log(`Total buttons on page: ${allButtons.length}`);
      for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
        const text = await allButtons[i].evaluate(el => el.textContent);
        const title = await allButtons[i].evaluate(el => el.title);
        console.log(`  Button ${i}: text="${text}", title="${title}"`);
      }
    } else {
      console.log('✓ Paperclip button found');

      // Get the file input (should be hidden)
      const sessionFileInput = await page.$('input[type="file"][multiple]');
      if (!sessionFileInput) {
        console.error('❌ Session file input not found');
      } else {
        console.log('✓ Session file input found');

        // Create test file
        const testFilePath2 = join(__dirname, 'test-session-upload.txt');
        fs.writeFileSync(testFilePath2, 'This is a session-specific test document.');

        // Upload via the input directly
        console.log('Uploading file via paperclip...');
        await sessionFileInput.uploadFile(testFilePath2);

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check for file preview
        const filePreview = await page.$('.bg-blue-50.border-blue-200');
        if (!filePreview) {
          console.error('❌ File preview not showing');
        } else {
          console.log('✓ File preview showing');

          // Get file name from preview
          const fileName = await page.$eval('.bg-blue-50 .text-blue-900', el => el.textContent);
          console.log(`  File in preview: ${fileName}`);
        }

        // Clean up
        fs.unlinkSync(testFilePath2);
      }
    }

    console.log('\n=== Test Complete ===\n');

  } catch (error) {
    console.error('Test failed:', error);
    // Take screenshot on error
    await page.screenshot({ path: 'error-screenshot.png' });
    console.log('Screenshot saved to error-screenshot.png');
  } finally {
    await browser.close();
  }
}

testUploads().catch(console.error);
