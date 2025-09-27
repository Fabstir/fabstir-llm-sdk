import { describe, it, expect } from 'vitest';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';

describe('Seed Validation Simple Tests', () => {
  const mockConfig = {
    rpcUrl: 'https://sepolia.base.org',
    contractAddresses: {
      jobMarketplace: '0x001A47Bb8C6CaD9995639b8776AB5816Ab9Ac4E0',
      nodeRegistry: '0x039AB5d5e8D5426f9963140202F506A2Ce6988F9',
      proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
      hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
      usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    }
  };

  it('should reject test seed in production mode', async () => {
    const sdk = new FabstirSDKCore({ ...mockConfig, mode: 'production' });
    const testSeed = 'yield organic score bishop free juice atop village video element unless sneak care rock update';

    sdk.setS5Seed(testSeed);

    await expect(sdk.validateSeed()).rejects.toThrow(/test seed.*not allowed.*production/i);
  });

  it('should accept test seed in development mode', async () => {
    const sdk = new FabstirSDKCore({ ...mockConfig, mode: 'development' });
    const testSeed = 'yield organic score bishop free juice atop village video element unless sneak care rock update';

    sdk.setS5Seed(testSeed);

    // Should not throw
    await expect(sdk.validateSeed()).resolves.toBe(true);
  });

  it('should reject seed with invalid format', async () => {
    const sdk = new FabstirSDKCore({ ...mockConfig, mode: 'production' });

    sdk.setS5Seed('invalid seed');

    await expect(sdk.validateSeed()).rejects.toThrow(/invalid seed.*format/i);
  });

  it('should reject seed with weak entropy', async () => {
    const sdk = new FabstirSDKCore({ ...mockConfig, mode: 'production' });

    // All same words
    sdk.setS5Seed('test test test test test test test test test test test test');

    await expect(sdk.validateSeed()).rejects.toThrow(/weak seed/i);
  });

  it('should accept valid 12-word mnemonic', async () => {
    const sdk = new FabstirSDKCore({ ...mockConfig, mode: 'production' });

    // Valid diverse mnemonic
    sdk.setS5Seed('abandon ability able about above absent absorb abstract absurd abuse access accident');

    await expect(sdk.validateSeed()).resolves.toBe(true);
  });

  it('should require seed in production initialization', async () => {
    const sdk = new FabstirSDKCore({ ...mockConfig, mode: 'production' });

    // No seed set
    await expect(sdk.initializeForTesting()).rejects.toThrow(/seed.*required/i);
  });

  it('should auto-generate seed in development mode', async () => {
    const sdk = new FabstirSDKCore({ ...mockConfig, mode: 'development' });

    // Should work without seed in dev mode
    await expect(sdk.initializeForTesting()).resolves.toBeUndefined();
  });

  it('should not expose hardcoded seed in SDK string', () => {
    const sdk = new FabstirSDKCore({ ...mockConfig, mode: 'production' });
    const knownTestSeed = 'yield organic score bishop free juice atop village video element unless sneak care rock update';

    const sdkString = sdk.toString();

    expect(sdkString).not.toContain(knownTestSeed);
  });

  it('should validate seed on production initialization', async () => {
    const sdk = new FabstirSDKCore({ ...mockConfig, mode: 'production' });

    // Set weak seed
    sdk.setS5Seed('weak weak weak weak weak weak weak weak weak weak weak weak');

    // Initialize should validate and throw
    await expect(sdk.initializeForTesting()).rejects.toThrow(/weak seed/i);
  });

  it('should accept seed from config', async () => {
    const configWithSeed = {
      ...mockConfig,
      mode: 'production' as const,
      s5Config: {
        seedPhrase: 'abandon ability able about above absent absorb abstract absurd abuse access accident'
      }
    };

    const sdk = new FabstirSDKCore(configWithSeed);

    // Should use config seed and pass validation
    await expect(sdk.initializeForTesting()).resolves.toBeUndefined();
  });
});