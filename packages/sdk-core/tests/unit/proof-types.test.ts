// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for Proof Type Definitions - Security Audit Migration
 * Verifies the new proof-related types are exported correctly
 */

import { describe, it, expect } from 'vitest';
import {
  ProofSubmissionParams,
  ProofSubmissionResult,
  UserBalanceInfo,
  SessionStatus
} from '../../src/types/proof.types';

describe('Proof Type Definitions - Security Audit Migration', () => {
  describe('ProofSubmissionParams', () => {
    it('should have all required fields', () => {
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
  });

  describe('ProofSubmissionResult', () => {
    it('should have all required fields', () => {
      const result: ProofSubmissionResult = {
        proofHash: '0x' + 'ab'.repeat(32),
        tokensClaimed: BigInt(500),
        timestamp: BigInt(Date.now()),
        verified: true
      };

      expect(result.proofHash).toHaveLength(66);
      expect(result.tokensClaimed).toBe(BigInt(500));
      expect(typeof result.timestamp).toBe('bigint');
      expect(result.verified).toBe(true);
    });

    it('verified field can be false (graceful degradation)', () => {
      // verified=false means ProofSystem skipped verification but proof was accepted
      const result: ProofSubmissionResult = {
        proofHash: '0x' + 'cd'.repeat(32),
        tokensClaimed: BigInt(200),
        timestamp: BigInt(1700000000),
        verified: false
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
      expect(SessionStatus.Active).toBe(0);
      expect(SessionStatus.Completed).toBe(1);
      expect(SessionStatus.TimedOut).toBe(2);
      expect(SessionStatus.Disputed).toBe(3);
      expect(SessionStatus.Abandoned).toBe(4);
      expect(SessionStatus.Cancelled).toBe(5);
    });

    it('should match contract enum values', () => {
      // These values must match the contract's SessionStatus enum
      // Order is critical for ABI encoding/decoding
      const statusNames = ['Active', 'Completed', 'TimedOut', 'Disputed', 'Abandoned', 'Cancelled'];
      statusNames.forEach((name, index) => {
        expect(SessionStatus[name as keyof typeof SessionStatus]).toBe(index);
      });
    });
  });
});
