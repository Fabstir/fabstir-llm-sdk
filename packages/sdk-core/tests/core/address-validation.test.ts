import { describe, it, expect } from 'vitest';
import {
  isValidAddress,
  isZeroAddress,
  validateContractAddress,
  validateRequiredAddresses
} from '../../src/utils/validation';

describe('Address Validation Utilities', () => {
  describe('isValidAddress', () => {
    it('should accept valid Ethereum addresses', () => {
      const validAddresses = [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7',
        '0x0000000000000000000000000000000000000000',
        '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        '0xAbCdEf1234567890123456789012345678901234'
      ];

      for (const addr of validAddresses) {
        expect(isValidAddress(addr)).toBe(true);
      }
    });

    it('should reject invalid addresses', () => {
      const invalidAddresses = [
        '',
        'not-an-address',
        '0x',
        '0x123', // Too short
        '0xZZZZ', // Invalid hex characters
        '742d35Cc6634C0532925a3b844Bc9e7595f0bEb7', // No 0x prefix
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb77', // Too long
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bE', // Too short
        null,
        undefined,
        123,
        {},
        []
      ];

      for (const addr of invalidAddresses) {
        expect(isValidAddress(addr as any)).toBe(false);
      }
    });

    it('should be case-insensitive', () => {
      expect(isValidAddress('0x742D35CC6634C0532925A3B844BC9E7595F0BEB7')).toBe(true);
      expect(isValidAddress('0x742d35cc6634c0532925a3b844bc9e7595f0beb7')).toBe(true);
    });
  });

  describe('isZeroAddress', () => {
    it('should identify zero address', () => {
      expect(isZeroAddress('0x0000000000000000000000000000000000000000')).toBe(true);
      expect(isZeroAddress('0x' + '0'.repeat(40))).toBe(true);
    });

    it('should reject non-zero addresses', () => {
      expect(isZeroAddress('0x0000000000000000000000000000000000000001')).toBe(false);
      expect(isZeroAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7')).toBe(false);
    });

    it('should handle invalid input gracefully', () => {
      expect(isZeroAddress('')).toBe(false);
      expect(isZeroAddress(null as any)).toBe(false);
      expect(isZeroAddress(undefined as any)).toBe(false);
    });
  });

  describe('validateContractAddress', () => {
    it('should pass for valid non-zero address', () => {
      expect(() =>
        validateContractAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7', 'testContract')
      ).not.toThrow();
    });

    it('should throw for missing address', () => {
      expect(() =>
        validateContractAddress(undefined as any, 'testContract')
      ).toThrow('testContract contract address is required');

      expect(() =>
        validateContractAddress('', 'testContract')
      ).toThrow('testContract contract address is required');

      expect(() =>
        validateContractAddress(null as any, 'testContract')
      ).toThrow('testContract contract address is required');
    });

    it('should throw for invalid address format', () => {
      expect(() =>
        validateContractAddress('not-an-address', 'testContract')
      ).toThrow('Invalid testContract contract address');

      expect(() =>
        validateContractAddress('0x123', 'testContract')
      ).toThrow('Invalid testContract contract address');
    });

    it('should throw for zero address', () => {
      expect(() =>
        validateContractAddress('0x0000000000000000000000000000000000000000', 'testContract')
      ).toThrow('testContract cannot be zero address');
    });

    it('should include contract name in error message', () => {
      try {
        validateContractAddress('', 'jobMarketplace');
      } catch (error: any) {
        expect(error.message).toContain('jobMarketplace');
        expect(error.code).toBe('CONFIG_MISSING_CONTRACT');
      }
    });
  });

  describe('validateRequiredAddresses', () => {
    const validAddresses = {
      jobMarketplace: '0x001A47Bb8C6CaD9995639b8776AB5816Ab9Ac4E0',
      nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
      proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
      hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
      usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    };

    it('should pass for all valid addresses', () => {
      expect(() => validateRequiredAddresses(validAddresses)).not.toThrow();
    });

    it('should throw for missing required address', () => {
      const addresses = { ...validAddresses };
      delete (addresses as any).jobMarketplace;

      expect(() => validateRequiredAddresses(addresses))
        .toThrow('jobMarketplace contract address is required');
    });

    it('should throw for invalid address in collection', () => {
      const addresses = { ...validAddresses, nodeRegistry: 'invalid' };

      expect(() => validateRequiredAddresses(addresses))
        .toThrow('Invalid nodeRegistry contract address');
    });

    it('should throw for zero address in collection', () => {
      const addresses = {
        ...validAddresses,
        proofSystem: '0x0000000000000000000000000000000000000000'
      };

      expect(() => validateRequiredAddresses(addresses))
        .toThrow('proofSystem cannot be zero address');
    });

    it('should validate all required contracts', () => {
      const required = ['jobMarketplace', 'nodeRegistry', 'proofSystem', 'hostEarnings', 'usdcToken'];

      for (const contract of required) {
        const addresses = { ...validAddresses };
        delete addresses[contract as keyof typeof addresses];

        expect(() => validateRequiredAddresses(addresses))
          .toThrow(new RegExp(contract));
      }
    });
  });
});