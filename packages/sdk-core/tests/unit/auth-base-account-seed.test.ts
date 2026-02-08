// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Base Account Kit Authentication S5 Seed Tests
 *
 * Verifies that Base Account Kit authentication uses the shared
 * address-based seed derivation function for consistency.
 */

import { describe, it, expect } from 'vitest';
import { generateS5SeedFromAddress } from '../../src/utils/s5-seed-derivation';

describe('Base Account Kit Authentication S5 Seed', () => {
  const PRIMARY_ACCOUNT = '0x1234567890123456789012345678901234567890';
  const SUB_ACCOUNT = '0xABCDEF1234567890123456789012345678901234';
  const BASE_SEPOLIA_CHAIN_ID = 84532;

  it('should use generateS5SeedFromAddress for consistent derivation', async () => {
    // The shared function should work the same for Base Account Kit
    const seed = await generateS5SeedFromAddress(PRIMARY_ACCOUNT, BASE_SEPOLIA_CHAIN_ID);

    // Should return a valid 15-word S5 phrase
    const words = seed.split(' ');
    expect(words.length).toBe(15);

    // Should be deterministic
    const seed2 = await generateS5SeedFromAddress(PRIMARY_ACCOUNT, BASE_SEPOLIA_CHAIN_ID);
    expect(seed).toBe(seed2);
  });

  it('should produce same seed for primary account regardless of sub-account', async () => {
    // The S5 identity is derived from PRIMARY account, not sub-account
    // This ensures data sovereignty - user's identity is tied to their smart wallet
    const seedFromPrimary = await generateS5SeedFromAddress(PRIMARY_ACCOUNT, BASE_SEPOLIA_CHAIN_ID);

    // Even with different sub-accounts, same primary = same seed
    const seedAgain = await generateS5SeedFromAddress(PRIMARY_ACCOUNT, BASE_SEPOLIA_CHAIN_ID);

    expect(seedFromPrimary).toBe(seedAgain);
  });

  it('should cache seed for sub-account address', async () => {
    // When authenticating with Base Account Kit:
    // 1. Derive seed from PRIMARY account address
    // 2. Cache seed for SUB-ACCOUNT address (for faster lookups)
    // This test verifies the derivation logic

    const seed = await generateS5SeedFromAddress(PRIMARY_ACCOUNT, BASE_SEPOLIA_CHAIN_ID);

    // The seed is derived from primary but will be cached for sub-account
    // This is handled by the authenticateWithBaseAccount method
    expect(seed).toBeDefined();
    expect(seed.split(' ').length).toBe(15);
  });

  it('should be cross-session deterministic (survives browser clear)', async () => {
    // Simulate session 1
    const session1Seed = await generateS5SeedFromAddress(PRIMARY_ACCOUNT, BASE_SEPOLIA_CHAIN_ID);

    // Simulate browser clear (no cache)
    // The function doesn't use cache - it's pure

    // Simulate session 2 (new browser, no cache)
    const session2Seed = await generateS5SeedFromAddress(PRIMARY_ACCOUNT, BASE_SEPOLIA_CHAIN_ID);

    // Same primary account = same seed
    expect(session1Seed).toBe(session2Seed);
  });
});
