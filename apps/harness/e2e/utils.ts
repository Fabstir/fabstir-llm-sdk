import { Page, expect } from '@playwright/test';

export async function waitForElement(page: Page, selector: string, timeout = 5000) {
  const element = page.locator(selector);
  await expect(element).toBeVisible({ timeout });
  return element;
}

export async function clickAndWait(page: Page, selector: string, waitFor?: 'navigation' | 'response') {
  const element = await waitForElement(page, selector);
  
  if (waitFor === 'navigation') {
    await Promise.all([page.waitForNavigation(), element.click()]);
  } else if (waitFor === 'response') {
    await Promise.all([
      page.waitForResponse(response => response.status() === 200),
      element.click()
    ]);
  } else {
    await element.click();
  }
}

export async function expectText(page: Page, selector: string, text: string) {
  const element = await waitForElement(page, selector);
  await expect(element).toContainText(text);
}