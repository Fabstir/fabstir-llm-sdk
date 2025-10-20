// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProofSubmitter } from '../../src/proof/submitter';
import { initializeSDK, authenticateSDK, cleanupSDK, getSDK } from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '../../../../.env.test') });

// Mock the SDK client module
vi.mock('../../src/sdk/client', async () => {
  const mockSessionJobManager = {
    submitProofOfWork: vi.fn().mockResolvedValue({
      hash: '0x' + '1'.repeat(64)  // Valid 32-byte hash
    })
  };

  const mockSDK = {
    isAuthenticated: vi.fn().mockReturnValue(true),
    getSessionJobManager: vi.fn().mockReturnValue(mockSessionJobManager),
    authenticate: vi.fn().mockResolvedValue(true)
  };

  return {
    initializeSDK: vi.fn().mockResolvedValue(true),
    authenticateSDK: vi.fn().mockResolvedValue(true),
    cleanupSDK: vi.fn().mockResolvedValue(true),
    getSDK: vi.fn().mockReturnValue(mockSDK),
    getAuthenticatedAddress: vi.fn().mockReturnValue('0x123')
  };
});

describe('Proof Submission', () => {
  let submitter: ProofSubmitter;

  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
    submitter = new ProofSubmitter();
  });

  afterEach(async () => {
    await cleanupSDK();
    vi.clearAllMocks();
  });

  describe('Proof Data Validation', () => {
    it('should validate proof data structure', () => {
      const validProof = {
        sessionId: 'session-123',
        jobId: BigInt(12345),
        tokensClaimed: 100,
        proof: '0xabcdef123456',
        timestamp: Date.now()
      };

      expect(submitter.validateProofData(validProof)).toBe(true);
    });

    it('should reject invalid proof data', () => {
      const invalidProofs = [
        { sessionId: '', jobId: BigInt(123), tokensClaimed: 100, proof: '0x123' },
        { sessionId: 'test', jobId: null, tokensClaimed: 100, proof: '0x123' },
        { sessionId: 'test', jobId: BigInt(123), tokensClaimed: -1, proof: '0x123' },
        { sessionId: 'test', jobId: BigInt(123), tokensClaimed: 100, proof: '' }
      ];

      invalidProofs.forEach(proof => {
        expect(submitter.validateProofData(proof as any)).toBe(false);
      });
    });

    it('should validate proof hash format', () => {
      expect(submitter.isValidProofHash('0x' + '0'.repeat(64))).toBe(true);
      expect(submitter.isValidProofHash('invalid')).toBe(false);
      expect(submitter.isValidProofHash('0x123')).toBe(false);
    });
  });

  describe('Blockchain Submission', () => {
    it('should submit proof to blockchain', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const proofData = {
        sessionId: 'session-123',
        jobId: BigInt(12345),
        tokensClaimed: 100,
        proof: '0x' + '0'.repeat(128),
        timestamp: Date.now()
      };

      const result = await submitter.submitProof(proofData);

      expect(result.success).toBe(true);
      expect(result.txHash).toBeDefined();
      expect(result.txHash).toMatch(/^0x[a-f0-9]{64}$/i);
    });

    it('should handle submission failure', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      // Use mock injection for failure
      submitter.setMockSubmitFunction(async () => {
        throw new Error('Transaction failed');
      });

      const proofData = {
        sessionId: 'session-123',
        jobId: BigInt(12345),
        tokensClaimed: 100,
        proof: '0x' + '0'.repeat(128),
        timestamp: Date.now()
      };

      const result = await submitter.submitProof(proofData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transaction failed');
    });

    it('should wait for transaction confirmation', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const mockTx = {
        hash: '0x123abc',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          blockNumber: 1000
        })
      };

      // Use mock injection for transaction confirmation
      submitter.setMockSubmitFunction(async () => mockTx);

      const proofData = {
        sessionId: 'session-123',
        jobId: BigInt(12345),
        tokensClaimed: 100,
        proof: '0x' + '0'.repeat(128),
        timestamp: Date.now()
      };

      const result = await submitter.submitProofWithConfirmation(proofData, 3);

      expect(result.success).toBe(true);
      expect(result.confirmed).toBe(true);
      expect(result.blockNumber).toBe(1000);
      expect(mockTx.wait).toHaveBeenCalledWith(3);
    });
  });

  describe('Batch Submission', () => {
    it('should queue multiple proofs', () => {
      const proofs = [
        { sessionId: 'session-1', jobId: BigInt(1), tokensClaimed: 100, proof: '0x111', timestamp: Date.now() },
        { sessionId: 'session-2', jobId: BigInt(2), tokensClaimed: 200, proof: '0x222', timestamp: Date.now() },
        { sessionId: 'session-3', jobId: BigInt(3), tokensClaimed: 150, proof: '0x333', timestamp: Date.now() }
      ];

      proofs.forEach(proof => submitter.queueProof(proof));

      expect(submitter.getQueueSize()).toBe(3);
      expect(submitter.getPendingProofs()).toEqual(proofs);
    });

    it('should process queue in order', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const proofs = [
        { sessionId: 'session-1', jobId: BigInt(1), tokensClaimed: 100, proof: '0x111', timestamp: Date.now() },
        { sessionId: 'session-2', jobId: BigInt(2), tokensClaimed: 200, proof: '0x222', timestamp: Date.now() }
      ];

      proofs.forEach(proof => submitter.queueProof(proof));

      const results = await submitter.processQueue();

      expect(results).toHaveLength(2);
      expect(results[0].proofData.sessionId).toBe('session-1');
      expect(results[1].proofData.sessionId).toBe('session-2');
      expect(submitter.getQueueSize()).toBe(0);
    });

    it('should continue processing queue despite failures', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      let callCount = 0;
      submitter.setMockSubmitFunction(async () => {
        callCount++;
        if (callCount === 1) {
          return { hash: '0x111' };
        } else if (callCount === 2) {
          throw new Error('Failed');
        } else {
          return { hash: '0x333' };
        }
      });

      const proofs = [
        { sessionId: 'session-1', jobId: BigInt(1), tokensClaimed: 100, proof: '0x111', timestamp: Date.now() },
        { sessionId: 'session-2', jobId: BigInt(2), tokensClaimed: 200, proof: '0x222', timestamp: Date.now() },
        { sessionId: 'session-3', jobId: BigInt(3), tokensClaimed: 150, proof: '0x333', timestamp: Date.now() }
      ];

      proofs.forEach(proof => submitter.queueProof(proof));

      const results = await submitter.processQueue();

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });
  });

  describe('Gas Estimation', () => {
    it('should estimate gas for proof submission', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const proofData = {
        sessionId: 'session-123',
        jobId: BigInt(12345),
        tokensClaimed: 100,
        proof: '0x' + '0'.repeat(128),
        timestamp: Date.now()
      };

      const gasEstimate = await submitter.estimateGas(proofData);

      expect(gasEstimate).toBeGreaterThan(BigInt(0));
      expect(gasEstimate).toBeLessThan(BigInt(1000000)); // Reasonable upper limit
    });

    it('should apply gas buffer to estimate', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const proofData = {
        sessionId: 'session-123',
        jobId: BigInt(12345),
        tokensClaimed: 100,
        proof: '0x' + '0'.repeat(128),
        timestamp: Date.now()
      };

      const baseEstimate = await submitter.estimateGas(proofData);
      const bufferedEstimate = await submitter.estimateGasWithBuffer(proofData, 1.2); // 20% buffer

      expect(bufferedEstimate).toBe(baseEstimate * BigInt(120) / BigInt(100));
    });
  });

  describe('Event Emission', () => {
    it('should emit events on successful submission', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const successHandler = vi.fn();
      submitter.on('proof-submitted', successHandler);

      const proofData = {
        sessionId: 'session-123',
        jobId: BigInt(12345),
        tokensClaimed: 100,
        proof: '0x' + '0'.repeat(128),
        timestamp: Date.now()
      };

      await submitter.submitProof(proofData);

      expect(successHandler).toHaveBeenCalledWith({
        proofData,
        txHash: expect.any(String),
        timestamp: expect.any(Number)
      });
    });

    it('should emit events on submission failure', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      // Use mock injection for failure
      submitter.setMockSubmitFunction(async () => {
        throw new Error('Transaction failed');
      });

      const failureHandler = vi.fn();
      submitter.on('proof-failed', failureHandler);

      const proofData = {
        sessionId: 'session-123',
        jobId: BigInt(12345),
        tokensClaimed: 100,
        proof: '0x' + '0'.repeat(128),
        timestamp: Date.now()
      };

      await submitter.submitProof(proofData);

      expect(failureHandler).toHaveBeenCalledWith({
        proofData,
        error: 'Transaction failed',
        timestamp: expect.any(Number)
      });
    });
  });

  describe('Statistics', () => {
    it('should track submission statistics', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      let callCount = 0;
      submitter.setMockSubmitFunction(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Failed');
        }
        return { hash: '0x' + callCount.toString().repeat(64).slice(0, 64) };
      });

      const proofs = [
        { sessionId: 'session-1', jobId: BigInt(1), tokensClaimed: 100, proof: '0x111', timestamp: Date.now() },
        { sessionId: 'session-2', jobId: BigInt(2), tokensClaimed: 200, proof: '0x222', timestamp: Date.now() },
        { sessionId: 'session-3', jobId: BigInt(3), tokensClaimed: 150, proof: '0x333', timestamp: Date.now() }
      ];

      for (const proof of proofs) {
        await submitter.submitProof(proof);
      }

      const stats = submitter.getStatistics();

      expect(stats.totalSubmissions).toBe(3);
      expect(stats.successfulSubmissions).toBe(2);
      expect(stats.failedSubmissions).toBe(1);
      expect(stats.successRate).toBe(2/3);
      expect(stats.totalTokensClaimed).toBe(250); // Only successful: 100 + 150
    });
  });
});