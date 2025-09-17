import { describe, it, expect, beforeEach } from 'vitest';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { SDKError } from '../../src/errors';

describe('SDK Configuration Validation', () => {
  const validConfig = {
    mode: 'production' as const,
    rpcUrl: 'https://base-sepolia.example.com',
    chainId: 84532,
    contractAddresses: {
      jobMarketplace: '0x001A47Bb8C6CaD9995639b8776AB5816Ab9Ac4E0',
      nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
      proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
      hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
      fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
      usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      modelRegistry: '0x039AB5d5e8D5426f9963140202F506A2Ce6988F9'
    }
  };

  describe('Configuration Requirements', () => {
    it('should accept valid configuration', () => {
      expect(() => new FabstirSDKCore(validConfig)).not.toThrow();
    });

    it('should require rpcUrl', () => {
      const config = { ...validConfig };
      delete (config as any).rpcUrl;

      expect(() => new FabstirSDKCore(config as any))
        .toThrow('RPC URL is required');
    });

    it('should NOT fallback to process.env for rpcUrl', () => {
      const originalEnv = process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA;
      process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA = 'https://fallback.com';

      const config = { ...validConfig };
      delete (config as any).rpcUrl;

      expect(() => new FabstirSDKCore(config as any))
        .toThrow('RPC URL is required');

      process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA = originalEnv;
    });

    it('should require all contract addresses', () => {
      const requiredContracts = [
        'jobMarketplace',
        'nodeRegistry',
        'proofSystem',
        'hostEarnings',
        'usdcToken'
      ];

      for (const contract of requiredContracts) {
        const config = JSON.parse(JSON.stringify(validConfig));
        delete config.contractAddresses[contract];

        expect(() => new FabstirSDKCore(config))
          .toThrow(`${contract} contract address is required`);
      }
    });

    it('should NOT fallback to process.env for contract addresses', () => {
      const originalEnv = process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE;
      process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE = '0xFallbackAddress';

      const config = JSON.parse(JSON.stringify(validConfig));
      delete config.contractAddresses.jobMarketplace;

      expect(() => new FabstirSDKCore(config))
        .toThrow('jobMarketplace contract address is required');

      process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE = originalEnv;
    });
  });

  describe('Address Validation', () => {
    it('should reject invalid Ethereum address formats', () => {
      const invalidAddresses = [
        'not-an-address',
        '0x123', // Too short
        '0xGGGG', // Invalid hex
        '123456789012345678901234567890123456789012', // No 0x prefix
      ];

      for (const invalidAddr of invalidAddresses) {
        const config = JSON.parse(JSON.stringify(validConfig));
        config.contractAddresses.jobMarketplace = invalidAddr;

        expect(() => new FabstirSDKCore(config))
          .toThrow(/Invalid.*address/i);
      }
    });

    it('should reject null, undefined, or empty addresses', () => {
      const missingAddresses = [null, undefined, ''];

      for (const invalidAddr of missingAddresses) {
        const config = JSON.parse(JSON.stringify(validConfig));
        config.contractAddresses.jobMarketplace = invalidAddr;

        expect(() => new FabstirSDKCore(config))
          .toThrow(/required/i);
      }
    });

    it('should reject zero addresses', () => {
      const config = JSON.parse(JSON.stringify(validConfig));
      config.contractAddresses.jobMarketplace = '0x0000000000000000000000000000000000000000';

      expect(() => new FabstirSDKCore(config))
        .toThrow(/cannot be zero address/i);
    });

    it('should validate all contract addresses', () => {
      const config = JSON.parse(JSON.stringify(validConfig));
      config.contractAddresses.nodeRegistry = 'invalid-address';

      expect(() => new FabstirSDKCore(config))
        .toThrow(/Invalid.*nodeRegistry.*address/i);
    });
  });

  describe('Optional Configurations', () => {
    it('should allow optional fabToken address', () => {
      const config = JSON.parse(JSON.stringify(validConfig));
      delete config.contractAddresses.fabToken;

      expect(() => new FabstirSDKCore(config)).not.toThrow();
    });

    it('should allow optional modelRegistry address', () => {
      const config = JSON.parse(JSON.stringify(validConfig));
      delete config.contractAddresses.modelRegistry;

      expect(() => new FabstirSDKCore(config)).not.toThrow();
    });

    it('should use default chainId if not provided', () => {
      const config = JSON.parse(JSON.stringify(validConfig));
      delete config.chainId;

      const sdk = new FabstirSDKCore(config);
      expect(sdk.getChainId()).toBe(84532); // Base Sepolia default
    });
  });

  describe('Error Messages', () => {
    it('should provide clear error for missing config', () => {
      const config = JSON.parse(JSON.stringify(validConfig));
      delete config.contractAddresses.jobMarketplace;

      try {
        new FabstirSDKCore(config);
      } catch (error: any) {
        expect(error.message).toContain('jobMarketplace');
        expect(error.message).toContain('required');
        expect(error.code).toBe('CONFIG_MISSING_CONTRACT');
      }
    });

    it('should provide clear error for invalid address', () => {
      const config = JSON.parse(JSON.stringify(validConfig));
      config.contractAddresses.nodeRegistry = 'not-valid';

      try {
        new FabstirSDKCore(config);
      } catch (error: any) {
        expect(error.message).toContain('nodeRegistry');
        expect(error.message).toContain('Invalid');
        expect(error.code).toBe('CONFIG_INVALID_ADDRESS');
      }
    });

    it('should provide clear error for zero address', () => {
      const config = JSON.parse(JSON.stringify(validConfig));
      config.contractAddresses.proofSystem = '0x' + '0'.repeat(40);

      try {
        new FabstirSDKCore(config);
      } catch (error: any) {
        expect(error.message).toContain('proofSystem');
        expect(error.message).toContain('zero address');
        expect(error.code).toBe('CONFIG_ZERO_ADDRESS');
      }
    });
  });
});