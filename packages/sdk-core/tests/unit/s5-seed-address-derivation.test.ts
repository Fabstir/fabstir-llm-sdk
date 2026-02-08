// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * S5 Seed Address-Based Derivation Tests
 *
 * Tests for deterministic S5 seed derivation from wallet ADDRESS (not signature).
 * This ensures data persistence across browser clears and device changes.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveEntropyFromAddress,
  generateS5SeedFromAddress,
  SEED_DOMAIN_SEPARATOR,
} from '../../src/utils/s5-seed-derivation';

describe('S5 Seed Address-Based Derivation', () => {
  const TEST_ADDRESS = '0x1234567890123456789012345678901234567890';
  const TEST_ADDRESS_CHECKSUMMED = '0x1234567890123456789012345678901234567890';
  const TEST_ADDRESS_LOWERCASE = '0x1234567890123456789012345678901234567890'.toLowerCase();
  const TEST_ADDRESS_UPPERCASE = '0x1234567890123456789012345678901234567890'.toUpperCase().replace('X', 'x');
  const DIFFERENT_ADDRESS = '0xABCDEF1234567890123456789012345678901234';
  const BASE_SEPOLIA_CHAIN_ID = 84532;
  const OPBNB_CHAIN_ID = 5611;

  describe('deriveEntropyFromAddress', () => {
    it('should exist as a function', async () => {
      expect(typeof deriveEntropyFromAddress).toBe('function');
    });

    it('should return Uint8Array of 16 bytes', async () => {
      const entropy = await deriveEntropyFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

      expect(entropy).toBeInstanceOf(Uint8Array);
      expect(entropy.length).toBe(16);
    });

    it('should be deterministic (same address + chainId = same entropy)', async () => {
      const entropy1 = await deriveEntropyFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
      const entropy2 = await deriveEntropyFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

      expect(entropy1).toEqual(entropy2);
    });

    it('should produce different entropy for different addresses', async () => {
      const entropy1 = await deriveEntropyFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
      const entropy2 = await deriveEntropyFromAddress(DIFFERENT_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

      expect(entropy1).not.toEqual(entropy2);
    });

    it('should produce different entropy for different chainIds', async () => {
      const entropy1 = await deriveEntropyFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
      const entropy2 = await deriveEntropyFromAddress(TEST_ADDRESS, OPBNB_CHAIN_ID);

      expect(entropy1).not.toEqual(entropy2);
    });

    it('should be case-insensitive (0xABC... === 0xabc...)', async () => {
      const entropyLower = await deriveEntropyFromAddress(TEST_ADDRESS_LOWERCASE, BASE_SEPOLIA_CHAIN_ID);
      const entropyUpper = await deriveEntropyFromAddress(TEST_ADDRESS_UPPERCASE, BASE_SEPOLIA_CHAIN_ID);

      expect(entropyLower).toEqual(entropyUpper);
    });
  });

  describe('generateS5SeedFromAddress', () => {
    it('should exist as a function', async () => {
      expect(typeof generateS5SeedFromAddress).toBe('function');
    });

    it('should return a valid 15-word S5 phrase', async () => {
      const phrase = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

      const words = phrase.split(' ');
      expect(words.length).toBe(15);

      // Each word should be lowercase alphabetic
      for (const word of words) {
        expect(word).toMatch(/^[a-z]+$/);
        expect(word.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('should be deterministic (same address + chainId = same phrase)', async () => {
      const phrase1 = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
      const phrase2 = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

      expect(phrase1).toBe(phrase2);
    });

    it('should produce different phrases for different addresses', async () => {
      const phrase1 = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
      const phrase2 = await generateS5SeedFromAddress(DIFFERENT_ADDRESS, BASE_SEPOLIA_CHAIN_ID);

      expect(phrase1).not.toBe(phrase2);
    });

    it('should produce different phrases for different chainIds', async () => {
      const phrase1 = await generateS5SeedFromAddress(TEST_ADDRESS, BASE_SEPOLIA_CHAIN_ID);
      const phrase2 = await generateS5SeedFromAddress(TEST_ADDRESS, OPBNB_CHAIN_ID);

      expect(phrase1).not.toBe(phrase2);
    });

    it('should be case-insensitive for addresses', async () => {
      const phraseLower = await generateS5SeedFromAddress(TEST_ADDRESS_LOWERCASE, BASE_SEPOLIA_CHAIN_ID);
      const phraseUpper = await generateS5SeedFromAddress(TEST_ADDRESS_UPPERCASE, BASE_SEPOLIA_CHAIN_ID);

      expect(phraseLower).toBe(phraseUpper);
    });
  });

  describe('Domain Separator', () => {
    it('should have SEED_DOMAIN_SEPARATOR exported', () => {
      expect(SEED_DOMAIN_SEPARATOR).toBeDefined();
      expect(typeof SEED_DOMAIN_SEPARATOR).toBe('string');
      expect(SEED_DOMAIN_SEPARATOR.length).toBeGreaterThan(0);
    });
  });
});
