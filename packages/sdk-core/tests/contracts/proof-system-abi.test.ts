// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * ProofSystem ABI Tests - January 2026 Contract Upgrades
 *
 * Verifies that the ProofSystem ABI has been updated with the renamed function:
 * - verifyEKZL → verifyHostSignature
 *
 * These tests follow TDD approach:
 * 1. Tests written FIRST (should fail with old ABI)
 * 2. ABI updated to pass tests
 */

import { describe, test, expect } from 'vitest';

// Import ABIs directly (not through index.ts re-export to avoid esbuild issues)
import ProofSystemUpgradeableABI from '../../src/contracts/abis/ProofSystemUpgradeable-CLIENT-ABI.json';
import ProofSystemABI from '../../src/contracts/abis/ProofSystem-CLIENT-ABI.json';

/**
 * Helper to check if ABI contains a function by name
 */
function abiContainsFunction(abi: any[], functionName: string): boolean {
  return abi.some(
    (item) => item.type === 'function' && item.name === functionName
  );
}

/**
 * Helper to get function definition from ABI
 */
function getFunctionFromABI(abi: any[], functionName: string): any | undefined {
  return abi.find(
    (item) => item.type === 'function' && item.name === functionName
  );
}

describe('ProofSystem ABI - January 2026 Updates', () => {
  describe('ProofSystemUpgradeable-CLIENT-ABI.json', () => {
    test('should contain verifyHostSignature function (renamed from verifyEKZL)', () => {
      const hasFunction = abiContainsFunction(
        ProofSystemUpgradeableABI,
        'verifyHostSignature'
      );
      expect(hasFunction).toBe(true);
    });

    test('should NOT contain verifyEKZL function (old name)', () => {
      const hasOldFunction = abiContainsFunction(
        ProofSystemUpgradeableABI,
        'verifyEKZL'
      );
      expect(hasOldFunction).toBe(false);
    });

    test('verifyHostSignature should have correct signature (bytes, address, uint256)', () => {
      const func = getFunctionFromABI(
        ProofSystemUpgradeableABI,
        'verifyHostSignature'
      );
      expect(func).toBeDefined();
      expect(func.inputs).toHaveLength(3);
      expect(func.inputs[0].type).toBe('bytes');
      expect(func.inputs[0].name).toBe('proof');
      expect(func.inputs[1].type).toBe('address');
      expect(func.inputs[1].name).toBe('prover');
      expect(func.inputs[2].type).toBe('uint256');
      expect(func.inputs[2].name).toBe('claimedTokens');
      expect(func.outputs[0].type).toBe('bool');
      expect(func.stateMutability).toBe('view');
    });
  });

  describe('ProofSystem-CLIENT-ABI.json', () => {
    test('should contain verifyHostSignature function (renamed from verifyEKZL)', () => {
      const hasFunction = abiContainsFunction(
        ProofSystemABI,
        'verifyHostSignature'
      );
      expect(hasFunction).toBe(true);
    });

    test('should NOT contain verifyEKZL function (old name)', () => {
      const hasOldFunction = abiContainsFunction(ProofSystemABI, 'verifyEKZL');
      expect(hasOldFunction).toBe(false);
    });

    test('verifyHostSignature should have correct signature (bytes, address, uint256)', () => {
      const func = getFunctionFromABI(ProofSystemABI, 'verifyHostSignature');
      expect(func).toBeDefined();
      expect(func.inputs).toHaveLength(3);
      expect(func.inputs[0].type).toBe('bytes');
      expect(func.inputs[0].name).toBe('proof');
      expect(func.inputs[1].type).toBe('address');
      expect(func.inputs[1].name).toBe('prover');
      expect(func.inputs[2].type).toBe('uint256');
      expect(func.inputs[2].name).toBe('claimedTokens');
      expect(func.outputs[0].type).toBe('bool');
      expect(func.stateMutability).toBe('view');
    });
  });
});
