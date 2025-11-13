import { test as base, expect } from '@playwright/test';
import { TestWalletProvider } from './test-wallet-provider';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.test
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

export interface TestFixtures {
  testWallet: TestWalletProvider;
}

/**
 * Extended Playwright test with test wallet fixture
 *
 * Automatically creates and injects test wallet into browser context
 * for automated blockchain testing without manual approvals.
 */
export const test = base.extend<TestFixtures>({
  testWallet: async ({ page }, use) => {
    // Validate environment variables
    if (!process.env.TEST_USER_1_PRIVATE_KEY) {
      throw new Error('Missing TEST_USER_1_PRIVATE_KEY in .env.test');
    }
    if (!process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA) {
      throw new Error('Missing NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA in .env.test');
    }

    // Create test wallet
    const testWallet = new TestWalletProvider({
      privateKey: process.env.TEST_USER_1_PRIVATE_KEY,
      rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA,
      chainId: 84532,
    });

    console.log(`[TestSetup] Created test wallet: ${testWallet.getAddress()}`);

    // Inject wallet into browser BEFORE navigation
    await page.addInitScript((walletData) => {
      console.log('[Browser] Test wallet injected:', walletData.address);
      (window as any).__TEST_WALLET__ = {
        address: walletData.address,
        chainId: walletData.chainId,
        signer: null, // Will be created by SDK using injected wallet
        autoApprove: true,
      };
    }, {
      address: testWallet.getAddress(),
      chainId: testWallet.chainId,
    });

    // Provide test wallet to test
    await use(testWallet);

    // Cleanup (if needed)
    console.log('[TestSetup] Test wallet cleanup completed');
  },
});

export { expect };

/**
 * Common test utilities
 */
export const TEST_CONFIG = {
  UI5_URL: 'http://localhost:3002',
  SDK_INIT_TIMEOUT: 30000, // 30 seconds for SDK initialization
  TX_TIMEOUT: 30000, // 30 seconds for blockchain transactions
  S5_UPLOAD_TIMEOUT: 30000, // 30 seconds for S5 uploads
  WEBSOCKET_TIMEOUT: 30000, // 30 seconds for WebSocket connections
  LLM_RESPONSE_TIMEOUT: 30000, // 30 seconds for LLM responses
};

/**
 * Wait for SDK initialization
 */
export async function waitForSDKInit(page: any) {
  await page.waitForSelector('text=✓ SDK Ready', { timeout: TEST_CONFIG.SDK_INIT_TIMEOUT });
  console.log('[Test] SDK initialized successfully');
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTransactionConfirmation(page: any, successText = 'Transaction confirmed') {
  await page.waitForSelector(`text=${successText}`, { timeout: TEST_CONFIG.TX_TIMEOUT });
  console.log('[Test] Transaction confirmed');
}

/**
 * Wait for S5 upload
 */
export async function waitForS5Upload(page: any, successText = 'Upload successful') {
  await page.waitForSelector(`text=${successText}`, { timeout: TEST_CONFIG.S5_UPLOAD_TIMEOUT });
  console.log('[Test] S5 upload completed');
}
