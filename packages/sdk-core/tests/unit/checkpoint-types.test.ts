/**
 * Tests for checkpoint type definitions
 * Sub-phase 1.1: Checkpoint Types
 *
 * These tests verify TypeScript interfaces compile correctly and have required fields.
 * Since TypeScript types are erased at runtime, we test by creating valid objects.
 */

import { describe, it, expect } from 'vitest';
import type {
  CheckpointDelta,
  CheckpointIndexEntry,
  CheckpointIndex,
  RecoveredConversation,
  Message
} from '../../src/types';
import type { ISessionManager } from '../../src/interfaces/ISessionManager';

describe('Checkpoint Types', () => {
  describe('CheckpointDelta', () => {
    it('should have all required fields', () => {
      const delta: CheckpointDelta = {
        sessionId: '123',
        checkpointIndex: 0,
        proofHash: '0xabc123def456',
        startToken: 0,
        endToken: 1000,
        messages: [
          { role: 'user', content: 'Hello', timestamp: Date.now() },
          { role: 'assistant', content: 'Hi there!', timestamp: Date.now() }
        ],
        hostSignature: '0xsig123'
      };

      expect(delta.sessionId).toBe('123');
      expect(delta.checkpointIndex).toBe(0);
      expect(delta.proofHash).toBe('0xabc123def456');
      expect(delta.startToken).toBe(0);
      expect(delta.endToken).toBe(1000);
      expect(delta.messages).toHaveLength(2);
      expect(delta.hostSignature).toBe('0xsig123');
    });

    it('should accept messages array with different roles', () => {
      const delta: CheckpointDelta = {
        sessionId: '456',
        checkpointIndex: 1,
        proofHash: '0x789',
        startToken: 1000,
        endToken: 2000,
        messages: [
          { role: 'system', content: 'You are helpful', timestamp: 1000 },
          { role: 'user', content: 'Question', timestamp: 2000 },
          { role: 'assistant', content: 'Answer', timestamp: 3000 }
        ],
        hostSignature: '0xsig456'
      };

      expect(delta.messages[0].role).toBe('system');
      expect(delta.messages[1].role).toBe('user');
      expect(delta.messages[2].role).toBe('assistant');
    });
  });

  describe('CheckpointIndexEntry', () => {
    it('should have all required fields', () => {
      const entry: CheckpointIndexEntry = {
        index: 0,
        proofHash: '0xproof123',
        deltaCID: 's5://bafybeig1234567890',
        tokenRange: [0, 1000],
        timestamp: 1704844800000
      };

      expect(entry.index).toBe(0);
      expect(entry.proofHash).toBe('0xproof123');
      expect(entry.deltaCID).toBe('s5://bafybeig1234567890');
      expect(entry.tokenRange).toEqual([0, 1000]);
      expect(entry.timestamp).toBe(1704844800000);
    });

    it('should have tokenRange as tuple of two numbers', () => {
      const entry: CheckpointIndexEntry = {
        index: 5,
        proofHash: '0xhash',
        deltaCID: 's5://cid',
        tokenRange: [5000, 6000],
        timestamp: Date.now()
      };

      expect(entry.tokenRange[0]).toBe(5000);
      expect(entry.tokenRange[1]).toBe(6000);
    });
  });

  describe('CheckpointIndex', () => {
    it('should have all required fields', () => {
      const index: CheckpointIndex = {
        sessionId: '123',
        hostAddress: '0xHost1234567890abcdef1234567890abcdef1234',
        checkpoints: [
          {
            index: 0,
            proofHash: '0xproof1',
            deltaCID: 's5://delta1',
            tokenRange: [0, 1000],
            timestamp: 1000
          },
          {
            index: 1,
            proofHash: '0xproof2',
            deltaCID: 's5://delta2',
            tokenRange: [1000, 2000],
            timestamp: 2000
          }
        ],
        hostSignature: '0xindexSig'
      };

      expect(index.sessionId).toBe('123');
      expect(index.hostAddress).toContain('0x');
      expect(index.checkpoints).toHaveLength(2);
      expect(index.hostSignature).toBe('0xindexSig');
    });

    it('should accept empty checkpoints array', () => {
      const index: CheckpointIndex = {
        sessionId: '789',
        hostAddress: '0xHost',
        checkpoints: [],
        hostSignature: '0xsig'
      };

      expect(index.checkpoints).toEqual([]);
    });
  });

  describe('RecoveredConversation', () => {
    it('should have all required fields', () => {
      const recovered: RecoveredConversation = {
        messages: [
          { role: 'user', content: 'Hello', timestamp: 1000 },
          { role: 'assistant', content: 'Hi!', timestamp: 2000 }
        ],
        tokenCount: 2000,
        checkpoints: [
          {
            index: 0,
            proofHash: '0xproof',
            deltaCID: 's5://delta',
            tokenRange: [0, 1000],
            timestamp: 1000
          }
        ]
      };

      expect(recovered.messages).toHaveLength(2);
      expect(recovered.tokenCount).toBe(2000);
      expect(recovered.checkpoints).toHaveLength(1);
    });

    it('should work with empty recovery', () => {
      const empty: RecoveredConversation = {
        messages: [],
        tokenCount: 0,
        checkpoints: []
      };

      expect(empty.messages).toEqual([]);
      expect(empty.tokenCount).toBe(0);
      expect(empty.checkpoints).toEqual([]);
    });
  });
});

describe('ISessionManager Interface Extension', () => {
  describe('recoverFromCheckpoints method', () => {
    it('should include recoverFromCheckpoints method in interface', () => {
      // This test verifies the method exists in the interface
      // by creating a mock that satisfies the interface
      const mockSessionManager: Pick<ISessionManager, 'recoverFromCheckpoints'> = {
        recoverFromCheckpoints: async (sessionId: bigint): Promise<RecoveredConversation> => {
          return {
            messages: [],
            tokenCount: 0,
            checkpoints: []
          };
        }
      };

      expect(mockSessionManager.recoverFromCheckpoints).toBeDefined();
      expect(typeof mockSessionManager.recoverFromCheckpoints).toBe('function');
    });

    it('should have correct method signature: (sessionId: bigint) => Promise<RecoveredConversation>', async () => {
      // Create a mock implementation that matches the expected signature
      const mockRecoverFromCheckpoints = async (sessionId: bigint): Promise<RecoveredConversation> => {
        // Verify sessionId is bigint
        expect(typeof sessionId).toBe('bigint');

        return {
          messages: [
            { role: 'user', content: 'Hello', timestamp: 1000 },
            { role: 'assistant', content: 'Hi!', timestamp: 2000 }
          ],
          tokenCount: 1000,
          checkpoints: [
            {
              index: 0,
              proofHash: '0xproof',
              deltaCID: 's5://delta',
              tokenRange: [0, 1000],
              timestamp: 1000
            }
          ]
        };
      };

      // Call with bigint and verify return type
      const result = await mockRecoverFromCheckpoints(123n);

      expect(result.messages).toHaveLength(2);
      expect(result.tokenCount).toBe(1000);
      expect(result.checkpoints).toHaveLength(1);
    });
  });
});
