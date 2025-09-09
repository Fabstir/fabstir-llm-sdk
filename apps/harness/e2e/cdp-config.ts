import { BrowserContext, Page } from '@playwright/test';

export async function setupCDP(context: BrowserContext, page: Page) {
  return await context.newCDPSession(page);
}

export async function sendCDPCommand(cdp: any, method: string, params?: any): Promise<any> {
  return await cdp.send(method, params);
}