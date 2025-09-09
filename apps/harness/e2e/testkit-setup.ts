import { Page } from '@playwright/test';
import { OnchainTestKit } from '@coinbase/onchaintestkit';

let testKit: OnchainTestKit | null = null;

export async function initializeTestKit(page: Page): Promise<OnchainTestKit> {
  if (testKit) await cleanupTestKit();
  
  testKit = await OnchainTestKit.init({
    page,
    wallets: {
      coinbase: { autoConnect: true, skipOnboarding: true }
    }
  });
  return testKit;
}

export async function cleanupTestKit(): Promise<void> {
  if (testKit) {
    await testKit.destroy();
    testKit = null;
  }
}

export function getTestKit(): OnchainTestKit | null {
  return testKit;
}