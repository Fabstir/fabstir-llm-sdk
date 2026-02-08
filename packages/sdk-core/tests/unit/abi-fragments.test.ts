// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for ABI fragments
 *
 * February 2026 Contract Update: Signature removed from submitProofOfWork
 */

import { describe, it, expect } from 'vitest';
import { JobMarketplaceFragments } from '../../src/contracts/abis/index';

describe('ABI Fragments (Feb 2026)', () => {
  describe('JobMarketplaceFragments', () => {
    it('submitProofOfWork has 5 parameters (no signature)', () => {
      // Feb 2026: (jobId, tokensClaimed, proofHash, proofCID, deltaCID)
      expect(JobMarketplaceFragments.submitProofOfWork).toContain('uint256 jobId');
      expect(JobMarketplaceFragments.submitProofOfWork).toContain('uint256 tokensClaimed');
      expect(JobMarketplaceFragments.submitProofOfWork).toContain('bytes32 proofHash');
      expect(JobMarketplaceFragments.submitProofOfWork).toContain('string proofCID');
      expect(JobMarketplaceFragments.submitProofOfWork).toContain('string deltaCID');
      // Feb 2026: signature REMOVED - auth via msg.sender
      expect(JobMarketplaceFragments.submitProofOfWork).not.toContain('bytes signature');
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
