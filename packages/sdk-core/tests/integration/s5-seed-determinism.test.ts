// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * S5 Seed Determinism Integration Tests
 *
 * Tests the specific scenario from the bug report:
 * - User connects wallet
 * - Creates session group with data
 * - Clears browser data (cookies, localStorage, IndexedDB)
 * - Reconnects same wallet
 * - Data should be accessible (same S5 seed)
 *
 * This test verifies that address-based derivation solves the data loss bug.
 */

import { describe, it, expect } from 'vitest';
import {
  generateS5SeedFromAddress,
  deriveEntropyFromAddress,
  generateS5SeedFromPrivateKey,
  deriveEntropyFromPrivateKey,
} from '../../src/utils/s5-seed-derivation';

describe('S5 Seed Determinism Integration', () => {
  const TEST_ADDRESS = '0x1234567890123456789012345678901234567890';
  const TEST_PRIVATE_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const BASE_SEPOLIA_CHAIN_ID = 84532;
  const OPBNB_CHAIN_ID = 5611;

  describe('Browser Clear Scenario', () => {
    it('should produce same seed after simulated browser clear (address-based)', async () => {
      // Session 1: User connects wallet and generates seed
      const session1Seed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
      expect(session1Seed.split(' ').length).toBe(15);

      // === BROWSER DATA CLEARED ===
      // In real scenario: localStorage, cookies, IndexedDB all cleared
      // With address-based derivation, this doesn't matter!

      // Session 2: User reconnects same wallet
      const session2Seed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

      // CRITICAL: Seeds must be identical for data to be accessible
      expect(session2Seed).toBe(session1Seed);
    });

    it('should produce same seed after simulated browser clear (private key-based)', async () => {
      // Session 1: User uses private key auth
      const session1Seed = await generateS5SeedFromPrivateKey(TEST_PRIVATE_KEY);
      expect(session1Seed.split(' ').length).toBe(15);

      // === BROWSER DATA CLEARED ===

      // Session 2: User uses same private key
      const session2Seed = await generateS5SeedFromPrivateKey(TEST_PRIVATE_KEY);

      // Seeds must be identical
      expect(session2Seed).toBe(session1Seed);
    });
  });

  describe('MetaMask Auth Determinism', () => {
    it('should be deterministic regardless of browser/device', async () => {
      // Different "devices" with same wallet address
      const device1Seed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
      const device2Seed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
      const device3Seed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

      // All should produce identical seeds
      expect(device1Seed).toBe(device2Seed);
      expect(device2Seed).toBe(device3Seed);
    });

    it('should not require signature popup for seed derivation', async () => {
      // Address-based derivation doesn't need any signature
      // This is a key UX improvement
      const seed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

      // Just verifying it works without any signer/signature
      expect(seed).toBeDefined();
      expect(seed.split(' ').length).toBe(15);
    });
  });

  describe('Signer Auth Determinism', () => {
    it('should work with any signer type (same address = same seed)', async () => {
      // Whether MetaMask, Base Account Kit, WalletConnect, or Hardware Wallet
      // Same address should ALWAYS produce the same seed

      // Simulate different signer types all pointing to same address
      const metamaskSeed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
      const baseAccountKitSeed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
      const walletConnectSeed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

      // All identical
      expect(metamaskSeed).toBe(baseAccountKitSeed);
      expect(baseAccountKitSeed).toBe(walletConnectSeed);
    });
  });

  describe('Cross-Chain Isolation', () => {
    it('should produce different seeds for different chains', async () => {
      const baseSepoliaSeed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
      const opbnbSeed = await generateS5SeedFromAddress(TEST_ADDRESS, OPBNB_CHAIN_ID);

      // Different chains = different seeds (data isolation)
      expect(baseSepoliaSeed).not.toBe(opbnbSeed);
    });

    it('should maintain determinism within each chain', async () => {
      // Base Sepolia - multiple derivations
      const base1 = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
      const base2 = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

      // opBNB - multiple derivations
      const opbnb1 = await generateS5SeedFromAddress(TEST_ADDRESS, OPBNB_CHAIN_ID);
      const opbnb2 = await generateS5SeedFromAddress(TEST_ADDRESS, OPBNB_CHAIN_ID);

      // Same chain = same seed
      expect(base1).toBe(base2);
      expect(opbnb1).toBe(opbnb2);

      // Different chains = different seeds
      expect(base1).not.toBe(opbnb1);
    });
  });

  describe('Entropy Consistency', () => {
    it('should derive consistent 16-byte entropy from address', async () => {
      const entropy1 = await deriveEntropyFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
      const entropy2 = await deriveEntropyFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

      expect(entropy1).toBeInstanceOf(Uint8Array);
      expect(entropy1.length).toBe(16);
      expect(entropy1).toEqual(entropy2);
    });

    it('should derive consistent 16-byte entropy from private key', async () => {
      const entropy1 = await deriveEntropyFromPrivateKey(TEST_PRIVATE_KEY);
      const entropy2 = await deriveEntropyFromPrivateKey(TEST_PRIVATE_KEY);

      expect(entropy1).toBeInstanceOf(Uint8Array);
      expect(entropy1.length).toBe(16);
      expect(entropy1).toEqual(entropy2);
    });
  });
});
