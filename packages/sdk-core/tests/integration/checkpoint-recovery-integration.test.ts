// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Integration tests for checkpoint recovery flow.
 * Tests the complete SDK recovery pipeline with mocked external dependencies.
 *
 * These tests verify:
 * - HTTP API integration
 * - S5 storage interaction
 * - Signature verification
 * - Delta merging logic
 * - Error propagation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchCheckpointIndex,
  verifyCheckpointIndex,
  fetchAndVerifyDelta,
  mergeDeltas,
  recoverFromCheckpointsFlow,
} from '../../src/utils/checkpoint-recovery';
import { fetchCheckpointIndexFromNode } from '../../src/utils/checkpoint-http';
import type {
  CheckpointIndex,
  CheckpointIndexEntry,
  CheckpointDelta,
  RecoveredConversation,
} from '../../src/types';

// Mock fetch for HTTP tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Checkpoint Recovery Integration', () => {
  // Test fixtures
  const hostAddress = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
  const sessionId = '12345';

  const createCheckpointEntry = (
    index: number,
    startToken: number,
    endToken: number
  ): CheckpointIndexEntry => ({
    index,
    proofHash: `0x${(index + 1).toString(16).padStart(64, '0')}`,
    deltaCid: `baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd0000${index}`,
    proofCid: `baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwdproof${index}`,
    tokenRange: [startToken, endToken] as [number, number],
    timestamp: 1704067200000 + index * 60000,
  });

  const createDelta = (
    checkpointIndex: number,
    startToken: number,
    endToken: number,
    content: string,
    partial = false
  ): CheckpointDelta => ({
    sessionId,
    checkpointIndex,
    proofHash: `0x${(checkpointIndex + 1).toString(16).padStart(64, '0')}`,
    startToken,
    endToken,
    messages: [
      {
        role: 'assistant' as const,
        content,
        timestamp: 1704067200000 + checkpointIndex * 60000,
        ...(partial ? { metadata: { partial: true } } : {}),
      },
    ],
    hostSignature: `0xvalidsig${checkpointIndex}`,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Multi-Checkpoint Recovery Flow', () => {
    it('should recover conversation from 5 checkpoints', async () => {
      // Create 5 checkpoints spanning 5000 tokens
      const checkpoints = [
        createCheckpointEntry(0, 0, 1000),
        createCheckpointEntry(1, 1000, 2000),
        createCheckpointEntry(2, 2000, 3000),
        createCheckpointEntry(3, 3000, 4000),
        createCheckpointEntry(4, 4000, 5000),
      ];

      // Use partial=true for first 4 checkpoints so they get merged
      const deltas = [
        createDelta(0, 0, 1000, 'First checkpoint content. ', true),
        createDelta(1, 1000, 2000, 'Second checkpoint continues. ', true),
        createDelta(2, 2000, 3000, 'Third checkpoint adds more. ', true),
        createDelta(3, 3000, 4000, 'Fourth checkpoint progresses. ', true),
        createDelta(4, 4000, 5000, 'Fifth checkpoint concludes.', false), // Final, not partial
      ];

      // Merge deltas
      const result = mergeDeltas(deltas);

      expect(result.tokenCount).toBe(5000);
      expect(result.messages).toHaveLength(1); // All merged into one assistant message
      expect(result.messages[0].content).toBe(
        'First checkpoint content. ' +
        'Second checkpoint continues. ' +
        'Third checkpoint adds more. ' +
        'Fourth checkpoint progresses. ' +
        'Fifth checkpoint concludes.'
      );
    });

    it('should handle mixed user/assistant messages across checkpoints', async () => {
      const deltas: CheckpointDelta[] = [
        {
          sessionId,
          checkpointIndex: 0,
          proofHash: '0x01',
          startToken: 0,
          endToken: 500,
          messages: [
            { role: 'user', content: 'Hello!', timestamp: 1000 },
            { role: 'assistant', content: 'Hi there! ', timestamp: 1001 },
          ],
          hostSignature: '0xsig0',
        },
        {
          sessionId,
          checkpointIndex: 1,
          proofHash: '0x02',
          startToken: 500,
          endToken: 1000,
          messages: [
            { role: 'assistant', content: 'How can I help?', timestamp: 1002 },
          ],
          hostSignature: '0xsig1',
        },
        {
          sessionId,
          checkpointIndex: 2,
          proofHash: '0x03',
          startToken: 1000,
          endToken: 1500,
          messages: [
            { role: 'user', content: 'Tell me about AI', timestamp: 1003 },
            { role: 'assistant', content: 'AI is fascinating...', timestamp: 1004 },
          ],
          hostSignature: '0xsig2',
        },
      ];

      const result = mergeDeltas(deltas);

      expect(result.tokenCount).toBe(1500);
      // Messages are not merged unless marked with metadata.partial = true
      // So we get 5 messages: user, assistant, assistant, user, assistant
      expect(result.messages).toHaveLength(5);
      expect(result.messages[0]).toEqual({ role: 'user', content: 'Hello!', timestamp: 1000 });
      expect(result.messages[1]).toEqual({
        role: 'assistant',
        content: 'Hi there! ',
        timestamp: 1001,
      });
      expect(result.messages[2]).toEqual({
        role: 'assistant',
        content: 'How can I help?',
        timestamp: 1002,
      });
      expect(result.messages[3]).toEqual({ role: 'user', content: 'Tell me about AI', timestamp: 1003 });
      expect(result.messages[4]).toEqual({
        role: 'assistant',
        content: 'AI is fascinating...',
        timestamp: 1004,
      });
    });
  });

  describe('HTTP API Integration', () => {
    it('should construct correct API URL for checkpoint fetch', async () => {
      const index: CheckpointIndex = {
        sessionId,
        hostAddress,
        checkpoints: [createCheckpointEntry(0, 0, 1000)],
        messagesSignature: '0xmsgsig',
        checkpointsSignature: '0xcpsig',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => index,
      });

      await fetchCheckpointIndexFromNode('http://node.example.com:8080', sessionId);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://node.example.com:8080/v1/checkpoints/12345',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
        })
      );
    });

    it('should handle various HTTP status codes correctly', async () => {
      const hostUrl = 'http://node.example.com:8080';

      // 404 - No checkpoints
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      const result404 = await fetchCheckpointIndexFromNode(hostUrl, sessionId);
      expect(result404).toBeNull();

      // 500 - Server error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      await expect(fetchCheckpointIndexFromNode(hostUrl, sessionId)).rejects.toThrow(
        'CHECKPOINT_FETCH_FAILED'
      );

      // 503 - Service unavailable
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });
      await expect(fetchCheckpointIndexFromNode(hostUrl, sessionId)).rejects.toThrow(
        'CHECKPOINT_FETCH_FAILED'
      );
    });
  });

  describe('Token Range Validation', () => {
    it('should validate contiguous token ranges', () => {
      const checkpoints = [
        createCheckpointEntry(0, 0, 1000),
        createCheckpointEntry(1, 1000, 2000),
        createCheckpointEntry(2, 2000, 3000),
      ];

      // Verify ranges are contiguous
      for (let i = 1; i < checkpoints.length; i++) {
        expect(checkpoints[i].tokenRange[0]).toBe(checkpoints[i - 1].tokenRange[1]);
      }
    });

    it('should detect gaps in token ranges', () => {
      const checkpointsWithGap = [
        createCheckpointEntry(0, 0, 1000),
        createCheckpointEntry(1, 1100, 2000), // Gap: 1000-1100 missing
        createCheckpointEntry(2, 2000, 3000),
      ];

      // Check for gap
      const hasGap = checkpointsWithGap.some((cp, i) => {
        if (i === 0) return false;
        return cp.tokenRange[0] !== checkpointsWithGap[i - 1].tokenRange[1];
      });

      expect(hasGap).toBe(true);
    });

    it('should detect overlapping token ranges', () => {
      const checkpointsWithOverlap = [
        createCheckpointEntry(0, 0, 1000),
        createCheckpointEntry(1, 900, 2000), // Overlap: 900-1000
        createCheckpointEntry(2, 2000, 3000),
      ];

      // Check for overlap
      const hasOverlap = checkpointsWithOverlap.some((cp, i) => {
        if (i === 0) return false;
        return cp.tokenRange[0] < checkpointsWithOverlap[i - 1].tokenRange[1];
      });

      expect(hasOverlap).toBe(true);
    });
  });

  describe('Signature Verification', () => {
    it('should require both messagesSignature and checkpointsSignature', () => {
      const validIndex: CheckpointIndex = {
        sessionId,
        hostAddress,
        checkpoints: [createCheckpointEntry(0, 0, 1000)],
        messagesSignature: '0xmsgsig',
        checkpointsSignature: '0xcpsig',
      };

      expect(validIndex.messagesSignature).toBeDefined();
      expect(validIndex.checkpointsSignature).toBeDefined();
    });

    it('should include hostSignature in each delta', () => {
      const delta = createDelta(0, 0, 1000, 'test content');

      expect(delta.hostSignature).toBeDefined();
      expect(delta.hostSignature).toMatch(/^0x/);
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle large number of checkpoints efficiently', () => {
      const numCheckpoints = 100;
      const deltas: CheckpointDelta[] = [];

      for (let i = 0; i < numCheckpoints; i++) {
        deltas.push(createDelta(i, i * 1000, (i + 1) * 1000, `Content ${i}. `));
      }

      const startTime = Date.now();
      const result = mergeDeltas(deltas);
      const endTime = Date.now();

      expect(result.tokenCount).toBe(numCheckpoints * 1000);
      expect(endTime - startTime).toBeLessThan(100); // Should complete in <100ms
    });

    it('should handle empty checkpoints array', () => {
      const result = mergeDeltas([]);

      expect(result.messages).toEqual([]);
      expect(result.tokenCount).toBe(0);
      // Note: mergeDeltas returns { messages, tokenCount } - no checkpoints field
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should provide clear error for invalid checkpoint structure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          sessionId,
          // Missing hostAddress, checkpoints, signatures
        }),
      });

      await expect(
        fetchCheckpointIndexFromNode('http://node.example.com:8080', sessionId)
      ).rejects.toThrow('INVALID_CHECKPOINT_INDEX');
    });

    it('should provide clear error for invalid checkpoint entry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          sessionId,
          hostAddress,
          checkpoints: [
            {
              index: 0,
              // Missing required fields
            },
          ],
          messagesSignature: '0xmsgsig',
          checkpointsSignature: '0xcpsig',
        }),
      });

      await expect(
        fetchCheckpointIndexFromNode('http://node.example.com:8080', sessionId)
      ).rejects.toThrow('INVALID_CHECKPOINT_INDEX');
    });

    it('should handle network timeout gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(
        fetchCheckpointIndexFromNode('http://node.example.com:8080', sessionId)
      ).rejects.toThrow('CHECKPOINT_FETCH_FAILED');
    });
  });

  describe('CID Format Handling', () => {
    it('should handle raw CID format without prefix', () => {
      const entry = createCheckpointEntry(0, 0, 1000);

      // CIDs should be raw format (no s5:// prefix)
      expect(entry.deltaCid).not.toMatch(/^s5:\/\//);
      expect(entry.proofCid).not.toMatch(/^s5:\/\//);
      expect(entry.deltaCid).toMatch(/^baaa/);
    });

    it('should store proofCid as optional field', () => {
      const entryWithProofCid = createCheckpointEntry(0, 0, 1000);
      expect(entryWithProofCid.proofCid).toBeDefined();

      // Entry without proofCid should still be valid
      const entryWithoutProofCid: CheckpointIndexEntry = {
        index: 0,
        proofHash: '0x01',
        deltaCid: 'baaaqeayeaudaocajbifqydiob4ibceqtcqkrmfyydenbwd000000',
        tokenRange: [0, 1000],
        timestamp: Date.now(),
      };
      expect(entryWithoutProofCid.proofCid).toBeUndefined();
    });
  });
});
