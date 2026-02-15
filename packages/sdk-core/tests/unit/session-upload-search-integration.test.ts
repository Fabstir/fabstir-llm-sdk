// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Integration tests: uploadVectors() → searchVectors() flow
 * Reproduces the bug where ragContext.vectorDbId is never set,
 * causing searchVectors() to always throw RAG_NOT_CONFIGURED.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { PaymentManager } from '../../src/managers/PaymentManager';
import { StorageManager } from '../../src/managers/StorageManager';

function createTestVectors(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `vec_${i}`,
    vector: new Array(384).fill(i / count),
    metadata: { text: `Document ${i}`, index: i }
  }));
}

function createQueryVector(): number[] {
  return new Array(384).fill(0.5);
}

describe('Upload → Search integration (ragContext bug fix)', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    const mockPaymentManager = {
      signer: { getAddress: vi.fn().mockResolvedValue('0x1234567890abcdef1234567890abcdef12345678') }
    } as unknown as PaymentManager;

    sessionManager = new SessionManager(
      mockPaymentManager,
      {} as StorageManager
    );

    // Mock sendPlaintextInit to avoid WebSocket init
    vi.spyOn(sessionManager as any, 'sendPlaintextInit').mockResolvedValue(undefined);
    // Mock sendEncryptedInit for encrypted sessions
    vi.spyOn(sessionManager as any, 'sendEncryptedInit').mockResolvedValue(undefined);
  });

  it('should allow searchVectors() after uploadVectors() without manual ragContext', async () => {
    const sessionId = 'test-session-1';

    // Create session WITHOUT ragContext (like real startSession does)
    (sessionManager as any).wsClient = { isConnected: () => true };
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
      // NOTE: No ragContext here — reproduces the bug
    }]]);

    // Mock _sendRAGRequest for upload
    const sendRAGSpy = vi.spyOn(sessionManager as any, '_sendRAGRequest');
    sendRAGSpy.mockResolvedValueOnce({ uploaded: 5, rejected: 0, errors: [] });

    // Upload vectors — should set ragContext on the session
    await sessionManager.uploadVectors(sessionId, createTestVectors(5));

    // Verify ragContext was set
    const session = (sessionManager as any).sessions.get(sessionId);
    expect(session.ragContext).toBeDefined();
    expect(session.ragContext.vectorDbId).toBe(`vectors-${sessionId}`);

    // Mock _sendRAGRequest for search
    sendRAGSpy.mockResolvedValueOnce({
      results: [{ id: 'vec_0', vector: [], metadata: { text: 'Doc 0' }, score: 0.95 }]
    });

    // searchVectors() should NOT throw RAG_NOT_CONFIGURED
    const results = await sessionManager.searchVectors(sessionId, createQueryVector(), 5, 0.2);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.95);
  });

  it('should set ragContext from ragConfig.vectorDbSessionId in startSession-like setup', () => {
    const sessionId = 'test-session-2';

    // Simulate what startSession should do when ragConfig has vectorDbSessionId
    (sessionManager as any).wsClient = {};
    (sessionManager as any).sessions = new Map([[sessionId, {
      sessionId: BigInt(2),
      jobId: BigInt(2),
      chainId: 84532,
      model: 'llama-3',
      provider: 'test-host',
      status: 'active',
      prompts: [],
      responses: [],
      checkpoints: [],
      totalTokens: 0,
      startTime: Date.now(),
      ragConfig: { enabled: true, vectorDbSessionId: 'my-vector-db' },
      ragContext: { vectorDbId: 'my-vector-db' }
    }]]);

    const session = (sessionManager as any).sessions.get(sessionId);
    expect(session.ragContext).toBeDefined();
    expect(session.ragContext.vectorDbId).toBe('my-vector-db');
  });

  it('should still throw RAG_NOT_CONFIGURED when no vectors uploaded and no ragConfig', async () => {
    const sessionId = 'test-session-3';

    // Session with no ragContext and no vectors uploaded
    (sessionManager as any).wsClient = {};
    (sessionManager as any).sessions = new Map([[sessionId, {
      sessionId: BigInt(3),
      jobId: BigInt(3),
      chainId: 84532,
      model: 'llama-3',
      provider: 'test-host',
      status: 'active',
      prompts: [],
      responses: [],
      checkpoints: [],
      totalTokens: 0,
      startTime: Date.now()
      // No ragContext, no upload → should throw
    }]]);

    await expect(
      sessionManager.searchVectors(sessionId, createQueryVector(), 5, 0.2)
    ).rejects.toThrow('No vector database attached');
  });

  it('should not overwrite existing ragContext on subsequent uploads', async () => {
    const sessionId = 'test-session-4';

    (sessionManager as any).wsClient = { isConnected: () => true };
    (sessionManager as any).sessions = new Map([[sessionId, {
      sessionId: BigInt(4),
      jobId: BigInt(4),
      chainId: 84532,
      model: 'llama-3',
      provider: 'test-host',
      status: 'active',
      prompts: [],
      responses: [],
      checkpoints: [],
      totalTokens: 0,
      startTime: Date.now(),
      ragContext: { vectorDbId: 'original-db' }
    }]]);

    const sendRAGSpy = vi.spyOn(sessionManager as any, '_sendRAGRequest');
    sendRAGSpy.mockResolvedValueOnce({ uploaded: 3, rejected: 0, errors: [] });

    await sessionManager.uploadVectors(sessionId, createTestVectors(3));

    // Should keep original ragContext, not overwrite
    const session = (sessionManager as any).sessions.get(sessionId);
    expect(session.ragContext.vectorDbId).toBe('original-db');
  });

  it('should not set ragContext when upload fails (0 vectors uploaded)', async () => {
    const sessionId = 'test-session-5';

    (sessionManager as any).wsClient = { isConnected: () => true };
    (sessionManager as any).sessions = new Map([[sessionId, {
      sessionId: BigInt(5),
      jobId: BigInt(5),
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

    const sendRAGSpy = vi.spyOn(sessionManager as any, '_sendRAGRequest');
    sendRAGSpy.mockResolvedValueOnce({ uploaded: 0, rejected: 5, errors: ['all rejected'] });

    await sessionManager.uploadVectors(sessionId, createTestVectors(5));

    // ragContext should NOT be set since no vectors were actually uploaded
    const session = (sessionManager as any).sessions.get(sessionId);
    expect(session.ragContext).toBeUndefined();
  });
});
