import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  deriveEntropyFromSignature,
  entropyToS5Phrase,
  getOrGenerateS5Seed,
  generateS5SeedWithoutCache,
  hasCachedSeed,
  clearCachedSeed
} from '../../src/utils/s5-seed-derivation';
import { ethers } from 'ethers';

describe('S5 Seed Derivation', () => {
  beforeEach(() => {
    // Clear localStorage mock
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  describe('deriveEntropyFromSignature', () => {
    it('should derive consistent entropy from signature', async () => {
      const signature = '0x' + 'a'.repeat(130); // Valid signature format

      const entropy = await deriveEntropyFromSignature(signature);

      expect(entropy).toBeInstanceOf(Uint8Array);
      expect(entropy.length).toBe(16); // Should be 16 bytes

      // Should be deterministic
      const entropy2 = await deriveEntropyFromSignature(signature);
      expect(entropy).toEqual(entropy2);
    });

    it('should produce different entropy for different signatures', async () => {
      const sig1 = '0x' + 'a'.repeat(130);
      const sig2 = '0x' + 'b'.repeat(130);

      const entropy1 = await deriveEntropyFromSignature(sig1);
      const entropy2 = await deriveEntropyFromSignature(sig2);

      expect(entropy1).not.toEqual(entropy2);
    });
  });

  describe('entropyToS5Phrase', () => {
    it('should convert entropy to valid S5 phrase format', () => {
      const entropy = new Uint8Array(16).fill(42); // Test entropy

      const phrase = entropyToS5Phrase(entropy);

      // Should be 15 words (13 seed + 2 checksum)
      const words = phrase.split(' ');
      expect(words.length).toBe(15);

      // Each word should be at least 3 characters
      for (const word of words) {
        expect(word.length).toBeGreaterThanOrEqual(3);
      }

      // Should be lowercase
      expect(phrase).toBe(phrase.toLowerCase());
    });

    it('should produce deterministic phrases from same entropy', () => {
      const entropy = new Uint8Array(16).fill(123);

      const phrase1 = entropyToS5Phrase(entropy);
      const phrase2 = entropyToS5Phrase(entropy);

      expect(phrase1).toBe(phrase2);
    });

    it('should produce different phrases for different entropy', () => {
      const entropy1 = new Uint8Array(16).fill(1);
      const entropy2 = new Uint8Array(16).fill(2);

      const phrase1 = entropyToS5Phrase(entropy1);
      const phrase2 = entropyToS5Phrase(entropy2);

      expect(phrase1).not.toBe(phrase2);
    });
  });

  describe('getOrGenerateS5Seed with caching', () => {
    it('should generate new seed for first-time user', async () => {
      const mockSigner = {
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
        signMessage: vi.fn().mockResolvedValue('0x' + 'f'.repeat(130))
      };

      const seed = await getOrGenerateS5Seed(mockSigner as any);

      expect(seed).toMatch(/^[a-z]+(?: [a-z]+){14}$/); // 15 words
      expect(mockSigner.signMessage).toHaveBeenCalledWith(
        'Generate S5 seed for Fabstir LLM SDK v1.0'
      );
    });

    it('should use cached seed on subsequent calls', async () => {
      const address = '0xABCDEF1234567890123456789012345678901234';
      const mockSigner = {
        getAddress: vi.fn().mockResolvedValue(address),
        signMessage: vi.fn().mockResolvedValue('0x' + 'd'.repeat(130))
      };

      // First call - generates and caches
      const seed1 = await getOrGenerateS5Seed(mockSigner as any);
      expect(mockSigner.signMessage).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const seed2 = await getOrGenerateS5Seed(mockSigner as any);
      expect(seed1).toBe(seed2);
      expect(mockSigner.signMessage).toHaveBeenCalledTimes(1); // No additional signing
    });

    it('should regenerate if forced', async () => {
      const mockSigner = {
        getAddress: vi.fn().mockResolvedValue('0x9876543210987654321098765432109876543210'),
        signMessage: vi.fn()
          .mockResolvedValueOnce('0x' + 'a'.repeat(130))
          .mockResolvedValueOnce('0x' + 'b'.repeat(130))
      };

      const seed1 = await getOrGenerateS5Seed(mockSigner as any, false);
      const seed2 = await getOrGenerateS5Seed(mockSigner as any, true); // Force regenerate

      // Should sign twice
      expect(mockSigner.signMessage).toHaveBeenCalledTimes(2);

      // Seeds should be different (different signatures)
      expect(seed1).not.toBe(seed2);
    });
  });

  describe('generateS5SeedWithoutCache', () => {
    it('should always generate fresh seed', async () => {
      const mockSigner = {
        signMessage: vi.fn()
          .mockResolvedValueOnce('0x' + 'e'.repeat(130))
          .mockResolvedValueOnce('0x' + 'f'.repeat(130))
      };

      await generateS5SeedWithoutCache(mockSigner as any);
      await generateS5SeedWithoutCache(mockSigner as any);

      // Should sign every time
      expect(mockSigner.signMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache management', () => {
    it('should detect cached seed', async () => {
      const address = '0x1111222233334444555566667777888899990000';
      const mockSigner = {
        getAddress: vi.fn().mockResolvedValue(address),
        signMessage: vi.fn().mockResolvedValue('0x' + 'c'.repeat(130))
      };

      expect(hasCachedSeed(address)).toBe(false);

      await getOrGenerateS5Seed(mockSigner as any);

      expect(hasCachedSeed(address)).toBe(true);
    });

    it('should clear cached seed', async () => {
      const address = '0xAAAABBBBCCCCDDDDEEEEFFFF000011112222333';
      const mockSigner = {
        getAddress: vi.fn().mockResolvedValue(address),
        signMessage: vi.fn().mockResolvedValue('0x' + 'e'.repeat(130))
      };

      await getOrGenerateS5Seed(mockSigner as any);
      expect(hasCachedSeed(address)).toBe(true);

      clearCachedSeed(address);
      expect(hasCachedSeed(address)).toBe(false);
    });
  });

  describe('integration with real wallet', () => {
    it('should work with ethers.Wallet', async () => {
      const wallet = new ethers.Wallet(
        '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      );

      const seed = await getOrGenerateS5Seed(wallet);

      // Should be a valid S5 seed phrase
      const words = seed.split(' ');
      expect(words.length).toBe(15);

      // Should be deterministic for the same wallet
      const seed2 = await getOrGenerateS5Seed(wallet);
      expect(seed).toBe(seed2);
    });
  });
});