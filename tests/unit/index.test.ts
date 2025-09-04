import { describe, it, expect } from 'vitest';
import * as exports from '../../src/index';

describe('Main Index Exports', () => {
  it('should export FabstirSDK class', () => {
    expect(exports.FabstirSDK).toBeDefined();
    expect(typeof exports.FabstirSDK).toBe('function');
  });

  it('should export types from types/index', () => {
    // These will be undefined until we implement them, but the test structure is here
    // Types are re-exported from types/index
    expect(exports).toBeDefined();
    // The actual types will be tested in types.test.ts
  });

  it('should export utility functions', () => {
    expect(exports.generateSeedFromSignature).toBeDefined();
    expect(typeof exports.generateSeedFromSignature).toBe('function');
  });

  it('should export constants', () => {
    expect(exports.DEFAULT_RPC_URL).toBeDefined();
    expect(exports.DEFAULT_S5_PORTAL).toBeDefined();
    expect(exports.MIN_ETH_PAYMENT).toBeDefined();
  });

  describe('generateSeedFromSignature', () => {
    it('should generate deterministic seed from signature', () => {
      const signature = '0xabcdef1234567890';
      const seed = exports.generateSeedFromSignature(signature);
      
      expect(seed).toBeDefined();
      expect(seed.split(' ').length).toBeGreaterThanOrEqual(12);
      
      // Should be deterministic
      const seed2 = exports.generateSeedFromSignature(signature);
      expect(seed2).toBe(seed);
    });

    it('should generate different seeds for different signatures', () => {
      const seed1 = exports.generateSeedFromSignature('0xabc');
      const seed2 = exports.generateSeedFromSignature('0xdef');
      
      expect(seed1).not.toBe(seed2);
    });
  });

  describe('Constants', () => {
    it('should have correct default values', () => {
      expect(exports.DEFAULT_RPC_URL).toContain('base-sepolia');
      expect(exports.DEFAULT_S5_PORTAL).toContain('s5');
      expect(exports.MIN_ETH_PAYMENT).toBe('0.005');
    });
  });
});