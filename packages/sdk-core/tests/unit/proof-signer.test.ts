// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for ProofSigner utility - Security Audit Migration
 * Verifies ECDSA signature generation for proof submission
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { signProofForSubmission, SignedProofSubmission } from '../../src/utils/ProofSigner';

describe('ProofSigner - Security Audit Migration', () => {
  let hostWallet: ethers.Wallet;
  let hostAddress: string;

  beforeEach(() => {
    // Create deterministic wallet for testing
    hostWallet = new ethers.Wallet(
      '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    );
    hostAddress = hostWallet.address;
  });

  describe('signProofForSubmission', () => {
    it('should return proofHash and signature', async () => {
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

      // proofHash should be 0x + 64 hex chars
      expect(result.proofHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should generate 65-byte signature (r + s + v)', async () => {
      const proofData = new Uint8Array([1, 2, 3, 4, 5]);
      const tokensClaimed = BigInt(100);

      const result = await signProofForSubmission(
        proofData,
        hostAddress,
        tokensClaimed,
        hostWallet
      );

      // Signature should be 0x + 130 hex chars (65 bytes)
      expect(result.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
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
      expect(result.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
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

    it('should produce different signatures for different tokensClaimed', async () => {
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

      // Same proof data, but different tokensClaimed should produce different signatures
      expect(result1.signature).not.toBe(result2.signature);
      // But same proofHash since proof data is the same
      expect(result1.proofHash).toBe(result2.proofHash);
    });

    it('should produce recoverable signature', async () => {
      const proofData = new Uint8Array([1, 2, 3, 4, 5]);
      const tokensClaimed = BigInt(100);

      const result = await signProofForSubmission(
        proofData,
        hostAddress,
        tokensClaimed,
        hostWallet
      );

      // Reconstruct the data hash that was signed
      const dataHash = ethers.keccak256(
        ethers.solidityPacked(
          ['bytes32', 'address', 'uint256'],
          [result.proofHash, hostAddress, tokensClaimed]
        )
      );

      // Verify signature by recovering signer
      const recoveredAddress = ethers.verifyMessage(
        ethers.getBytes(dataHash),
        result.signature
      );

      expect(recoveredAddress.toLowerCase()).toBe(hostAddress.toLowerCase());
    });
  });

  describe('SignedProofSubmission interface', () => {
    it('should conform to expected interface', async () => {
      const result: SignedProofSubmission = {
        proofHash: '0x' + 'ab'.repeat(32),
        signature: '0x' + 'cd'.repeat(65)
      };

      expect(result.proofHash).toBeDefined();
      expect(result.signature).toBeDefined();
    });
  });
});
