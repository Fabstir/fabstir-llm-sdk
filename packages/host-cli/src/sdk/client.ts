// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * SDK Client Wrapper
 * Thin wrapper around FabstirSDKCore for host CLI usage
 */

import { FabstirSDKCore } from '@fabstir/sdk-core';
import { createSDKConfig, SDKConfig, validateConfig } from './config';
import { getPrivateKey } from './secrets';
import {
  setConnectionStatus,
  getConnectionStatus,
  ConnectionStatus,
  resetStatus
} from './status';
import {
  setAuthSDK,
  authenticate as authAuthenticate,
  isAuthenticated as authIsAuthenticated,
  getAuthenticatedAddress as authGetAddress,
  clearAuthentication as authClear,
  resetAuth
} from './auth';
import { withRetry, createRetryPolicy } from './retry';

// Export status types
export { ConnectionStatus, getConnectionStatus };

// Singleton instance
let sdkInstance: FabstirSDKCore | null = null;

/**
 * Initialize the SDK with configuration
 */
export async function initializeSDK(network: 'base-mainnet' | 'base-sepolia' = 'base-sepolia'): Promise<FabstirSDKCore> {
  if (sdkInstance) {
    return sdkInstance;
  }

  try {
    // Create config from environment
    const config = createSDKConfig(network);

    // Validate configuration
    validateConfig(config);

    // Create SDK instance
    sdkInstance = new FabstirSDKCore(config);

    // Set SDK for auth manager
    setAuthSDK(sdkInstance);

    // Set initial status
    setConnectionStatus(ConnectionStatus.DISCONNECTED);

    return sdkInstance;
  } catch (error) {
    setConnectionStatus(ConnectionStatus.ERROR, error as Error);
    throw error;
  }
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

  // Use auth module with retry
  const authFn = async () => {
    await authAuthenticate({ method: 'privatekey', privateKey: key });

    // Verify authentication
    if (!authIsAuthenticated()) {
      throw new Error('SDK authentication failed');
    }
  };

  // Apply retry logic
  await withRetry(authFn, createRetryPolicy('auth'));
}

/**
 * Get the authenticated wallet address
 */
export function getAuthenticatedAddress(): string | null {
  return authGetAddress();
}

/**
 * Connect to the blockchain and verify connection
 */
export async function connectToBlockchain(): Promise<boolean> {
  const sdk = getSDK();

  try {
    // The SDK should have a provider after initialization
    const provider = sdk.getProvider();
    if (!provider) {
      throw new Error('SDK provider not initialized');
    }

    // Test the connection by getting the block number
    const blockNumber = await provider.getBlockNumber();
    console.log(`Connected to blockchain at block ${blockNumber}`);

    // Verify network
    const network = await provider.getNetwork();
    const expectedChainId = sdk.getChainId();

    if (Number(network.chainId) !== expectedChainId) {
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

  if (!authIsAuthenticated()) {
    throw new Error('SDK not authenticated. Call authenticateSDK() first.');
  }

  return sdk.getHostManager();
}

/**
 * Get the Payment Manager
 */
export function getPaymentManager() {
  const sdk = getSDK();

  if (!authIsAuthenticated()) {
    throw new Error('SDK not authenticated. Call authenticateSDK() first.');
  }

  return sdk.getPaymentManager();
}

/**
 * Get the Session Manager
 */
export function getSessionManager() {
  const sdk = getSDK();

  if (!authIsAuthenticated()) {
    throw new Error('SDK not authenticated. Call authenticateSDK() first.');
  }

  return sdk.getSessionManager();
}

/**
 * Get the Treasury Manager
 */
export function getTreasuryManager() {
  const sdk = getSDK();

  if (!authIsAuthenticated()) {
    throw new Error('SDK not authenticated. Call authenticateSDK() first.');
  }

  return sdk.getTreasuryManager();
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

  // Reset auth and status managers
  resetAuth();
  resetStatus();
}