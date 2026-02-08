// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Private Key Authentication S5 Seed Tests
 *
 * Verifies that private key authentication uses deterministic seed derivation
 * from the private key itself (not signatures).
 */

import { describe, it, expect } from 'vitest';
import { generateS5SeedFromPrivateKey, deriveEntropyFromPrivateKey } from '../../src/utils/s5-seed-derivation';

describe('Private Key Authentication S5 Seed', () => {
  // Test private key (DO NOT use in production!)
  const TEST_PRIVATE_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const DIFFERENT_PRIVATE_KEY = '0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

  it('should derive S5 seed deterministically from private key', async () => {
    const seed = await generateS5SeedFromPrivateKey(TEST_PRIVATE_KEY);

    // Should return a valid 15-word S5 phrase
    const words = seed.split(' ');
    expect(words.length).toBe(15);

    // Should be deterministic
    const seed2 = await generateS5SeedFromPrivateKey(TEST_PRIVATE_KEY);
    expect(seed).toBe(seed2);
  });

  it('should derive entropy of 16 bytes from private key', async () => {
    const entropy = await deriveEntropyFromPrivateKey(TEST_PRIVATE_KEY);

    expect(entropy).toBeInstanceOf(Uint8Array);
    expect(entropy.length).toBe(16);
  });

  it('should produce same seed across "browser clears" (no cache dependency)', async () => {
    // Simulate session 1
    const session1Seed = await generateS5SeedFromPrivateKey(TEST_PRIVATE_KEY);

    // Simulate browser clear (the function doesn't use cache)

    // Simulate session 2
    const session2Seed = await generateS5SeedFromPrivateKey(TEST_PRIVATE_KEY);

    // Should be identical (deterministic from private key)
    expect(session1Seed).toBe(session2Seed);
  });

  it('should produce different seeds for different private keys', async () => {
    const seed1 = await generateS5SeedFromPrivateKey(TEST_PRIVATE_KEY);
    const seed2 = await generateS5SeedFromPrivateKey(DIFFERENT_PRIVATE_KEY);

    expect(seed1).not.toBe(seed2);
  });

  it('should work without 0x prefix', async () => {
    const withPrefix = await generateS5SeedFromPrivateKey(TEST_PRIVATE_KEY);
    const withoutPrefix = await generateS5SeedFromPrivateKey(TEST_PRIVATE_KEY.slice(2));

    expect(withPrefix).toBe(withoutPrefix);
  });

  it('should throw on invalid private key format', async () => {
    // Too short
    await expect(generateS5SeedFromPrivateKey('0x1234')).rejects.toThrow();

    // Invalid characters
    await expect(generateS5SeedFromPrivateKey('0x' + 'g'.repeat(64))).rejects.toThrow();
  });
});
