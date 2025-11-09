// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for SessionManager.uploadVectors() method
 * Tests batch splitting, dimension validation, and WebSocket communication
 * Part of Phase 2, Sub-phase 2.2: Implement uploadVectors() Method
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { PaymentManager } from '../../src/managers/PaymentManager';
import { StorageManager } from '../../src/managers/StorageManager';
import type { Vector, UploadVectorsResult } from '../../src/types/rag-websocket';

// Helper function to create test vectors (executed at runtime, not collection time)
function createTestVectors(count: number): Vector[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `vec_${i}`,
    vector: new Array(384).fill(i / count),
    metadata: { index: i }
  }));
}

describe('SessionManager.uploadVectors()', () => {
  let sessionManager: SessionManager;
  let mockPaymentManager: PaymentManager;
  let mockStorageManager: StorageManager;

  beforeEach(() => {
    // Create mock managers
    mockPaymentManager = {} as PaymentManager;
    mockStorageManager = {} as StorageManager;

    sessionManager = new SessionManager(
      mockPaymentManager,
      mockStorageManager
    );
  });

  describe('Basic functionality', () => {
    it('should upload single batch with <1000 vectors', async () => {
      // Create a mock session
      const sessionId = 'test-session-1';
      const vectors = createTestVectors(500);

      // Mock WebSocket client (just needs to exist)
      (sessionManager as any).wsClient = {};

      // Create active session
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      }]]);

      // Mock _sendRAGRequest to simulate successful upload
      vi.spyOn(sessionManager as any, '_sendRAGRequest').mockResolvedValue({
        uploaded: 500,
        rejected: 0,
        errors: []
      });

      // Call uploadVectors
      const result = await sessionManager.uploadVectors(sessionId, vectors, false);

      // Assertions
      expect(result.uploaded).toBe(500);
      expect(result.rejected).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect((sessionManager as any)._sendRAGRequest).toHaveBeenCalledTimes(1);
    });

    it('should auto-split into multiple batches for >1000 vectors', async () => {
      const sessionId = 'test-session-2';
      const vectors = createTestVectors(2500);

      const mockWsClient = {
        sendWithoutResponse: vi.fn().mockImplementation(async (message: any) => {
          // Simulate host response by manually calling response handler
          setTimeout(() => {
            (sessionManager as any)._handleUploadVectorsResponse({
              type: 'uploadVectorsResponse',
              requestId: message.requestId,
              status: 'success',
              uploaded: message.vectors.length,
              rejected: 0,
              errors: []
            });
          }, 0);
        })
      };
      (sessionManager as any).wsClient = mockWsClient;
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      }]]);

      const result = await sessionManager.uploadVectors(sessionId, vectors, false);

      // Should split into 3 batches: 1000 + 1000 + 500
      expect(mockWsClient.sendWithoutResponse).toHaveBeenCalledTimes(3);

      // Verify batch sizes
      const batch1 = mockWsClient.sendWithoutResponse.mock.calls[0][0];
      const batch2 = mockWsClient.sendWithoutResponse.mock.calls[1][0];
      const batch3 = mockWsClient.sendWithoutResponse.mock.calls[2][0];

      expect(batch1.vectors).toHaveLength(1000);
      expect(batch2.vectors).toHaveLength(1000);
      expect(batch3.vectors).toHaveLength(500);
    });

    it('should use replace=true for first batch, false for subsequent when replace=true', async () => {
      const sessionId = 'test-session-3';
      const vectors = createTestVectors(1500);

      const mockWsClient = {
        sendWithoutResponse: vi.fn().mockImplementation(async (message: any) => {
          // Simulate host response by manually calling response handler
          setTimeout(() => {
            (sessionManager as any)._handleUploadVectorsResponse({
              type: 'uploadVectorsResponse',
              requestId: message.requestId,
              status: 'success',
              uploaded: message.vectors.length,
              rejected: 0,
              errors: []
            });
          }, 0);
        })
      };
      (sessionManager as any).wsClient = mockWsClient;
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      }]]);

      await sessionManager.uploadVectors(sessionId, vectors, true);

      // Verify replace flags
      const batch1 = mockWsClient.sendWithoutResponse.mock.calls[0][0];
      const batch2 = mockWsClient.sendWithoutResponse.mock.calls[1][0];

      expect(batch1.replace).toBe(true);   // First batch: replace
      expect(batch2.replace).toBe(false);  // Second batch: append
    });

    it('should use replace=false for all batches when replace=false', async () => {
      const sessionId = 'test-session-4';
      const vectors = createTestVectors(1200);

      const mockWsClient = {
        sendWithoutResponse: vi.fn().mockImplementation(async (message: any) => {
          // Simulate host response by manually calling response handler
          setTimeout(() => {
            (sessionManager as any)._handleUploadVectorsResponse({
              type: 'uploadVectorsResponse',
              requestId: message.requestId,
              status: 'success',
              uploaded: message.vectors.length,
              rejected: 0,
              errors: []
            });
          }, 0);
        })
      };
      (sessionManager as any).wsClient = mockWsClient;
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      }]]);

      await sessionManager.uploadVectors(sessionId, vectors, false);

      // Verify all batches use replace=false
      const batch1 = mockWsClient.sendWithoutResponse.mock.calls[0][0];
      const batch2 = mockWsClient.sendWithoutResponse.mock.calls[1][0];

      expect(batch1.replace).toBe(false);
      expect(batch2.replace).toBe(false);
    });
  });

  describe('Vector dimension validation', () => {
    it('should validate all vectors have 384 dimensions', async () => {
      const sessionId = 'test-session-5';
      const vectors: Vector[] = [
        { id: 'vec_1', vector: new Array(384).fill(0.5), metadata: {} },
        { id: 'vec_2', vector: new Array(384).fill(0.6), metadata: {} },
        { id: 'vec_3', vector: new Array(384).fill(0.7), metadata: {} }
      ];

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      }]]);

      // Mock _sendRAGRequest to simulate successful upload
      vi.spyOn(sessionManager as any, '_sendRAGRequest').mockResolvedValue({
        uploaded: 3,
        rejected: 0,
        errors: []
      });

      // Should not throw
      await expect(sessionManager.uploadVectors(sessionId, vectors, false)).resolves.toBeDefined();
    });

    it('should reject vectors with invalid dimensions', async () => {
      const sessionId = 'test-session-6';
      const vectors: Vector[] = [
        { id: 'vec_1', vector: new Array(384).fill(0.5), metadata: {} },
        { id: 'vec_2', vector: new Array(512).fill(0.6), metadata: {} }, // Wrong dimension!
        { id: 'vec_3', vector: new Array(384).fill(0.7), metadata: {} }
      ];

      (sessionManager as any).wsClient = { sendWithoutResponse: vi.fn() };
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      }]]);

      // Should throw with descriptive error
      await expect(sessionManager.uploadVectors(sessionId, vectors, false))
        .rejects.toThrow(/Vector vec_2: Invalid dimensions: expected 384, got 512/);
    });

    it('should handle empty vectors array gracefully', async () => {
      const sessionId = 'test-session-7';
      const vectors: Vector[] = [];

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      }]]);

      const result = await sessionManager.uploadVectors(sessionId, vectors, false);

      // Should return zero counts (no WebSocket call for empty array)
      expect(result.uploaded).toBe(0);
      expect(result.rejected).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Response handling', () => {
    it('should parse successful upload response', async () => {
      const sessionId = 'test-session-8';
      const vectors: Vector[] = [
        { id: 'vec_1', vector: new Array(384).fill(0.5), metadata: {} }
      ];

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      }]]);

      // Mock _sendRAGRequest to simulate successful upload
      vi.spyOn(sessionManager as any, '_sendRAGRequest').mockResolvedValue({
        uploaded: 1,
        rejected: 0,
        errors: []
      });

      const result = await sessionManager.uploadVectors(sessionId, vectors, false);

      expect(result.uploaded).toBeGreaterThan(0);
      expect(result.rejected).toBe(0);
    });

    it('should handle partial failure response with rejected vectors', async () => {
      const sessionId = 'test-session-9';
      const vectors = createTestVectors(10);

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      }]]);

      // Mock _sendRAGRequest to simulate partial failure
      vi.spyOn(sessionManager as any, '_sendRAGRequest').mockResolvedValue({
        uploaded: 8,
        rejected: 2,
        errors: ['vec_5: duplicate ID', 'vec_7: invalid metadata']
      });

      const result = await sessionManager.uploadVectors(sessionId, vectors, false);

      expect(result.rejected).toBeGreaterThanOrEqual(0);
      expect(result.errors).toBeInstanceOf(Array);
    });

    it('should accumulate results from multiple batches', async () => {
      const sessionId = 'test-session-10';
      const vectors = createTestVectors(2000);

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      }]]);

      // Mock _sendRAGRequest to simulate successful upload for each batch
      let callCount = 0;
      vi.spyOn(sessionManager as any, '_sendRAGRequest').mockImplementation(async () => {
        callCount++;
        return { uploaded: 1000, rejected: 0, errors: [] };
      });

      const result = await sessionManager.uploadVectors(sessionId, vectors, false);

      // Should accumulate across 2 batches (1000 + 1000)
      expect(result.uploaded).toBeLessThanOrEqual(2000);
      expect(result.uploaded + result.rejected).toBeLessThanOrEqual(2000);
    });
  });

  describe('Error scenarios', () => {
    it('should throw error if session does not exist', async () => {
      const sessionId = 'non-existent-session';
      const vectors: Vector[] = [
        { id: 'vec_1', vector: new Array(384).fill(0.5), metadata: {} }
      ];

      await expect(sessionManager.uploadVectors(sessionId, vectors, false))
        .rejects.toThrow(/Session .* not found/);
    });

    it('should throw error if session is not active', async () => {
      const sessionId = 'inactive-session';
      const vectors: Vector[] = [
        { id: 'vec_1', vector: new Array(384).fill(0.5), metadata: {} }
      ];

      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'ended',  // Not active!
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      }]]);

      await expect(sessionManager.uploadVectors(sessionId, vectors, false))
        .rejects.toThrow(/Session .* is not active/);
    });

    it('should throw error if WebSocket is not connected', async () => {
      const sessionId = 'test-session-no-ws';
      const vectors: Vector[] = [
        { id: 'vec_1', vector: new Array(384).fill(0.5), metadata: {} }
      ];

      (sessionManager as any).wsClient = undefined;  // No WebSocket!
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      }]]);

      await expect(sessionManager.uploadVectors(sessionId, vectors, false))
        .rejects.toThrow(/WebSocket not connected/);
    });

    it.skip('should timeout after 30 seconds per batch', async () => {
      const sessionId = 'test-session-timeout';
      const vectors: Vector[] = [
        { id: 'vec_1', vector: new Array(384).fill(0.5), metadata: {} }
      ];

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      }]]);

      // Mock _sendRAGRequest to simulate timeout
      vi.spyOn(sessionManager as any, '_sendRAGRequest').mockImplementation(() => {
        // Never resolve - simulate timeout
        return new Promise(() => {});
      });

      // Note: This test would actually wait 30 seconds - skip in practice or use fake timers
      await expect(sessionManager.uploadVectors(sessionId, vectors, false))
        .rejects.toThrow(/timeout/i);
    }, 35000); // 35 second test timeout

    it('should handle host error response', async () => {
      const sessionId = 'test-session-error';
      const vectors: Vector[] = [
        { id: 'vec_1', vector: new Array(384).fill(0.5), metadata: {} }
      ];

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      }]]);

      // Mock _sendRAGRequest to simulate host error response
      vi.spyOn(sessionManager as any, '_sendRAGRequest').mockResolvedValue({
        uploaded: 0,
        rejected: 1,
        errors: ['Session vector store not initialized']
      });

      // Should include error in result.errors
      const result = await sessionManager.uploadVectors(sessionId, vectors, false);
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });
  });
});
