// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for ABI fragments - Security Audit Migration
 * Verifies the updated contract function signatures
 */

import { describe, it, expect } from 'vitest';
import { JobMarketplaceFragments } from '../../src/contracts/abis/index';

describe('ABI Fragments - Security Audit Migration', () => {
  describe('JobMarketplaceFragments', () => {
    it('submitProofOfWork has 5 parameters with signature', () => {
      // New signature: (jobId, tokensClaimed, proofHash, signature, proofCID)
      expect(JobMarketplaceFragments.submitProofOfWork).toContain('uint256 jobId');
      expect(JobMarketplaceFragments.submitProofOfWork).toContain('uint256 tokensClaimed');
      expect(JobMarketplaceFragments.submitProofOfWork).toContain('bytes32 proofHash');
      expect(JobMarketplaceFragments.submitProofOfWork).toContain('bytes signature');
      expect(JobMarketplaceFragments.submitProofOfWork).toContain('string proofCID');
      // Should NOT contain old parameter names
      expect(JobMarketplaceFragments.submitProofOfWork).not.toContain('tokensProven');
      expect(JobMarketplaceFragments.submitProofOfWork).not.toContain('bytes proof');
    });

    it('getProofSubmission fragment exists', () => {
      expect(JobMarketplaceFragments.getProofSubmission).toBeDefined();
      expect(JobMarketplaceFragments.getProofSubmission).toContain('uint256 sessionId');
      expect(JobMarketplaceFragments.getProofSubmission).toContain('uint256 proofIndex');
    });

    it('getLockedBalanceNative fragment exists', () => {
      expect(JobMarketplaceFragments.getLockedBalanceNative).toBeDefined();
      expect(JobMarketplaceFragments.getLockedBalanceNative).toContain('address account');
    });

    it('getLockedBalanceToken fragment exists', () => {
      expect(JobMarketplaceFragments.getLockedBalanceToken).toBeDefined();
      expect(JobMarketplaceFragments.getLockedBalanceToken).toContain('address account');
      expect(JobMarketplaceFragments.getLockedBalanceToken).toContain('address token');
    });

    it('getTotalBalanceNative fragment exists', () => {
      expect(JobMarketplaceFragments.getTotalBalanceNative).toBeDefined();
      expect(JobMarketplaceFragments.getTotalBalanceNative).toContain('address account');
    });

    it('getTotalBalanceToken fragment exists', () => {
      expect(JobMarketplaceFragments.getTotalBalanceToken).toBeDefined();
      expect(JobMarketplaceFragments.getTotalBalanceToken).toContain('address account');
      expect(JobMarketplaceFragments.getTotalBalanceToken).toContain('address token');
    });

    it('claimWithProof is removed (legacy)', () => {
      // claimWithProof was removed in security audit
      expect((JobMarketplaceFragments as any).claimWithProof).toBeUndefined();
    });
  });
});
