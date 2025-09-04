// src/index.ts
import { ethers } from 'ethers';

// Export main SDK class
export { FabstirSDK } from './FabstirSDK';

// Export all types
export * from './types/index';

// Constants from integration tests
export const DEFAULT_RPC_URL = 'https://base-sepolia.g.alchemy.com/v2/demo';
export const DEFAULT_S5_PORTAL = 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p';
export const MIN_ETH_PAYMENT = '0.005';  // From integration tests - minimum for profitability

// Utility function to generate S5 seed from wallet signature
// Pattern extracted from tests/integration/s5-storage.test.ts
export function generateSeedFromSignature(signature: string): string {
  // Create deterministic seed from signature
  let hash: string;
  if (ethers.utils?.keccak256) {
    hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(signature));
  } else {
    // Fallback for testing
    hash = '0x' + signature.replace('0x', '').padEnd(64, '0');
  }
  const entropy = hash.slice(2); // Remove 0x prefix
  
  // Generate 12 words from entropy (simplified version)
  const words = [];
  for (let i = 0; i < 12; i++) {
    const chunk = entropy.slice(i * 5, i * 5 + 5);
    const index = parseInt(chunk, 16) % 2048;
    // Use a simple word list for testing
    words.push(`word${index}`);
  }
  
  return words.join(' ');
}

// Re-export from existing implementation for compatibility
export { FabstirLLMSDK } from './fabstir-llm-sdk';
export { FabstirSDKHeadless } from './sdk-headless';
export { FabstirSessionSDK } from './FabstirSessionSDK';