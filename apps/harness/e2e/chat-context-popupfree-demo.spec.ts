import { test, expect } from '@playwright/test';

test('chat-context-popupfree-demo page loads without errors', async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.goto('http://localhost:3000/chat-context-popupfree-demo', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  // Wait for the page to render
  await page.waitForTimeout(3000);

  // Check if page loaded by looking for any content
  const bodyText = await page.textContent('body');
  expect(bodyText).toBeTruthy();

  // Log any errors
  if (errors.length > 0) {
    console.log('Page errors detected:');
    errors.forEach(err => console.log(err));
  }

  // Fail test if there are errors
  expect(errors.length).toBe(0);
});