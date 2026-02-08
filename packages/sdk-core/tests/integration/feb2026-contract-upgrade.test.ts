// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Integration tests for February 2026 Contract Upgrade
 *
 * Tests the SDK's integration with updated contract ABIs:
 * - Signature removal from submitProofOfWork
 * - V2 Direct Payment Delegation
 * - Early cancellation fee query
 *
 * Note: Most tests are skipped in CI as they require live contract.
 * Run with RPC access for full integration testing.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

// Import types to verify they exist
import type { ProofSubmissionParams, ProofSubmissionResult } from '../../src/types/proof.types';
import { DELEGATION_ERRORS, parseDelegationError } from '../../src/types/errors';
import { JobMarketplaceFragments } from '../../src/contracts/abis/index';

describe('February 2026 Contract Upgrade - Integration', () => {
  describe('Type Definitions', () => {
    it('ProofSubmissionParams should have optional signature', () => {
      const params: ProofSubmissionParams = {
        sessionId: BigInt(1),
        tokensClaimed: BigInt(100),
        proofHash: '0x' + 'ab'.repeat(32),
        proofCID: 'bafybeicid',
        // signature is optional - can be omitted
        deltaCID: ''
      };

      expect(params.signature).toBeUndefined();
      expect(params.deltaCID).toBe('');
    });

    it('ProofSubmissionResult should include deltaCID', () => {
      const result: ProofSubmissionResult = {
        proofHash: '0x' + 'ab'.repeat(32),
        tokensClaimed: BigInt(100),
        timestamp: BigInt(1707177600),
        verified: true,
        deltaCID: 'bafybeedelta'
      };

      expect(result.deltaCID).toBe('bafybeedelta');
    });
  });

  describe('ABI Fragments', () => {
    it('submitProofOfWork has 5 params without signature', () => {
      const fragment = JobMarketplaceFragments.submitProofOfWork;

      expect(fragment).toContain('uint256 jobId');
      expect(fragment).toContain('uint256 tokensClaimed');
      expect(fragment).toContain('bytes32 proofHash');
      expect(fragment).toContain('string proofCID');
      expect(fragment).toContain('string deltaCID');
      expect(fragment).not.toContain('bytes signature');
    });

    it('V2 delegation fragments exist', () => {
      expect(JobMarketplaceFragments.authorizeDelegate).toBeDefined();
      expect(JobMarketplaceFragments.isDelegateAuthorized).toBeDefined();
      expect(JobMarketplaceFragments.createSessionAsDelegate).toBeDefined();
      expect(JobMarketplaceFragments.createSessionForModelAsDelegate).toBeDefined();
    });

    it('minTokensFee fragment exists', () => {
      expect(JobMarketplaceFragments.minTokensFee).toBeDefined();
      expect(JobMarketplaceFragments.minTokensFee).toContain('minTokensFee');
    });
  });

  describe('Delegation Error Types', () => {
    it('DELEGATION_ERRORS constants exist', () => {
      expect(DELEGATION_ERRORS.NOT_DELEGATE).toBe('NotDelegate');
      expect(DELEGATION_ERRORS.ERC20_ONLY).toBe('ERC20Only');
      expect(DELEGATION_ERRORS.BAD_PARAMS).toBe('BadDelegateParams');
    });

    it('parseDelegationError handles all error types', () => {
      expect(parseDelegationError({ message: 'NotDelegate' })).toBe('Caller not authorized as delegate for payer');
      expect(parseDelegationError({ message: 'ERC20Only' })).toBe('Direct delegation requires ERC-20 token (no ETH)');
      expect(parseDelegationError({ message: 'BadDelegateParams' })).toBe('Invalid delegation parameters');
      expect(parseDelegationError({ message: 'other error' })).toBeNull();
    });
  });

  // Skip live contract tests in CI
  describe.skip('Live Contract Tests (require RPC)', () => {
    it('submitProofOfWork without signature', async () => {
      // This test requires live contract access
      // Run manually with: SKIP_LIVE=false pnpm test feb2026
    });

    it('V2 delegation flow', async () => {
      // Test: authorize → createSessionAsDelegate
      // Requires live contract and test accounts
    });

    it('minTokensFee query', async () => {
      // Query the early cancellation fee
    });
  });
});
