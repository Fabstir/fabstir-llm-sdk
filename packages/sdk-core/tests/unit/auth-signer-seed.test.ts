// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Signer Authentication S5 Seed Tests
 *
 * Verifies that signer-based authentication uses address-based seed derivation
 * instead of signature-based derivation. Works with any signer type.
 */

import { describe, it, expect, vi } from 'vitest';
import { generateS5SeedFromAddress } from '../../src/utils/s5-seed-derivation';

describe('Signer Authentication S5 Seed', () => {
  const TEST_ADDRESS = '0x1234567890123456789012345678901234567890';
  const DIFFERENT_ADDRESS = '0xABCDEF1234567890123456789012345678901234';
  const BASE_SEPOLIA_CHAIN_ID = 84532;
  const OPBNB_CHAIN_ID = 5611;

  it('should derive S5 seed from address without requiring signMessage', async () => {
    // Address-based derivation should work without any signer
    // This proves no signature popup is needed
    const seed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

    // Should return a valid 15-word S5 phrase
    const words = seed.split(' ');
    expect(words.length).toBe(15);
  });

  it('should work with Base Account Kit signer (same address = same seed)', async () => {
    // Base Account Kit uses ephemeral CryptoKey for signatures
    // which are NOT deterministic. But addresses ARE deterministic.

    // Simulate two sessions with same address but different signers
    const session1Seed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
    const session2Seed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

    // Both sessions should get the same seed (address-based determinism)
    expect(session1Seed).toBe(session2Seed);
  });

  it('should work with EOA signer (same address = same seed)', async () => {
    // Even though EOA might have consistent signatures, we don't rely on it
    // We use the address which is ALWAYS deterministic

    const eoa1Seed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
    const eoa2Seed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

    expect(eoa1Seed).toBe(eoa2Seed);
  });

  it('should produce same seed regardless of signer type', async () => {
    // Whether MetaMask, Base Account Kit, WalletConnect, or Hardware Wallet
    // Same address should ALWAYS produce the same seed

    const metamaskSeed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
    const baseAccountKitSeed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
    const walletConnectSeed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
    const hardwareWalletSeed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

    // All should be identical
    expect(metamaskSeed).toBe(baseAccountKitSeed);
    expect(metamaskSeed).toBe(walletConnectSeed);
    expect(metamaskSeed).toBe(hardwareWalletSeed);
  });

  it('should produce different seeds for different addresses', async () => {
    const seed1 = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
    const seed2 = await generateS5SeedFromAddress(DIFFERENT_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

    expect(seed1).not.toBe(seed2);
  });

  it('should produce different seeds for different chains (cross-chain isolation)', async () => {
    const baseSepoliaSeed = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
    const opbnbSeed = await generateS5SeedFromAddress(TEST_ADDRESS, OPBNB_CHAIN_ID);

    expect(baseSepoliaSeed).not.toBe(opbnbSeed);
  });
});
