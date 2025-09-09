import { createSDK } from './base-account';

// Provider singleton
let provider: any = null;

/**
 * Get the EIP-1193 provider from Base Account SDK
 */
export function getProvider() {
  if (!provider) {
    const sdk = createSDK();
    provider = sdk.getProvider();
  }
  return provider;
}

/**
 * Reset provider (useful for testing)
 */
export function resetProvider() {
  provider = null;
}