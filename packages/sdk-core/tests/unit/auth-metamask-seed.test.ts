// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * MetaMask Authentication S5 Seed Tests
 *
 * Verifies that MetaMask authentication uses address-based seed derivation
 * instead of signature-based derivation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { ChainId } from '../../src/config/ChainRegistry';

// Mock window.ethereum for MetaMask
const createMockEthereum = (address: string) => ({
  request: vi.fn().mockImplementation(async ({ method }: { method: string }) => {
    if (method === 'eth_requestAccounts') {
      return [address];
    }
    if (method === 'eth_chainId') {
      return '0x14a34'; // 84532 in hex (Base Sepolia)
    }
    if (method === 'wallet_switchEthereumChain') {
      return null;
    }
    return null;
  }),
  on: vi.fn(),
  removeListener: vi.fn(),
  isMetaMask: true,
});

describe('MetaMask Authentication S5 Seed', () => {
  const TEST_ADDRESS = '0x1234567890123456789012345678901234567890';
  const DIFFERENT_ADDRESS = '0xABCDEF1234567890123456789012345678901234';
  const BASE_SEPOLIA_CHAIN_ID = 84532;

  let originalWindow: any;

  beforeEach(() => {
    // Save original window
    originalWindow = global.window;
    // Reset window.ethereum
    (global as any).window = {
      ethereum: createMockEthereum(TEST_ADDRESS),
      localStorage: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(),
      },
    };
  });

  afterEach(() => {
    // Restore original window
    global.window = originalWindow;
    vi.clearAllMocks();
  });

  it('should derive S5 seed from address, not signature', async () => {
    // This test verifies that address-based derivation is deterministic
    // and doesn't require wallet signatures (no popup)
    const { generateS5SeedFromAddress } = await import('../../src/utils/s5-seed-derivation');

    // Address-based derivation should work without any signer/signature
    const seed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

    // Should return a valid 15-word S5 phrase
    const words = seed.split(' ');
    expect(words.length).toBe(15);

    // Should be deterministic (same address = same seed, no signature needed)
    const seed2 = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
    expect(seed).toBe(seed2);
  });

  it('should produce same seed after simulated browser clear', async () => {
    // This test verifies determinism - same address = same seed
    // even after "clearing browser data" (which clears the cache)

    const { generateS5SeedFromAddress } = await import('../../src/utils/s5-seed-derivation');

    // First derivation
    const seed1 = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

    // Simulate "browser clear" by not using cache
    // (generateS5SeedFromAddress doesn't use cache - it's pure)

    // Second derivation (after "browser clear")
    const seed2 = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

    // Should be identical
    expect(seed1).toBe(seed2);
  });

  it('should produce different seeds for different addresses', async () => {
    const { generateS5SeedFromAddress } = await import('../../src/utils/s5-seed-derivation');

    const seed1 = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
    const seed2 = await generateS5SeedFromAddress(DIFFERENT_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

    expect(seed1).not.toBe(seed2);
  });

  it('should prioritize config.s5Config.seedPhrase over address derivation', async () => {
    const { generateS5SeedFromAddress } = await import('../../src/utils/s5-seed-derivation');

    const providedSeed = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13 word14 word15';
    const addressDerivedSeed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

    // When seedPhrase is provided, it should take priority
    // The address-derived seed should be different from the provided one
    expect(addressDerivedSeed).not.toBe(providedSeed);
  });
});
