// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for Proof Type Definitions
 *
 * February 2026 Contract Update:
 * - signature is now optional (deprecated)
 * - deltaCID added to both ProofSubmissionParams and ProofSubmissionResult
 */

import { describe, it, expect } from 'vitest';
import {
  ProofSubmissionParams,
  ProofSubmissionResult,
  UserBalanceInfo,
  SessionStatus
} from '../../src/types/proof.types';

describe('Proof Type Definitions', () => {
  describe('ProofSubmissionParams', () => {
    it('should have all required fields (legacy with signature)', () => {
      const params: ProofSubmissionParams = {
        sessionId: BigInt(1),
        tokensClaimed: BigInt(100),
        proofHash: '0x' + '00'.repeat(32),
        signature: '0x' + '00'.repeat(65),
        proofCID: 'baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwdtest0'
      };

      expect(params.sessionId).toBe(BigInt(1));
      expect(params.tokensClaimed).toBe(BigInt(100));
      expect(params.proofHash).toHaveLength(66); // 0x + 64 hex chars
      expect(params.signature).toHaveLength(132); // 0x + 130 hex chars (65 bytes)
      expect(params.proofCID).toBe('baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwdtest0');
    });

    it('should allow signature to be optional (Feb 2026: deprecated)', () => {
      // Feb 2026: signature is now optional/deprecated
      const params: ProofSubmissionParams = {
        sessionId: BigInt(123),
        tokensClaimed: BigInt(100),
        proofHash: '0xabcdef',
        proofCID: 'bafybeicid'
        // signature omitted - now optional
      };

      expect(params.sessionId).toBe(BigInt(123));
      expect(params.signature).toBeUndefined();
    });

    it('should allow deltaCID to be specified (Feb 2026)', () => {
      const params: ProofSubmissionParams = {
        sessionId: BigInt(456),
        tokensClaimed: BigInt(200),
        proofHash: '0x123456',
        proofCID: 'bafybeicid',
        deltaCID: 'bafybeedelta'
      };

      expect(params.deltaCID).toBe('bafybeedelta');
    });

    it('should allow deltaCID to be undefined (optional)', () => {
      const params: ProofSubmissionParams = {
        sessionId: BigInt(789),
        tokensClaimed: BigInt(300),
        proofHash: '0x789abc',
        proofCID: 'bafybeicid'
        // deltaCID is optional - omitted
      };

      expect(params.deltaCID).toBeUndefined();
    });
  });

  describe('ProofSubmissionResult', () => {
    it('should have all required fields including deltaCID (Feb 2026)', () => {
      const result: ProofSubmissionResult = {
        proofHash: '0x' + 'ab'.repeat(32),
        tokensClaimed: BigInt(500),
        timestamp: BigInt(Date.now()),
        verified: true,
        deltaCID: 'bafybeedelta'
      };

      expect(result.proofHash).toHaveLength(66);
      expect(result.tokensClaimed).toBe(BigInt(500));
      expect(typeof result.timestamp).toBe('bigint');
      expect(result.verified).toBe(true);
      expect(result.deltaCID).toBe('bafybeedelta');
    });

    it('should have deltaCID as string type', () => {
      const result: ProofSubmissionResult = {
        proofHash: '0xhash',
        tokensClaimed: BigInt(100),
        timestamp: BigInt(1000),
        verified: false,
        deltaCID: ''
      };

      expect(typeof result.deltaCID).toBe('string');
    });

    it('should allow empty string deltaCID', () => {
      const result: ProofSubmissionResult = {
        proofHash: '0xhash',
        tokensClaimed: BigInt(100),
        timestamp: BigInt(1000),
        verified: true,
        deltaCID: ''  // Empty when no delta submitted
      };

      expect(result.deltaCID).toBe('');
    });

    it('verified field can be false (graceful degradation)', () => {
      // verified=false means ProofSystem skipped verification but proof was accepted
      const result: ProofSubmissionResult = {
        proofHash: '0x' + 'cd'.repeat(32),
        tokensClaimed: BigInt(200),
        timestamp: BigInt(1700000000),
        verified: false,
        deltaCID: ''
      };

      expect(result.verified).toBe(false);
    });
  });

  describe('UserBalanceInfo', () => {
    it('should have withdrawable, locked, and total fields', () => {
      const balance: UserBalanceInfo = {
        withdrawable: BigInt(1000),
        locked: BigInt(500),
        total: BigInt(1500)
      };

      expect(balance.withdrawable).toBe(BigInt(1000));
      expect(balance.locked).toBe(BigInt(500));
      expect(balance.total).toBe(BigInt(1500));
    });
  });

  describe('SessionStatus', () => {
    it('should have all status values', () => {
      // Contract enum reduced to 3 values after security audit
      // Disputed/Abandoned/Cancelled removed - disputes handled off-chain via DAO
      expect(SessionStatus.Active).toBe(0);
      expect(SessionStatus.Completed).toBe(1);
      expect(SessionStatus.TimedOut).toBe(2);
    });

    it('should match contract enum values', () => {
      // These values must match the contract's SessionStatus enum
      // Order is critical for ABI encoding/decoding
      const statusNames = ['Active', 'Completed', 'TimedOut'];
      statusNames.forEach((name, index) => {
        expect(SessionStatus[name as keyof typeof SessionStatus]).toBe(index);
      });
    });

    it('should only have 3 values (security audit requirement)', () => {
      // Verify no extra values exist
      const enumKeys = Object.keys(SessionStatus).filter(k => isNaN(Number(k)));
      expect(enumKeys).toEqual(['Active', 'Completed', 'TimedOut']);
    });
  });
});
