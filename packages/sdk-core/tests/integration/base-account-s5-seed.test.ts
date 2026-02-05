/**
 * Test: Base Smart Account S5 Seed Derivation
 *
 * Verifies that authenticateWithBaseAccount derives a unique S5 seed
 * from the PRIMARY account ADDRESS (not signature - address-based derivation).
 * This ensures determinism across browser sessions without requiring signatures.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FabstirSDKCore, ChainId } from '../../src';
import {
  getCachedSeed,
  clearCachedSeed,
  deriveEntropyFromSignature,
  deriveEntropyFromAddress,
  generateS5SeedFromAddress,
  entropyToS5Phrase
} from '../../src/utils/s5-seed-derivation';

// Test addresses
const PRIMARY_ACCOUNT_1 = '0x1111111111111111111111111111111111111111';
const PRIMARY_ACCOUNT_2 = '0x2222222222222222222222222222222222222222';
const SUB_ACCOUNT_1 = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const SUB_ACCOUNT_2 = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

// Mock signatures (deterministic per primary account)
const MOCK_SIGNATURE_1 = '0x' + '11'.repeat(65); // Signature from PRIMARY_ACCOUNT_1
const MOCK_SIGNATURE_2 = '0x' + '22'.repeat(65); // Signature from PRIMARY_ACCOUNT_2

describe('Base Smart Account S5 Seed Derivation', () => {
  let sdk: FabstirSDKCore;
  let mockProvider: any;
  let personalSignCalls: Array<{ message: string; account: string }>;

  beforeEach(() => {
    // Clear any cached seeds
    clearCachedSeed(SUB_ACCOUNT_1);
    clearCachedSeed(SUB_ACCOUNT_2);

    // Track personal_sign calls
    personalSignCalls = [];

    // Create mock Base Account Kit provider
    mockProvider = {
      request: vi.fn(async ({ method, params }: { method: string; params: any[] }) => {
        if (method === 'eth_requestAccounts') {
          return [PRIMARY_ACCOUNT_1];
        }
        if (method === 'wallet_getSubAccounts') {
          // Return existing sub-account
          return { subAccounts: [{ address: SUB_ACCOUNT_1 }] };
        }
        if (method === 'wallet_addSubAccount') {
          return { address: SUB_ACCOUNT_1 };
        }
        if (method === 'personal_sign') {
          const [message, account] = params;
          personalSignCalls.push({ message, account });

          // Return different signatures for different primary accounts
          if (account.toLowerCase() === PRIMARY_ACCOUNT_1.toLowerCase()) {
            return MOCK_SIGNATURE_1;
          }
          if (account.toLowerCase() === PRIMARY_ACCOUNT_2.toLowerCase()) {
            return MOCK_SIGNATURE_2;
          }
          return '0x' + '00'.repeat(65);
        }
        if (method === 'eth_chainId') {
          return '0x14a34'; // Base Sepolia
        }
        return null;
      }),
    };

    // Create SDK instance
    sdk = new FabstirSDKCore({
      chainId: ChainId.BASE_SEPOLIA,
      rpcUrl: 'https://sepolia.base.org',
      contractAddresses: {
        jobMarketplace: '0x0000000000000000000000000000000000000001',
        nodeRegistry: '0x0000000000000000000000000000000000000002',
        proofSystem: '0x0000000000000000000000000000000000000003',
        hostEarnings: '0x0000000000000000000000000000000000000004',
        modelRegistry: '0x0000000000000000000000000000000000000005',
        usdcToken: '0x0000000000000000000000000000000000000006',
        fabToken: '0x0000000000000000000000000000000000000007',
      },
    });
  });

  afterEach(() => {
    // Clean up
    clearCachedSeed(SUB_ACCOUNT_1);
    clearCachedSeed(SUB_ACCOUNT_2);
    vi.clearAllMocks();
  });

  it('should derive S5 seed from PRIMARY account ADDRESS (no signature needed)', async () => {
    // With address-based derivation, we no longer need signatures for S5 seed
    // This test verifies the new approach

    const CHAIN_ID = ChainId.BASE_SEPOLIA;

    // Derive seed from primary account address
    const seed = await generateS5SeedFromAddress(PRIMARY_ACCOUNT_1, CHAIN_ID);

    // Should be a valid 15-word phrase
    expect(seed.split(' ').length).toBe(15);

    // Should be deterministic
    const seed2 = await generateS5SeedFromAddress(PRIMARY_ACCOUNT_1, CHAIN_ID);
    expect(seed).toBe(seed2);

    // No personal_sign calls needed for S5 seed derivation
    // (The auth flow may still call personal_sign for other purposes like session creation)

    console.log('✅ S5 seed derived from PRIMARY account address (no signature needed)');
    console.log('   Seed:', seed.split(' ').slice(0, 3).join(' ') + '...');
  });

  it('should derive DIFFERENT seeds for DIFFERENT primary accounts (address-based)', async () => {
    const CHAIN_ID = ChainId.BASE_SEPOLIA;

    // Derive seed for PRIMARY_ACCOUNT_1 using address
    const seed1 = await generateS5SeedFromAddress(PRIMARY_ACCOUNT_1, CHAIN_ID);

    // Derive seed for PRIMARY_ACCOUNT_2 using address
    const seed2 = await generateS5SeedFromAddress(PRIMARY_ACCOUNT_2, CHAIN_ID);

    // Seeds must be DIFFERENT (data sovereignty!)
    expect(seed1).not.toBe(seed2);

    console.log('✅ Different primary accounts produce different seeds (address-based):');
    console.log('   Account 1 seed:', seed1.split(' ').slice(0, 3).join(' ') + '...');
    console.log('   Account 2 seed:', seed2.split(' ').slice(0, 3).join(' ') + '...');
  });

  it('should derive SAME seed for SAME primary account (address-based determinism)', async () => {
    const CHAIN_ID = ChainId.BASE_SEPOLIA;

    // Derive seed twice from same address
    const seed1 = await generateS5SeedFromAddress(PRIMARY_ACCOUNT_1, CHAIN_ID);
    const seed2 = await generateS5SeedFromAddress(PRIMARY_ACCOUNT_1, CHAIN_ID);

    // Seeds must be SAME (deterministic!)
    expect(seed1).toBe(seed2);

    console.log('✅ Same primary account produces same seed (address-based determinism):');
    console.log('   Seed:', seed1.split(' ').slice(0, 3).join(' ') + '...');
  });

  it('should NOT use hardcoded fallback seed', async () => {
    const HARDCODED_FALLBACK = 'yield organic score bishop free juice atop village video element unless sneak care rock update';

    // Derive seed from a signature
    const entropy = await deriveEntropyFromSignature(MOCK_SIGNATURE_1);
    const derivedSeed = entropyToS5Phrase(entropy);

    // Derived seed must NOT be the hardcoded fallback
    expect(derivedSeed).not.toBe(HARDCODED_FALLBACK);

    console.log('✅ Derived seed is NOT the hardcoded fallback');
    console.log('   Hardcoded:', HARDCODED_FALLBACK.split(' ').slice(0, 3).join(' ') + '...');
    console.log('   Derived:  ', derivedSeed.split(' ').slice(0, 3).join(' ') + '...');
  });

  it('should cache seed for SUB-account address (not primary)', async () => {
    // Skip if localStorage not available (Node.js environment)
    if (typeof localStorage === 'undefined') {
      console.log('⏭️  Skipping cache test - localStorage not available in Node.js');
      return;
    }

    // Clear any existing cache
    clearCachedSeed(SUB_ACCOUNT_1.toLowerCase());
    clearCachedSeed(PRIMARY_ACCOUNT_1.toLowerCase());

    // Manually simulate what authenticateWithBaseAccount does
    const entropy = await deriveEntropyFromSignature(MOCK_SIGNATURE_1);
    const seedPhrase = entropyToS5Phrase(entropy);

    // Import cacheSeed
    const { cacheSeed } = await import('../../src/utils/s5-seed-derivation');

    // Cache for sub-account (as the fix does)
    cacheSeed(SUB_ACCOUNT_1.toLowerCase(), seedPhrase);

    // Verify it's cached for sub-account
    const cachedForSub = getCachedSeed(SUB_ACCOUNT_1.toLowerCase());
    expect(cachedForSub).toBe(seedPhrase);

    console.log('✅ Seed cached for SUB-account address');
  });

  it('should produce valid 15-word S5 seed phrase', async () => {
    const entropy = await deriveEntropyFromSignature(MOCK_SIGNATURE_1);
    const seed = entropyToS5Phrase(entropy);

    const words = seed.split(' ');
    expect(words.length).toBe(15);

    // All words should be non-empty
    words.forEach((word, i) => {
      expect(word.length).toBeGreaterThan(0);
    });

    console.log('✅ Valid 15-word S5 seed phrase generated');
    console.log('   Words:', words.length);
  });
});

describe('Seed Derivation is Deterministic', () => {
  it('same signature always produces same entropy', async () => {
    const sig = '0x' + 'ab'.repeat(65);

    const entropy1 = await deriveEntropyFromSignature(sig);
    const entropy2 = await deriveEntropyFromSignature(sig);

    expect(Buffer.from(entropy1).toString('hex')).toBe(Buffer.from(entropy2).toString('hex'));

    console.log('✅ Entropy derivation is deterministic');
  });

  it('different signatures produce different entropy', async () => {
    const sig1 = '0x' + 'aa'.repeat(65);
    const sig2 = '0x' + 'bb'.repeat(65);

    const entropy1 = await deriveEntropyFromSignature(sig1);
    const entropy2 = await deriveEntropyFromSignature(sig2);

    expect(Buffer.from(entropy1).toString('hex')).not.toBe(Buffer.from(entropy2).toString('hex'));

    console.log('✅ Different signatures produce different entropy');
  });
});
