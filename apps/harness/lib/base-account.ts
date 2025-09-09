import { createBaseAccountSDK, base } from '@base-org/account';
import { numberToHex } from 'viem';

// Types
export type BaseAccountSDK = ReturnType<typeof createBaseAccountSDK>;

// Singleton SDK instance
let sdkInstance: BaseAccountSDK | null = null;
let connected = false;

/**
 * Create and initialize the Base Account SDK
 */
export function createSDK(): BaseAccountSDK {
  if (!sdkInstance) {
    sdkInstance = createBaseAccountSDK({
      appName: 'Fabstir Harness',
      appChainIds: [base.constants.CHAIN_IDS.base_sepolia], // 84532
    });
  }
  return sdkInstance;
}

/**
 * Connect wallet and ensure on Base Sepolia
 */
export async function connectWallet(): Promise<string[]> {
  const sdk = createSDK();
  const provider = sdk.getProvider();
  
  // Request account access
  const accounts = await provider.request({
    method: 'eth_requestAccounts',
    params: []
  }) as string[];
  
  // Switch to Base Sepolia if needed
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x14a34' }] // Base Sepolia hex
    });
  } catch (error: any) {
    // Chain might not be added, handle gracefully
    console.log('Chain switch requested:', error.message);
  }
  
  connected = true;
  return accounts;
}

/**
 * Check if wallet is connected
 */
export function isConnected(): boolean {
  return connected;
}

/**
 * Get the SDK instance
 */
export function getSDK(): BaseAccountSDK {
  return createSDK();
}