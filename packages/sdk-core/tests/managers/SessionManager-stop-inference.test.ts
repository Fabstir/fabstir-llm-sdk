// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * SessionManager Stop Inference Tests
 *
 * Tests for AbortController/AbortSignal-based stop inference support.
 * Verifies: signal on PromptOptions, abort handling in encrypted + plaintext paths.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { SessionManager, SessionState } from '../../src/managers/SessionManager';
import { WebSocketClient } from '../../src/websocket/WebSocketClient';
import type { PromptOptions } from '../../src/types';
import 'fake-indexeddb/auto';

// Mock WebSocketClient
vi.mock('../../src/websocket/WebSocketClient', () => ({
  WebSocketClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue('mock response'),
    sendWithoutResponse: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn().mockReturnValue(() => {}),
    isConnected: vi.fn().mockReturnValue(true)
  }))
}));

/** Helper: create a minimal encrypted session state */
function makeSession(overrides?: Partial<SessionState>): SessionState {
  return {
    sessionId: 1n,
    jobId: 1n,
    chainId: 84532,
    model: 'test-model',
    provider: '0x1234567890abcdef1234567890abcdef12345678',
    endpoint: 'http://localhost:8080',
    status: 'active',
    prompts: [],
    responses: [],
    checkpoints: [],
    totalTokens: 0,
    startTime: Date.now(),
    encryption: true,
    ...overrides
  };
}

/** Helper: set up SessionManager with mocked internals for streaming tests */
function setupSessionManager(): {
  sm: SessionManager;
  ws: any;
  messageHandlers: Array<(data: any) => void>;
  unsubscribeFn: ReturnType<typeof vi.fn>;
} {
  const paymentManager = { signer: ethers.Wallet.createRandom() } as any;
  const storageManager = {
    appendMessage: vi.fn().mockResolvedValue(undefined),
    loadConversation: vi.fn().mockResolvedValue(null)
  } as any;
  const hostManager = {} as any;

  const sm = new SessionManager(paymentManager, storageManager, hostManager);
  (sm as any).initialized = true;

  // Set up session
  const session = makeSession();
  (sm as any).sessions.set('1', session);

  // Set up mock WS
  const ws = new WebSocketClient('ws://localhost:8080', { chainId: 84532 });
  (sm as any).wsClient = ws;
  (sm as any).wsSessionId = '1';

  // Set up session key (encrypted mode)
  (sm as any).sessionKey = crypto.getRandomValues(new Uint8Array(32));
  (sm as any).messageIndex = 0;

  // Capture onMessage handlers so tests can simulate incoming messages
  const messageHandlers: Array<(data: any) => void> = [];
  const unsubscribeFn = vi.fn();
  ws.onMessage = vi.fn().mockImplementation((handler: any) => {
    messageHandlers.push(handler);
    return unsubscribeFn;
  });

  // Mock sendEncryptedInit and sendPlaintextInit to skip WebSocket handshakes
  (sm as any).sendEncryptedInit = vi.fn().mockResolvedValue(undefined);
  (sm as any).sendPlaintextInit = vi.fn().mockResolvedValue(undefined);

  // Mock sendEncryptedMessage to just resolve (actual message sending)
  (sm as any).sendEncryptedMessage = vi.fn().mockResolvedValue(undefined);

  // Mock _setupRAGMessageHandlers and _setupWebSearchMessageHandlers
  (sm as any)._setupRAGMessageHandlers = vi.fn();
  (sm as any)._setupWebSearchMessageHandlers = vi.fn();

  // Mock image intent detection
  (sm as any).generateImage = vi.fn();

  return { sm, ws, messageHandlers, unsubscribeFn };
}

// ============= Phase 1.1: Type Tests =============

describe('Phase 1.1: AbortSignal on PromptOptions', () => {
  test('PromptOptions accepts optional signal field', () => {
    const ac = new AbortController();
    const opts: PromptOptions = { signal: ac.signal };
    expect(opts.signal).toBeDefined();
    expect(opts.signal!.aborted).toBe(false);
  });

  test('PromptOptions works without signal (backward compat)', () => {
    const opts: PromptOptions = {};
    expect(opts.signal).toBeUndefined();
  });
});

// ============= Phase 2.1: Encrypted Streaming Abort =============

describe('Phase 2.1: Encrypted Streaming Abort', () => {
  test('resolves with partial response when aborted mid-stream (encrypted)', async () => {
    const { sm, messageHandlers } = setupSessionManager();
    const ac = new AbortController();
    const tokens: string[] = [];

    const promise = sm.sendPromptStreaming(1n, 'Hello', (t) => tokens.push(t), { signal: ac.signal });

    // Wait for handler registration inside the Promise constructor
    await new Promise(r => setTimeout(r, 20));

    // Simulate 2 encrypted chunks arriving
    const handler = messageHandlers[messageHandlers.length - 1];
    await handler({ type: 'encrypted_chunk', payload: { ciphertextHex: 'aa' } });
    await handler({ type: 'encrypted_chunk', payload: { ciphertextHex: 'bb' } });

    // Abort mid-stream
    ac.abort();

    const result = await promise;
    // Should resolve (not reject) — partial response
    expect(typeof result).toBe('string');
  });

  test('sends stream_cancel message to node on abort', async () => {
    const { sm, ws, messageHandlers } = setupSessionManager();
    const ac = new AbortController();

    const promise = sm.sendPromptStreaming(1n, 'Hello', () => {}, { signal: ac.signal });

    // Let handler be registered
    await new Promise(r => setTimeout(r, 10));

    ac.abort();
    await promise;

    expect(ws.sendWithoutResponse).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'stream_cancel', reason: 'user_cancelled' })
    );
  });

  test('unsubscribes message handler on abort', async () => {
    const { sm, unsubscribeFn } = setupSessionManager();
    const ac = new AbortController();

    const promise = sm.sendPromptStreaming(1n, 'Hello', () => {}, { signal: ac.signal });
    await new Promise(r => setTimeout(r, 10));

    ac.abort();
    await promise;

    // safeResolve calls unsubscribe
    expect(unsubscribeFn).toHaveBeenCalled();
  });

  test('clears timeout on abort (no timeout error after)', async () => {
    const { sm } = setupSessionManager();
    const ac = new AbortController();

    const promise = sm.sendPromptStreaming(1n, 'Hello', () => {}, { signal: ac.signal });
    await new Promise(r => setTimeout(r, 10));

    ac.abort();
    const result = await promise;

    // If timeout wasn't cleared, this would reject. Wait a bit to be sure.
    await new Promise(r => setTimeout(r, 50));
    expect(typeof result).toBe('string');
  });

  test('resolves immediately if signal already aborted before call', async () => {
    const { sm } = setupSessionManager();
    const ac = new AbortController();
    ac.abort(); // abort BEFORE calling

    const result = await sm.sendPromptStreaming(1n, 'Hello', () => {}, { signal: ac.signal });
    expect(result).toBe('');
  });

  test('keeps WebSocket connection alive after abort', async () => {
    const { sm, ws } = setupSessionManager();
    const ac = new AbortController();

    const promise = sm.sendPromptStreaming(1n, 'Hello', () => {}, { signal: ac.signal });
    await new Promise(r => setTimeout(r, 10));

    ac.abort();
    await promise;

    expect(ws.disconnect).not.toHaveBeenCalled();
  });

  test('calls onToken for tokens before abort, not after', async () => {
    const { sm, messageHandlers } = setupSessionManager();
    const ac = new AbortController();
    const tokens: string[] = [];

    // Mock decryptIncomingMessage to return predictable text
    (sm as any).decryptIncomingMessage = vi.fn()
      .mockResolvedValueOnce('chunk1')
      .mockResolvedValueOnce('chunk2')
      .mockResolvedValueOnce('chunk3');

    const promise = sm.sendPromptStreaming(1n, 'Hello', (t) => tokens.push(t), { signal: ac.signal });

    // Wait for handler registration
    await new Promise(r => setTimeout(r, 20));
    const handler = messageHandlers[messageHandlers.length - 1];

    // Send 2 chunks before abort
    await handler({ type: 'encrypted_chunk', payload: { ciphertextHex: 'aa' } });
    await handler({ type: 'encrypted_chunk', payload: { ciphertextHex: 'bb' } });

    ac.abort();
    await promise;

    // Tokens before abort should be captured
    expect(tokens.length).toBe(2);
    expect(tokens).toEqual(['chunk1', 'chunk2']);
  });

  test('does not throw if stream_cancel send fails', async () => {
    const { sm, ws } = setupSessionManager();
    const ac = new AbortController();

    // Make sendWithoutResponse reject
    ws.sendWithoutResponse = vi.fn().mockRejectedValue(new Error('WS closed'));

    const promise = sm.sendPromptStreaming(1n, 'Hello', () => {}, { signal: ac.signal });
    await new Promise(r => setTimeout(r, 10));

    ac.abort();

    // Should still resolve, not throw
    const result = await promise;
    expect(typeof result).toBe('string');
  });
});

// ============= Phase 2.2: Plaintext Streaming Abort =============

describe('Phase 2.2: Plaintext Streaming Abort', () => {
  test('resolves with partial response when aborted mid-stream (plaintext)', async () => {
    const { sm, ws, messageHandlers, unsubscribeFn } = setupSessionManager();
    const ac = new AbortController();
    const tokens: string[] = [];

    // Set session to plaintext (encryption: false)
    const session = (sm as any).sessions.get('1');
    session.encryption = false;

    // Make sendMessage hang (simulates a long-running plaintext response)
    let resolveSendMessage: (v: string) => void;
    ws.sendMessage = vi.fn().mockReturnValue(new Promise<string>((res) => {
      resolveSendMessage = res;
    }));

    const promise = sm.sendPromptStreaming(1n, 'Hello', (t) => tokens.push(t), { signal: ac.signal });

    // Wait for handler registration
    await new Promise(r => setTimeout(r, 20));

    // Simulate plaintext chunks arriving via onMessage handler
    const handler = messageHandlers[messageHandlers.length - 1];
    await handler({ type: 'stream_chunk', content: 'partial1' });
    await handler({ type: 'stream_chunk', content: 'partial2' });

    // Abort mid-stream
    ac.abort();

    const result = await promise;
    expect(result).toContain('partial1');
    expect(result).toContain('partial2');
    expect(tokens).toEqual(['partial1', 'partial2']);
  });
});
