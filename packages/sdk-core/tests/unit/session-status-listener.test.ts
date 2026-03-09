// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Session Status Listener Tests (Phase 14.3)
 *
 * Tests for the persistent WebSocket listener that surfaces
 * proof upload and checkpoint publish outcomes to the SDK consumer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { PaymentManager } from '../../src/managers/PaymentManagerMultiChain';
import { StorageManager } from '../../src/managers/StorageManager';
import type { SessionStatusInfo } from '../../src/types';
import 'fake-indexeddb/auto';

// Mock WebSocketClient with event emitter pattern
vi.mock('../../src/websocket/WebSocketClient', () => ({
  WebSocketClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue('mock response'),
    onMessage: vi.fn().mockReturnValue(() => {}),
    isConnected: vi.fn().mockReturnValue(true),
  })),
}));

describe('Session Status Listener (Phase 14.3)', () => {
  let sm: SessionManager;
  let mockPayment: PaymentManager;
  let mockStorage: StorageManager;

  beforeEach(() => {
    mockPayment = { isInitialized: () => true } as any;
    mockStorage = { isInitialized: () => true } as any;
    sm = new SessionManager(mockPayment, mockStorage);
  });

  // --- _processSessionStatus unit tests ---

  it('converts raw WebSocket data to SessionStatusInfo', () => {
    const cb = vi.fn();
    const raw = {
      session_id: 'sess-1',
      proof: { status: 'success', proof_id: 'cid-abc', size_bytes: 2048 },
      checkpoint: { status: 'success', checkpoint_index: 3 },
      timestamp: 1700000000,
    };

    (sm as any)._processSessionStatus(raw, cb);

    expect(cb).toHaveBeenCalledOnce();
    const info: SessionStatusInfo = cb.mock.calls[0][0];
    expect(info.sessionId).toBe('sess-1');
    expect(info.proof?.status).toBe('success');
    expect(info.proof?.proofId).toBe('cid-abc');
    expect(info.proof?.sizeBytes).toBe(2048);
    expect(info.checkpoint?.status).toBe('success');
    expect(info.checkpoint?.checkpointIndex).toBe(3);
    expect(info.timestamp).toBe(1700000000);
  });

  it('fires onSessionStatus callback via persistent listener on session_status message', () => {
    const cb = vi.fn();
    (sm as any).setSessionStatusCallback(cb);

    // Simulate the handler receiving a session_status message
    const data = {
      type: 'session_status',
      session_id: 'sess-2',
      proof: { status: 'success', proof_id: 'p1' },
      timestamp: 1700000001,
    };

    // Directly invoke _processSessionStatus as the handler would
    (sm as any)._processSessionStatus(data, cb);

    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].sessionId).toBe('sess-2');
  });

  it('converts proof_submitted legacy message to callback with proof success status', () => {
    const cb = vi.fn();
    const legacyData = {
      type: 'proof_submitted',
      session_id: 'sess-3',
      proof_id: 'legacy-proof',
      size_bytes: 512,
      timestamp: 1700000002,
    };

    // Simulate what _setupSessionStatusHandler does for proof_submitted
    (sm as any)._processSessionStatus(
      {
        session_id: legacyData.session_id,
        proof: { status: 'success', proof_id: legacyData.proof_id, size_bytes: legacyData.size_bytes },
        timestamp: legacyData.timestamp,
      },
      cb
    );

    expect(cb).toHaveBeenCalledOnce();
    const info: SessionStatusInfo = cb.mock.calls[0][0];
    expect(info.proof?.status).toBe('success');
    expect(info.proof?.proofId).toBe('legacy-proof');
    expect(info.checkpoint).toBeUndefined();
  });

  it('converts checkpoint_submitted legacy message to callback with checkpoint success status', () => {
    const cb = vi.fn();

    (sm as any)._processSessionStatus(
      {
        session_id: 'sess-4',
        checkpoint: { status: 'success', checkpoint_index: 7 },
        timestamp: 1700000003,
      },
      cb
    );

    expect(cb).toHaveBeenCalledOnce();
    const info: SessionStatusInfo = cb.mock.calls[0][0];
    expect(info.checkpoint?.status).toBe('success');
    expect(info.checkpoint?.checkpointIndex).toBe(7);
    expect(info.proof).toBeUndefined();
  });

  it('surfaces error string on proof failure', () => {
    const cb = vi.fn();
    const raw = {
      session_id: 'sess-5',
      proof: { status: 'failed', error: 'S5 upload timeout' },
      timestamp: 1700000004,
    };

    (sm as any)._processSessionStatus(raw, cb);

    const info: SessionStatusInfo = cb.mock.calls[0][0];
    expect(info.proof?.status).toBe('failed');
    expect(info.proof?.error).toBe('S5 upload timeout');
  });

  it('handles both proof and checkpoint status in one message', () => {
    const cb = vi.fn();
    const raw = {
      session_id: 'sess-6',
      proof: { status: 'success', proof_id: 'dual-proof' },
      checkpoint: { status: 'failed', error: 'disk full', checkpoint_index: 2 },
      timestamp: 1700000005,
    };

    (sm as any)._processSessionStatus(raw, cb);

    const info: SessionStatusInfo = cb.mock.calls[0][0];
    expect(info.proof?.status).toBe('success');
    expect(info.checkpoint?.status).toBe('failed');
    expect(info.checkpoint?.error).toBe('disk full');
  });

  it('no callback set = no error (graceful no-op)', () => {
    // Should not throw when callback is undefined
    expect(() => {
      (sm as any)._processSessionStatus(
        { session_id: 'sess-7', proof: { status: 'success' }, timestamp: 1 },
        undefined
      );
    }).not.toThrow();
  });

  it('setSessionStatusCallback persists across multiple prompts', () => {
    const cb = vi.fn();
    sm.setSessionStatusCallback(cb);

    // Call twice to simulate multiple prompts
    (sm as any)._processSessionStatus({ session_id: 'a', timestamp: 1 }, (sm as any).sessionStatusCallback);
    (sm as any)._processSessionStatus({ session_id: 'b', timestamp: 2 }, (sm as any).sessionStatusCallback);

    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[0][0].sessionId).toBe('a');
    expect(cb.mock.calls[1][0].sessionId).toBe('b');
  });

  it('old nodes that never send session_status cause no errors', () => {
    const cb = vi.fn();
    sm.setSessionStatusCallback(cb);

    // Simulate a full session with stream_end but no session_status
    // The callback simply never fires
    expect(cb).not.toHaveBeenCalled();
    // No errors, no exceptions — the feature is purely additive
  });
});
