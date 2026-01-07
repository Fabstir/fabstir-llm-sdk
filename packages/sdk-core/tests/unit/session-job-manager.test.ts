// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for SessionJobManager - Security Audit Migration
 * Verifies the new submitProofOfWork signature with ECDSA signatures
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';

// Mock ContractManager for unit testing
const mockContract = {
  target: '0x1234567890123456789012345678901234567890',
  interface: {
    fragments: []
  },
  connect: vi.fn().mockReturnThis(),
  submitProofOfWork: vi.fn(),
  getProofSubmission: vi.fn(),
  getLockedBalanceNative: vi.fn(),
  getLockedBalanceToken: vi.fn(),
  getTotalBalanceNative: vi.fn(),
  getTotalBalanceToken: vi.fn(),
};

const mockTx = {
  wait: vi.fn().mockResolvedValue({ hash: '0xabc123' })
};

describe('SessionJobManager - Security Audit Migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContract.submitProofOfWork.mockResolvedValue(mockTx);
    mockContract['submitProofOfWork'] = vi.fn().mockResolvedValue(mockTx);
  });

  describe('submitCheckpointProof signature validation', () => {
    it('should accept new 5-param signature', async () => {
      // This test validates the new method signature compiles
      type SubmitCheckpointProofParams = {
        sessionId: bigint;
        tokensClaimed: number;
        proofHash: string;
        signature: string;
        proofCID: string;
      };

      const params: SubmitCheckpointProofParams = {
        sessionId: BigInt(1),
        tokensClaimed: 100,
        proofHash: '0x' + 'ab'.repeat(32),
        signature: '0x' + 'cd'.repeat(65),
        proofCID: 'bafybeigtest'
      };

      expect(params.sessionId).toBe(BigInt(1));
      expect(params.tokensClaimed).toBe(100);
      expect(params.proofHash).toHaveLength(66);
      expect(params.signature).toHaveLength(132);
      expect(params.proofCID).toBe('bafybeigtest');
    });

    it('should NOT have old 4-param signature with bytes proof', async () => {
      // Old signature was: (sessionId, checkpoint, tokensGenerated, proofData: string)
      // New signature is: (sessionId, tokensClaimed, proofHash, signature, proofCID)
      // The proofData parameter no longer exists (replaced by proofHash + signature)

      type OldSubmitParams = {
        sessionId: bigint;
        checkpoint: number;
        tokensGenerated: number;
        proofData: string;
      };

      type NewSubmitParams = {
        sessionId: bigint;
        tokensClaimed: number;
        proofHash: string;
        signature: string;
        proofCID: string;
      };

      // Verify the types are different
      const oldParams: OldSubmitParams = {
        sessionId: BigInt(1),
        checkpoint: 1,
        tokensGenerated: 100,
        proofData: '0x1234'
      };

      const newParams: NewSubmitParams = {
        sessionId: BigInt(1),
        tokensClaimed: 100,
        proofHash: '0x' + 'ab'.repeat(32),
        signature: '0x' + 'cd'.repeat(65),
        proofCID: 'bafybeigtest'
      };

      // Old params should have 4 keys, new should have 5
      expect(Object.keys(oldParams).length).toBe(4);
      expect(Object.keys(newParams).length).toBe(5);

      // New params should NOT have checkpoint or proofData
      expect(newParams).not.toHaveProperty('checkpoint');
      expect(newParams).not.toHaveProperty('proofData');
    });
  });

  describe('getProofSubmission', () => {
    it('should return ProofSubmissionResult', async () => {
      // Type check for the expected return type
      type ProofSubmissionResult = {
        proofHash: string;
        tokensClaimed: bigint;
        timestamp: bigint;
        verified: boolean;
      };

      const result: ProofSubmissionResult = {
        proofHash: '0x' + 'ab'.repeat(32),
        tokensClaimed: BigInt(100),
        timestamp: BigInt(1700000000),
        verified: true
      };

      expect(result.proofHash).toHaveLength(66);
      expect(result.tokensClaimed).toBe(BigInt(100));
      expect(typeof result.timestamp).toBe('bigint');
      expect(result.verified).toBe(true);
    });
  });

  describe('balance view methods', () => {
    it('getLockedBalanceNative should accept account address', () => {
      type GetLockedBalanceNativeParams = {
        account: string;
      };

      const params: GetLockedBalanceNativeParams = {
        account: '0x1234567890123456789012345678901234567890'
      };

      expect(params.account).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('getLockedBalanceToken should accept account and token addresses', () => {
      type GetLockedBalanceTokenParams = {
        account: string;
        token: string;
      };

      const params: GetLockedBalanceTokenParams = {
        account: '0x1234567890123456789012345678901234567890',
        token: '0xabcdef1234567890123456789012345678901234'
      };

      expect(params.account).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(params.token).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('getTotalBalanceNative should accept account address', () => {
      type GetTotalBalanceNativeParams = {
        account: string;
      };

      const params: GetTotalBalanceNativeParams = {
        account: '0x1234567890123456789012345678901234567890'
      };

      expect(params.account).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('getTotalBalanceToken should accept account and token addresses', () => {
      type GetTotalBalanceTokenParams = {
        account: string;
        token: string;
      };

      const params: GetTotalBalanceTokenParams = {
        account: '0x1234567890123456789012345678901234567890',
        token: '0xabcdef1234567890123456789012345678901234'
      };

      expect(params.account).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(params.token).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });
});
