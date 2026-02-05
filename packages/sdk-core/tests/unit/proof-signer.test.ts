// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for ProofSigner utility
 *
 * February 2026 Contract Update: Signatures no longer required for proof submission.
 * signProofForSubmission is deprecated and returns empty signature.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { signProofForSubmission, SignedProofSubmission } from '../../src/utils/ProofSigner';

describe('ProofSigner (Feb 2026 - Deprecated)', () => {
  let hostWallet: ethers.Wallet;
  let hostAddress: string;

  beforeEach(() => {
    // Create deterministic wallet for testing
    hostWallet = new ethers.Wallet(
      '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    );
    hostAddress = hostWallet.address;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('signProofForSubmission (deprecated)', () => {
    it('should return proofHash and empty signature', async () => {
      const proofData = new Uint8Array([1, 2, 3, 4, 5]);
      const tokensClaimed = BigInt(100);

      const result = await signProofForSubmission(
        proofData,
        hostAddress,
        tokensClaimed,
        hostWallet
      );

      expect(result).toHaveProperty('proofHash');
      expect(result).toHaveProperty('signature');
      // Feb 2026: signature is empty ('0x') - no longer generated
      expect(result.signature).toBe('0x');
    });

    it('should generate bytes32 proofHash', async () => {
      const proofData = new Uint8Array([1, 2, 3, 4, 5]);
      const tokensClaimed = BigInt(100);

      const result = await signProofForSubmission(
        proofData,
        hostAddress,
        tokensClaimed,
        hostWallet
      );

      // proofHash should still be generated
      expect(result.proofHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should log deprecation warning', async () => {
      const proofData = new Uint8Array([1, 2, 3, 4, 5]);
      const tokensClaimed = BigInt(100);

      await signProofForSubmission(
        proofData,
        hostAddress,
        tokensClaimed,
        hostWallet
      );

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('DEPRECATED')
      );
    });

    it('should accept string proof data', async () => {
      const proofData = '0x0102030405'; // hex string
      const tokensClaimed = BigInt(100);

      const result = await signProofForSubmission(
        proofData,
        hostAddress,
        tokensClaimed,
        hostWallet
      );

      expect(result.proofHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      // Feb 2026: signature is always empty
      expect(result.signature).toBe('0x');
    });

    it('should produce different proofHash for different proof data', async () => {
      const proofData1 = new Uint8Array([1, 2, 3]);
      const proofData2 = new Uint8Array([4, 5, 6]);
      const tokensClaimed = BigInt(100);

      const result1 = await signProofForSubmission(
        proofData1,
        hostAddress,
        tokensClaimed,
        hostWallet
      );
      const result2 = await signProofForSubmission(
        proofData2,
        hostAddress,
        tokensClaimed,
        hostWallet
      );

      expect(result1.proofHash).not.toBe(result2.proofHash);
    });

    it('should return same empty signature regardless of input', async () => {
      const proofData = new Uint8Array([1, 2, 3]);
      const tokensClaimed1 = BigInt(100);
      const tokensClaimed2 = BigInt(200);

      const result1 = await signProofForSubmission(
        proofData,
        hostAddress,
        tokensClaimed1,
        hostWallet
      );
      const result2 = await signProofForSubmission(
        proofData,
        hostAddress,
        tokensClaimed2,
        hostWallet
      );

      // Feb 2026: Both signatures are empty
      expect(result1.signature).toBe('0x');
      expect(result2.signature).toBe('0x');
      // proofHash is the same since proof data is the same
      expect(result1.proofHash).toBe(result2.proofHash);
    });
  });

  describe('SignedProofSubmission interface', () => {
    it('should conform to expected interface', async () => {
      const result: SignedProofSubmission = {
        proofHash: '0x' + 'ab'.repeat(32),
        signature: '0x' // Feb 2026: empty signature
      };

      expect(result.proofHash).toBeDefined();
      expect(result.signature).toBeDefined();
      expect(result.signature).toBe('0x');
    });
  });
});
