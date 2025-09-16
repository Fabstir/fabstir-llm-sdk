/**
 * SDK Client Wrapper
 * Thin wrapper around FabstirSDKCore for host CLI usage
 */

import { FabstirSDKCore } from '@fabstir/sdk-core';
import { createSDKConfig, SDKConfig } from './config';
import { getPrivateKey } from './secrets';

// Singleton instance
let sdkInstance: FabstirSDKCore | null = null;

/**
 * Initialize the SDK with configuration
 */
export async function initializeSDK(network: 'base-mainnet' | 'base-sepolia' = 'base-sepolia'): Promise<FabstirSDKCore> {
  if (sdkInstance) {
    return sdkInstance;
  }

  // Create config from environment
  const config = createSDKConfig(network);

  // Create SDK instance
  sdkInstance = new FabstirSDKCore(config);

  return sdkInstance;
}

/**
 * Get the current SDK instance
 */
export function getSDK(): FabstirSDKCore {
  if (!sdkInstance) {
    throw new Error('SDK not initialized. Call initializeSDK() first.');
  }
  return sdkInstance;
}

/**
 * Authenticate the SDK with a private key
 */
export async function authenticateSDK(privateKey?: string): Promise<void> {
  const sdk = getSDK();

  // Get private key from various sources if not provided
  const key = privateKey || await getPrivateKey();

  // Authenticate with the SDK
  await sdk.authenticate('privatekey', { privateKey: key });

  // Verify authentication
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK authentication failed');
  }
}

/**
 * Get the authenticated wallet address
 */
export function getAuthenticatedAddress(): string | null {
  const sdk = getSDK();

  if (!sdk.isAuthenticated()) {
    return null;
  }

  return sdk.signer ? sdk.signer.address : null;
}

/**
 * Connect to the blockchain and verify connection
 */
export async function connectToBlockchain(): Promise<boolean> {
  const sdk = getSDK();

  try {
    // The SDK should have a provider after initialization
    if (!sdk.provider) {
      throw new Error('SDK provider not initialized');
    }

    // Test the connection by getting the block number
    const blockNumber = await sdk.provider.getBlockNumber();
    console.log(`Connected to blockchain at block ${blockNumber}`);

    // Verify network
    const network = await sdk.provider.getNetwork();
    const expectedChainId = sdk.config.chainId;

    if (network.chainId !== expectedChainId) {
      throw new Error(`Wrong network. Expected chainId ${expectedChainId}, got ${network.chainId}`);
    }

    return true;
  } catch (error: any) {
    console.error('Failed to connect to blockchain:', error);
    throw error;
  }
}

/**
 * Get the Host Manager
 */
export function getHostManager() {
  const sdk = getSDK();

  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated. Call authenticateSDK() first.');
  }

  return sdk.getHostManager();
}

/**
 * Get the Payment Manager
 */
export function getPaymentManager() {
  const sdk = getSDK();

  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated. Call authenticateSDK() first.');
  }

  return sdk.getPaymentManager();
}

/**
 * Get the Session Manager
 */
export function getSessionManager() {
  const sdk = getSDK();

  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated. Call authenticateSDK() first.');
  }

  return sdk.getSessionManager();
}

/**
 * Cleanup and reset the SDK
 */
export async function cleanupSDK(): Promise<void> {
  if (sdkInstance) {
    // Cleanup if method exists
    if (typeof (sdkInstance as any).cleanup === 'function') {
      await (sdkInstance as any).cleanup();
    }
    sdkInstance = null;
  }
}