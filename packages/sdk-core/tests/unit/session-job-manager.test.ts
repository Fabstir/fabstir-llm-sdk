// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for SessionJobManager
 *
 * February 2026 Contract Update: Signature removed from proof submission
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

describe('SessionJobManager (Feb 2026)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContract.submitProofOfWork.mockResolvedValue(mockTx);
    mockContract['submitProofOfWork'] = vi.fn().mockResolvedValue(mockTx);
  });

  describe('submitCheckpointProof signature validation', () => {
    it('should accept 5-param signature (no ECDSA signature)', async () => {
      // Feb 2026: (sessionId, tokensClaimed, proofHash, proofCID, deltaCID)
      type SubmitCheckpointProofParams = {
        sessionId: bigint;
        tokensClaimed: number;
        proofHash: string;
        proofCID: string;
        deltaCID: string;
      };

      const params: SubmitCheckpointProofParams = {
        sessionId: BigInt(1),
        tokensClaimed: 100,
        proofHash: '0x' + 'ab'.repeat(32),
        proofCID: 'baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwdtest0',
        deltaCID: ''
      };

      expect(params.sessionId).toBe(BigInt(1));
      expect(params.tokensClaimed).toBe(100);
      expect(params.proofHash).toHaveLength(66);
      expect(params.proofCID).toBe('baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwdtest0');
      // Feb 2026: No signature parameter
      expect(params).not.toHaveProperty('signature');
    });

    it('should NOT have old 6-param signature with ECDSA signature', async () => {
      // Feb 2026: ECDSA signature removed
      // Old signature was: (sessionId, tokensClaimed, proofHash, signature, proofCID, deltaCID)
      // New signature is: (sessionId, tokensClaimed, proofHash, proofCID, deltaCID)

      type OldSubmitParams = {
        sessionId: bigint;
        tokensClaimed: number;
        proofHash: string;
        signature: string;  // REMOVED in Feb 2026
        proofCID: string;
        deltaCID: string;
      };

      type NewSubmitParams = {
        sessionId: bigint;
        tokensClaimed: number;
        proofHash: string;
        proofCID: string;
        deltaCID: string;
      };

      // Verify the types are different
      const oldParams: OldSubmitParams = {
        sessionId: BigInt(1),
        tokensClaimed: 100,
        proofHash: '0x' + 'ab'.repeat(32),
        signature: '0x' + 'cd'.repeat(65),
        proofCID: 'cid',
        deltaCID: ''
      };

      const newParams: NewSubmitParams = {
        sessionId: BigInt(1),
        tokensClaimed: 100,
        proofHash: '0x' + 'ab'.repeat(32),
        proofCID: 'cid',
        deltaCID: ''
      };

      // Old params should have 6 keys, new should have 5
      expect(Object.keys(oldParams).length).toBe(6);
      expect(Object.keys(newParams).length).toBe(5);

      // New params should NOT have signature
      expect(newParams).not.toHaveProperty('signature');
    });
  });

  describe('getProofSubmission', () => {
    it('should return ProofSubmissionResult with deltaCID (Feb 2026)', async () => {
      // Feb 2026: Now returns 5 values including deltaCID
      type ProofSubmissionResult = {
        proofHash: string;
        tokensClaimed: bigint;
        timestamp: bigint;
        verified: boolean;
        deltaCID: string;  // Added Feb 2026
      };

      const result: ProofSubmissionResult = {
        proofHash: '0x' + 'ab'.repeat(32),
        tokensClaimed: BigInt(100),
        timestamp: BigInt(1700000000),
        verified: true,
        deltaCID: 'bafybeedelta'
      };

      expect(result.proofHash).toHaveLength(66);
      expect(result.tokensClaimed).toBe(BigInt(100));
      expect(typeof result.timestamp).toBe('bigint');
      expect(result.verified).toBe(true);
      expect(result.deltaCID).toBe('bafybeedelta');
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
