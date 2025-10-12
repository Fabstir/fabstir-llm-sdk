import { describe, test, expect } from 'vitest';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { ChainId } from '../../src/types/chain.types';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../../.env.test') });

describe('Host Public Key Discovery Integration', () => {
  test('should expose getHostPublicKey method', () => {
    // Get chain configuration
    const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);

    // Initialize SDK (without authentication)
    const sdk = new FabstirSDKCore({
      mode: 'development',
      chainId: ChainId.BASE_SEPOLIA,
      rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/test',
      contractAddresses: {
        jobMarketplace: chain.contracts.jobMarketplace,
        nodeRegistry: chain.contracts.nodeRegistry,
        proofSystem: chain.contracts.proofSystem,
        hostEarnings: chain.contracts.hostEarnings,
        modelRegistry: chain.contracts.modelRegistry,
        usdcToken: chain.contracts.usdcToken,
        fabToken: chain.contracts.fabToken,
      }
    });

    // Verify method exists
    expect(sdk.getHostPublicKey).toBeDefined();
    expect(typeof sdk.getHostPublicKey).toBe('function');
  });

  test('should have correct method signature', () => {
    const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);

    const sdk = new FabstirSDKCore({
      mode: 'development',
      chainId: ChainId.BASE_SEPOLIA,
      rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/test',
      contractAddresses: {
        jobMarketplace: chain.contracts.jobMarketplace,
        nodeRegistry: chain.contracts.nodeRegistry,
        proofSystem: chain.contracts.proofSystem,
        hostEarnings: chain.contracts.hostEarnings,
        modelRegistry: chain.contracts.modelRegistry,
        usdcToken: chain.contracts.usdcToken,
        fabToken: chain.contracts.fabToken,
      }
    });

    // Check method signature (returns Promise)
    expect(sdk.getHostPublicKey.constructor.name).toBe('AsyncFunction');

    // Check that it requires authentication
    expect(async () => {
      await sdk.getHostPublicKey('0x1234567890123456789012345678901234567890');
    }).rejects.toThrow(/not authenticated/i);
  });

  test('should be part of SDK public API', () => {
    const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);

    const sdk = new FabstirSDKCore({
      mode: 'development',
      chainId: ChainId.BASE_SEPOLIA,
      rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/test',
      contractAddresses: {
        jobMarketplace: chain.contracts.jobMarketplace,
        nodeRegistry: chain.contracts.nodeRegistry,
        proofSystem: chain.contracts.proofSystem,
        hostEarnings: chain.contracts.hostEarnings,
        modelRegistry: chain.contracts.modelRegistry,
        usdcToken: chain.contracts.usdcToken,
        fabToken: chain.contracts.fabToken,
      }
    });

    // Verify it's enumerable (part of public API)
    const sdkMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(sdk));
    expect(sdkMethods).toContain('getHostPublicKey');
  });
});
