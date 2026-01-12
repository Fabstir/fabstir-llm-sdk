// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Integration Tests for Checkpoint Recovery Flow
 *
 * Tests the full recovery flow with mocked S5 and contract responses.
 * Validates that SDK can recover conversations from node-published checkpoints.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchCheckpointIndex,
  verifyCheckpointIndex,
  fetchAndVerifyDelta,
  mergeDeltas,
  recoverFromCheckpointsFlow,
} from '../../src/utils/checkpoint-recovery';
import type {
  CheckpointIndex,
  CheckpointDelta,
  CheckpointIndexEntry,
  Message,
} from '../../src/types';

// Mock StorageManager
const createMockStorageManager = (mockData: Record<string, any>) => ({
  getS5Client: () => ({
    fs: {
      get: vi.fn().mockImplementation(async (path: string) => {
        if (path in mockData) {
          return mockData[path];
        }
        return null;
      }),
    },
  }),
  getByCID: vi.fn().mockImplementation(async (cid: string) => {
    if (cid in mockData) {
      return mockData[cid];
    }
    return null;
  }),
});

// Mock Contract
const createMockContract = (proofs: Record<number, { proofHash: string }>) => ({
  getProofSubmission: vi.fn().mockImplementation(async (sessionId: bigint, index: number) => {
    if (index in proofs) {
      return {
        proofHash: proofs[index].proofHash,
        tokensClaimed: BigInt(1000),
        timestamp: BigInt(Date.now()),
        verified: true,
      };
    }
    throw new Error(`Proof ${index} not found`);
  }),
});

// Helper to create test messages
const createMessage = (role: 'user' | 'assistant', content: string, partial?: boolean): Message => ({
  role,
  content,
  timestamp: Date.now(),
  ...(partial ? { metadata: { partial: true } } : {}),
});

// Helper to create test delta
const createDelta = (
  sessionId: string,
  index: number,
  startToken: number,
  endToken: number,
  messages: Message[],
  proofHash: string
): CheckpointDelta => ({
  sessionId,
  checkpointIndex: index,
  proofHash,
  startToken,
  endToken,
  messages,
  hostSignature: '0x' + 'ab'.repeat(65),
});

// Helper to create test checkpoint entry
const createCheckpointEntry = (
  index: number,
  proofHash: string,
  deltaCid: string,
  startToken: number,
  endToken: number
): CheckpointIndexEntry => ({
  index,
  proofHash,
  deltaCid,
  tokenRange: [startToken, endToken] as [number, number],
  timestamp: Date.now(),
});

describe('Checkpoint Recovery Integration Tests', () => {
  const hostAddress = '0x1234567890123456789012345678901234567890';
  const sessionId = '12345';
  const sessionIdBigInt = BigInt(12345);

  describe('Full Recovery Flow - Single Checkpoint', () => {
    it('should recover conversation with 1 checkpoint', async () => {
      const proofHash = '0x' + 'aa'.repeat(32);
      const deltaCid = 'baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd000001';

      const messages: Message[] = [
        createMessage('user', 'Hello, how are you?'),
        createMessage('assistant', 'I am doing well, thank you!'),
      ];

      const delta = createDelta(sessionId, 0, 0, 1000, messages, proofHash);

      const index: CheckpointIndex = {
        sessionId,
        hostAddress: hostAddress.toLowerCase(),
        checkpoints: [createCheckpointEntry(0, proofHash, deltaCid, 0, 1000)],
        messagesSignature: '0x' + 'cd'.repeat(65),
        checkpointsSignature: '0x' + 'ef'.repeat(65),
      };

      const mockData: Record<string, any> = {
        [`home/checkpoints/${hostAddress.toLowerCase()}/${sessionId}/index.json`]: index,
        [deltaCid]: delta,
      };

      const storageManager = createMockStorageManager(mockData);
      const contract = createMockContract({ 0: { proofHash } });

      const getSessionInfo = async (id: bigint) => ({
        hostAddress,
        status: 'active',
      });

      const result = await recoverFromCheckpointsFlow(
        storageManager as any,
        contract,
        getSessionInfo,
        sessionIdBigInt
      );

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content).toBe('Hello, how are you?');
      expect(result.messages[1].content).toBe('I am doing well, thank you!');
      expect(result.tokenCount).toBe(1000);
      expect(result.checkpoints).toHaveLength(1);
    });
  });

  describe('Full Recovery Flow - Multiple Checkpoints', () => {
    it('should recover conversation with 5 checkpoints', async () => {
      const proofHashes = Array.from({ length: 5 }, (_, i) => '0x' + (i + 1).toString(16).padStart(64, '0'));
      const deltaCids = Array.from({ length: 5 }, (_, i) => `baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd00000${i}`);

      const checkpoints: CheckpointIndexEntry[] = proofHashes.map((hash, i) =>
        createCheckpointEntry(i, hash, deltaCids[i], i * 1000, (i + 1) * 1000)
      );

      const index: CheckpointIndex = {
        sessionId,
        hostAddress: hostAddress.toLowerCase(),
        checkpoints,
        messagesSignature: '0x' + 'cd'.repeat(65),
        checkpointsSignature: '0x' + 'ef'.repeat(65),
      };

      // Create deltas with messages
      const deltas: CheckpointDelta[] = [
        createDelta(sessionId, 0, 0, 1000, [
          createMessage('user', 'Explain quantum computing'),
          createMessage('assistant', 'Quantum computing uses quantum...', true),
        ], proofHashes[0]),
        createDelta(sessionId, 1, 1000, 2000, [
          createMessage('assistant', 'mechanical phenomena like...', true),
        ], proofHashes[1]),
        createDelta(sessionId, 2, 2000, 3000, [
          createMessage('assistant', 'superposition and entanglement...', true),
        ], proofHashes[2]),
        createDelta(sessionId, 3, 3000, 4000, [
          createMessage('assistant', 'to perform computations...'),
        ], proofHashes[3]),
        createDelta(sessionId, 4, 4000, 5000, [
          createMessage('user', 'What are the applications?'),
          createMessage('assistant', 'Applications include cryptography...'),
        ], proofHashes[4]),
      ];

      const mockData: Record<string, any> = {
        [`home/checkpoints/${hostAddress.toLowerCase()}/${sessionId}/index.json`]: index,
      };
      deltas.forEach((delta, i) => {
        mockData[deltaCids[i]] = delta;
      });

      const proofs: Record<number, { proofHash: string }> = {};
      proofHashes.forEach((hash, i) => {
        proofs[i] = { proofHash: hash };
      });

      const storageManager = createMockStorageManager(mockData);
      const contract = createMockContract(proofs);

      const getSessionInfo = async (id: bigint) => ({
        hostAddress,
        status: 'active',
      });

      const result = await recoverFromCheckpointsFlow(
        storageManager as any,
        contract,
        getSessionInfo,
        sessionIdBigInt
      );

      // Should have 4 messages after merging partials:
      // 1. user: "Explain quantum computing"
      // 2. assistant: merged "Quantum computing uses quantum...mechanical phenomena like...superposition and entanglement...to perform computations..."
      // 3. user: "What are the applications?"
      // 4. assistant: "Applications include cryptography..."
      expect(result.messages).toHaveLength(4);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[1].role).toBe('assistant');
      expect(result.messages[1].content).toContain('Quantum computing');
      expect(result.messages[1].content).toContain('to perform computations');
      expect(result.tokenCount).toBe(5000);
      expect(result.checkpoints).toHaveLength(5);
    });
  });

  describe('Recovery with Mixed Message Types', () => {
    it('should handle user and assistant messages correctly', async () => {
      const proofHashes = ['0x' + 'aa'.repeat(32), '0x' + 'bb'.repeat(32)];
      const deltaCids = ['baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd000000', 'baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd000001'];

      const index: CheckpointIndex = {
        sessionId,
        hostAddress: hostAddress.toLowerCase(),
        checkpoints: [
          createCheckpointEntry(0, proofHashes[0], deltaCids[0], 0, 1000),
          createCheckpointEntry(1, proofHashes[1], deltaCids[1], 1000, 2000),
        ],
        messagesSignature: '0x' + 'cd'.repeat(65),
        checkpointsSignature: '0x' + 'ef'.repeat(65),
      };

      const deltas: CheckpointDelta[] = [
        createDelta(sessionId, 0, 0, 1000, [
          createMessage('user', 'First question'),
          createMessage('assistant', 'First answer'),
          createMessage('user', 'Second question'),
        ], proofHashes[0]),
        createDelta(sessionId, 1, 1000, 2000, [
          createMessage('assistant', 'Second answer'),
          createMessage('user', 'Third question'),
          createMessage('assistant', 'Third answer'),
        ], proofHashes[1]),
      ];

      const mockData: Record<string, any> = {
        [`home/checkpoints/${hostAddress.toLowerCase()}/${sessionId}/index.json`]: index,
        [deltaCids[0]]: deltas[0],
        [deltaCids[1]]: deltas[1],
      };

      const storageManager = createMockStorageManager(mockData);
      const contract = createMockContract({
        0: { proofHash: proofHashes[0] },
        1: { proofHash: proofHashes[1] },
      });

      const getSessionInfo = async (id: bigint) => ({
        hostAddress,
        status: 'active',
      });

      const result = await recoverFromCheckpointsFlow(
        storageManager as any,
        contract,
        getSessionInfo,
        sessionIdBigInt
      );

      expect(result.messages).toHaveLength(6);
      expect(result.messages.map(m => m.role)).toEqual([
        'user', 'assistant', 'user', 'assistant', 'user', 'assistant'
      ]);
      expect(result.tokenCount).toBe(2000);
    });
  });

  describe('Graceful Error Handling', () => {
    it('should return empty result when index is missing', async () => {
      const mockData: Record<string, any> = {};
      const storageManager = createMockStorageManager(mockData);
      const contract = createMockContract({});

      const getSessionInfo = async (id: bigint) => ({
        hostAddress,
        status: 'active',
      });

      const result = await recoverFromCheckpointsFlow(
        storageManager as any,
        contract,
        getSessionInfo,
        sessionIdBigInt
      );

      expect(result.messages).toHaveLength(0);
      expect(result.tokenCount).toBe(0);
      expect(result.checkpoints).toHaveLength(0);
    });

    it('should throw when session not found', async () => {
      const mockData: Record<string, any> = {};
      const storageManager = createMockStorageManager(mockData);
      const contract = createMockContract({});

      const getSessionInfo = async (id: bigint) => null;

      await expect(
        recoverFromCheckpointsFlow(
          storageManager as any,
          contract,
          getSessionInfo,
          sessionIdBigInt
        )
      ).rejects.toThrow('SESSION_NOT_FOUND');
    });

    it('should throw when delta fetch fails', async () => {
      const proofHash = '0x' + 'aa'.repeat(32);
      const deltaCid = 'baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd000001';

      const index: CheckpointIndex = {
        sessionId,
        hostAddress: hostAddress.toLowerCase(),
        checkpoints: [createCheckpointEntry(0, proofHash, deltaCid, 0, 1000)],
        messagesSignature: '0x' + 'cd'.repeat(65),
        checkpointsSignature: '0x' + 'ef'.repeat(65),
      };

      // Index exists but delta doesn't
      const mockData: Record<string, any> = {
        [`home/checkpoints/${hostAddress.toLowerCase()}/${sessionId}/index.json`]: index,
        // deltaCid not in mockData - will return null
      };

      const storageManager = createMockStorageManager(mockData);
      const contract = createMockContract({ 0: { proofHash } });

      const getSessionInfo = async (id: bigint) => ({
        hostAddress,
        status: 'active',
      });

      await expect(
        recoverFromCheckpointsFlow(
          storageManager as any,
          contract,
          getSessionInfo,
          sessionIdBigInt
        )
      ).rejects.toThrow('DELTA_FETCH_FAILED');
    });

    it('should throw when proof hash mismatch', async () => {
      const checkpointProofHash = '0x' + 'aa'.repeat(32);
      const onChainProofHash = '0x' + 'bb'.repeat(32); // Different!
      const deltaCid = 'baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd000001';

      const index: CheckpointIndex = {
        sessionId,
        hostAddress: hostAddress.toLowerCase(),
        checkpoints: [createCheckpointEntry(0, checkpointProofHash, deltaCid, 0, 1000)],
        messagesSignature: '0x' + 'cd'.repeat(65),
        checkpointsSignature: '0x' + 'ef'.repeat(65),
      };

      const mockData: Record<string, any> = {
        [`home/checkpoints/${hostAddress.toLowerCase()}/${sessionId}/index.json`]: index,
      };

      const storageManager = createMockStorageManager(mockData);
      // Contract returns different proof hash
      const contract = createMockContract({ 0: { proofHash: onChainProofHash } });

      const getSessionInfo = async (id: bigint) => ({
        hostAddress,
        status: 'active',
      });

      await expect(
        recoverFromCheckpointsFlow(
          storageManager as any,
          contract,
          getSessionInfo,
          sessionIdBigInt
        )
      ).rejects.toThrow('PROOF_HASH_MISMATCH');
    });
  });
});
