import { Page } from '@playwright/test';
import { getTestKit } from './testkit-setup';

let connected = false;

export async function connectWallet(page: Page): Promise<void> {
  const kit = getTestKit();
  if (!kit) throw new Error('TestKit not initialized');

  await page.click('[data-testid="connect-wallet"]');
  await page.waitForSelector('[data-testid="wallet-modal"]', { timeout: 5000 });
  await kit.connect();
  connected = true;
}

export async function approveTransaction(page: Page): Promise<void> {
  const kit = getTestKit();
  if (!kit) throw new Error('TestKit not initialized');

  await page.waitForSelector('[data-testid="confirmation-modal"]', { timeout: 10000 });
  await kit.approve();
  await page.waitForSelector('[data-testid="transaction-success"]', { timeout: 30000 });
}

export function isWalletConnected(): boolean {
  return connected;
}

export async function handleModal(page: Page, action: 'accept' | 'reject'): Promise<void> {
  await page.waitForSelector('.modal-content', { timeout: 5000 });
  await page.click(action === 'accept' ? '[data-testid="modal-accept"]' : '[data-testid="modal-reject"]');
}