// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * SessionManager VLM Token Display Tests
 *
 * Tests for Phase 5: VLM token tracking from stream_end messages.
 * Node v8.15.4+ sends vlm_tokens in stream_end when images were processed.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import type { TokenUsageInfo, PromptOptions } from '../../src/types/index';
import { SessionManager } from '../../src/managers/SessionManager';

/**
 * Helper: create a SessionManager with mocks suitable for encrypted streaming tests.
 * Returns { sessionManager, getSession } so tests can inspect session state.
 */
function createMockedSessionManager(opts: { encryption?: boolean } = {}) {
  const encryption = opts.encryption !== false;

  const mockPaymentManager = {
    initialize: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(true),
    signer: {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      getAddress: vi.fn().mockResolvedValue('0x1234567890abcdef1234567890abcdef12345678'),
    },
  } as any;

  const mockStorageManager = {
    initialize: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(true),
    appendMessage: vi.fn().mockResolvedValue(undefined),
    loadConversation: vi.fn().mockResolvedValue(null),
  } as any;

  const mockHostManager = {
    getHostPublicKey: vi.fn().mockResolvedValue('02' + 'ab'.repeat(32)),
    getHostInfo: vi.fn().mockResolvedValue({ address: '0xhost', apiUrl: 'http://localhost:8080' }),
  } as any;

  const sm = new SessionManager(mockPaymentManager, mockStorageManager, mockHostManager);
  (sm as any).initialized = true;

  // Mock encryption manager
  (sm as any).encryptionManager = {
    encryptMessage: vi.fn().mockReturnValue({ ciphertextHex: 'enc', nonceHex: 'n', aadHex: 'a' }),
    encryptSessionKey: vi.fn().mockReturnValue('enc-key'),
    getRecoveryPublicKey: vi.fn().mockReturnValue('04' + 'cd'.repeat(32)),
  };

  // Mock session key and decryption
  (sm as any).sessionKey = new Uint8Array(32);
  (sm as any).messageIndex = 0;
  (sm as any).decryptIncomingMessage = vi.fn().mockImplementation((data: any) => {
    // Return a single token's worth of text per chunk
    return data._mockContent || 'tok';
  });

  // Mock WebSocket — handler capture pattern
  let registeredHandlers: Array<(data: any) => void> = [];
  (sm as any).wsClient = {
    sendWithoutResponse: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue('response text'),
    onMessage: vi.fn().mockImplementation((handler: any) => {
      registeredHandlers.push(handler);
      return () => { registeredHandlers = registeredHandlers.filter(h => h !== handler); };
    }),
    isConnected: vi.fn().mockReturnValue(true),
  };

  // Helper to emit message to all registered handlers
  const emit = (data: any) => {
    registeredHandlers.forEach(h => h(data));
  };

  // Session state
  const sessionState = {
    sessionId: BigInt(42),
    jobId: BigInt(100),
    chainId: 84532,
    model: 'CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf',
    provider: 'test-host',
    status: 'active' as const,
    prompts: [] as string[],
    responses: [] as string[],
    checkpoints: [],
    totalTokens: 0,
    startTime: Date.now(),
    encryption,
  };
  (sm as any).sessions.set('42', sessionState);

  // Mock init methods
  (sm as any).sendEncryptedInit = vi.fn().mockResolvedValue(undefined);
  (sm as any).sendPlaintextInit = vi.fn().mockResolvedValue(undefined);

  const getSession = () => (sm as any).sessions.get('42');

  return { sessionManager: sm, emit, getSession };
}

// ============= Sub-phase 5.1: TokenUsageInfo Type & PromptOptions Extension =============

describe('Sub-phase 5.1: TokenUsageInfo Type & PromptOptions Extension', () => {
  test('TokenUsageInfo has llmTokens, vlmTokens, totalTokens number fields', () => {
    const usage: TokenUsageInfo = {
      llmTokens: 130,
      vlmTokens: 2873,
      imageGenTokens: 0,
      totalTokens: 3003,
    };
    expect(usage.llmTokens).toBe(130);
    expect(usage.vlmTokens).toBe(2873);
    expect(usage.imageGenTokens).toBe(0);
    expect(usage.totalTokens).toBe(3003);
  });

  test('PromptOptions.onTokenUsage is optional callback accepting TokenUsageInfo', () => {
    // Without onTokenUsage — backward compatible
    const opts1: PromptOptions = {};
    expect(opts1.onTokenUsage).toBeUndefined();

    // With onTokenUsage callback
    let captured: TokenUsageInfo | undefined;
    const opts2: PromptOptions = {
      onTokenUsage: (usage) => { captured = usage; },
    };
    opts2.onTokenUsage!({ llmTokens: 10, vlmTokens: 0, totalTokens: 10 });
    expect(captured).toEqual({ llmTokens: 10, vlmTokens: 0, totalTokens: 10 });
  });
});

// ============= Sub-phase 5.2: Encrypted Streaming VLM Token Capture =============

describe('Sub-phase 5.2: Encrypted Streaming — VLM Token Capture', () => {
  test('onTokenUsage called with vlm_tokens from stream_end', async () => {
    const { sessionManager, emit } = createMockedSessionManager({ encryption: true });
    let captured: TokenUsageInfo | undefined;

    const resultPromise = sessionManager.sendPromptStreaming(
      BigInt(42), 'Describe image',
      (token) => {}, // onToken — routes to streaming path
      { onTokenUsage: (usage) => { captured = usage; } }
    );

    // Simulate 3 encrypted chunks then stream_end with vlm_tokens
    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hello' });
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'b' }, _mockContent: ' world' });
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'c' }, _mockContent: '!' });
    emit({ type: 'stream_end', vlm_tokens: 2873 });

    await resultPromise;
    expect(captured).toBeDefined();
    expect(captured!.vlmTokens).toBe(2873);
    expect(captured!.llmTokens).toBe(3); // 3 chunks
    expect(captured!.totalTokens).toBe(2876); // 3 + 2873
  });

  test('llmTokens equals chunk count when tokens_used absent in stream_end', async () => {
    const { sessionManager, emit } = createMockedSessionManager({ encryption: true });
    let captured: TokenUsageInfo | undefined;

    const resultPromise = sessionManager.sendPromptStreaming(
      BigInt(42), 'Hello',
      (token) => {},
      { onTokenUsage: (usage) => { captured = usage; } }
    );

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'b' }, _mockContent: '!' });
    emit({ type: 'stream_end' }); // No vlm_tokens, no tokens_used

    await resultPromise;
    expect(captured).toBeDefined();
    expect(captured!.llmTokens).toBe(2); // 2 chunks
    expect(captured!.vlmTokens).toBe(0);
    expect(captured!.totalTokens).toBe(2);
  });

  test('session.totalTokens updated after prompt', async () => {
    const { sessionManager, emit, getSession } = createMockedSessionManager({ encryption: true });

    expect(getSession().totalTokens).toBe(0);

    const resultPromise = sessionManager.sendPromptStreaming(
      BigInt(42), 'Hello',
      (token) => {},
      { onTokenUsage: () => {} }
    );

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    emit({ type: 'stream_end', vlm_tokens: 100 });

    await resultPromise;
    expect(getSession().totalTokens).toBe(101); // 1 chunk + 100 vlm
  });

  test('data.final defers resolution until stream_end with token data', async () => {
    // Real node protocol for encrypted streaming:
    // 1. encrypted_chunk (final=true) — content complete
    // 2. encrypted_response — finish_reason (SDK does NOT resolve here)
    // 3. stream_end { vlm_tokens } — token data (SDK resolves here)
    const { sessionManager, emit } = createMockedSessionManager({ encryption: true });
    let captured: TokenUsageInfo | undefined;

    const resultPromise = sessionManager.sendPromptStreaming(
      BigInt(42), 'Describe image',
      (token) => {},
      { onTokenUsage: (usage) => { captured = usage; } }
    );

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hello' });
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'b' }, _mockContent: ' world' });
    // Final chunk — content complete, but promise should NOT resolve yet
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'c' }, _mockContent: '!', final: true });
    // encrypted_response — finish_reason, SDK should NOT resolve here either
    emit({ type: 'encrypted_response', payload: { ciphertextHex: 'finish' } });
    // stream_end arrives with token data — NOW the promise should resolve
    emit({ type: 'stream_end', vlm_tokens: 2873, tokens_used: 130 });

    const result = await resultPromise;
    expect(result).toBe('Hello world!');
    // Token data is available synchronously after promise resolves
    expect(captured).toBeDefined();
    expect(captured!.llmTokens).toBe(130);
    expect(captured!.vlmTokens).toBe(2873);
    expect(captured!.totalTokens).toBe(3003);
  });

  test('data.final resolves via safety timeout if stream_end never arrives', async () => {
    // For older nodes that do not send stream_end, safety timeout resolves after 3s
    const { sessionManager, emit } = createMockedSessionManager({ encryption: true });

    const resultPromise = sessionManager.sendPromptStreaming(
      BigInt(42), 'Hello',
      (token) => {}
    );

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'b' }, _mockContent: '!', final: true });
    emit({ type: 'encrypted_response', payload: { ciphertextHex: 'finish' } });
    // No stream_end — safety timeout will fire after 3s

    // Fast-forward timers
    await vi.waitFor(async () => {
      const result = await resultPromise;
      expect(result).toBe('Hi!');
    }, { timeout: 5000 });
  });

  test('encrypted_response does NOT resolve promise — waits for stream_end', async () => {
    // Regression test: encrypted_response used to call safeResolve(),
    // consuming the promise before stream_end could deliver vlm_tokens.
    const { sessionManager, emit } = createMockedSessionManager({ encryption: true });
    let captured: TokenUsageInfo | undefined;
    let resolved = false;

    const resultPromise = sessionManager.sendPromptStreaming(
      BigInt(42), 'Describe image',
      (token) => {},
      { onTokenUsage: (usage) => { captured = usage; } }
    );
    resultPromise.then(() => { resolved = true; });

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hello', final: true });
    emit({ type: 'encrypted_response', payload: { ciphertextHex: 'stop' } });

    // After encrypted_response, promise should NOT be resolved yet
    await new Promise(r => setTimeout(r, 50));
    expect(resolved).toBe(false);

    // stream_end resolves it
    emit({ type: 'stream_end', vlm_tokens: 500, tokens_used: 10 });
    const result = await resultPromise;
    expect(result).toBe('Hello');
    expect(captured).toBeDefined();
    expect(captured!.vlmTokens).toBe(500);
  });

  test('no onTokenUsage provided — no error (backward compat)', async () => {
    const { sessionManager, emit } = createMockedSessionManager({ encryption: true });

    const resultPromise = sessionManager.sendPromptStreaming(
      BigInt(42), 'Hello',
      (token) => {} // onToken, but no options.onTokenUsage
    );

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    emit({ type: 'stream_end', vlm_tokens: 50 });

    // Should resolve without error
    const result = await resultPromise;
    expect(result).toBe('Hi');
  });
});

// ============= Sub-phase 5.3: Plaintext Streaming VLM Token Capture =============

describe('Sub-phase 5.3: Plaintext Streaming — VLM Token Capture', () => {
  test('onTokenUsage called with vlm_tokens from stream_end', async () => {
    const { sessionManager, emit } = createMockedSessionManager({ encryption: false });
    let captured: TokenUsageInfo | undefined;

    // Plaintext streaming: onToken provided, encryption=false
    // Note: sendMessage in wsClient needs to resolve on stream_end
    const wsClient = (sessionManager as any).wsClient;
    wsClient.sendMessage = vi.fn().mockImplementation(() => {
      // Simulate: sendMessage resolves when stream_end arrives (after our emit)
      return new Promise(resolve => {
        setTimeout(() => {
          emit({ type: 'stream_chunk', content: 'Hello' });
          emit({ type: 'stream_chunk', content: ' world' });
          emit({ type: 'stream_end', vlm_tokens: 1000 });
          resolve('Hello world');
        }, 20);
      });
    });

    const result = await sessionManager.sendPromptStreaming(
      BigInt(42), 'Describe',
      (token) => {},
      { onTokenUsage: (usage) => { captured = usage; } }
    );

    expect(captured).toBeDefined();
    expect(captured!.vlmTokens).toBe(1000);
    expect(captured!.llmTokens).toBe(2); // 2 stream_chunks
    expect(captured!.totalTokens).toBe(1002);
  });

  test('chunk count used as llmTokens for plaintext streaming', async () => {
    const { sessionManager, emit } = createMockedSessionManager({ encryption: false });
    let captured: TokenUsageInfo | undefined;

    const wsClient = (sessionManager as any).wsClient;
    wsClient.sendMessage = vi.fn().mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => {
          emit({ type: 'stream_chunk', content: 'A' });
          emit({ type: 'stream_chunk', content: 'B' });
          emit({ type: 'stream_chunk', content: 'C' });
          emit({ type: 'stream_chunk', content: 'D' });
          emit({ type: 'stream_chunk', content: 'E' });
          emit({ type: 'stream_end' }); // no vlm_tokens
          resolve('ABCDE');
        }, 20);
      });
    });

    await sessionManager.sendPromptStreaming(
      BigInt(42), 'Hello',
      (token) => {},
      { onTokenUsage: (usage) => { captured = usage; } }
    );

    expect(captured).toBeDefined();
    expect(captured!.llmTokens).toBe(5); // 5 chunks
    expect(captured!.vlmTokens).toBe(0);
    expect(captured!.totalTokens).toBe(5);
  });
});

// ============= Sub-phase 5.4: Non-Streaming VLM Token Capture =============

describe('Sub-phase 5.4: Non-Streaming — VLM Token Capture', () => {
  test('encrypted non-streaming: onTokenUsage called from stream_end', async () => {
    const { sessionManager, emit } = createMockedSessionManager({ encryption: true });
    let captured: TokenUsageInfo | undefined;

    // No onToken → non-streaming path; encryption=true → encrypted non-streaming
    const resultPromise = sessionManager.sendPromptStreaming(
      BigInt(42), 'Describe image',
      undefined, // no onToken → non-streaming
      { onTokenUsage: (usage) => { captured = usage; } }
    );

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hello' });
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'b' }, _mockContent: ' world' });
    emit({ type: 'stream_end', vlm_tokens: 500, tokens_used: 42 });

    await resultPromise;
    expect(captured).toBeDefined();
    expect(captured!.llmTokens).toBe(42); // tokens_used from stream_end takes precedence
    expect(captured!.vlmTokens).toBe(500);
    expect(captured!.totalTokens).toBe(542);
  });

  test('plaintext non-streaming: onTokenUsage called with tokens_used from response', async () => {
    const { sessionManager, emit } = createMockedSessionManager({ encryption: false });
    let captured: TokenUsageInfo | undefined;

    const wsClient = (sessionManager as any).wsClient;
    // For non-streaming plaintext, sendMessage resolves with text
    // We need the onMessage handler to capture token data from the response
    wsClient.sendMessage = vi.fn().mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => {
          // The WebSocket broadcasts 'response' to all handlers before sendMessage resolves
          emit({ type: 'response', content: 'Machine learning is...', tokens_used: 45, vlm_tokens: 200 });
          resolve('Machine learning is...');
        }, 20);
      });
    });

    const result = await sessionManager.sendPromptStreaming(
      BigInt(42), 'Explain ML',
      undefined, // no onToken → non-streaming
      { onTokenUsage: (usage) => { captured = usage; } }
    );

    expect(captured).toBeDefined();
    expect(captured!.llmTokens).toBe(45);
    expect(captured!.vlmTokens).toBe(200);
    expect(captured!.totalTokens).toBe(245);
  });

  test('session.totalTokens accumulates across multiple prompts', async () => {
    const { sessionManager, emit, getSession } = createMockedSessionManager({ encryption: true });

    // First prompt
    const p1 = sessionManager.sendPromptStreaming(
      BigInt(42), 'Hello',
      (token) => {},
      { onTokenUsage: () => {} }
    );
    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    emit({ type: 'stream_end', vlm_tokens: 100 });
    await p1;

    expect(getSession().totalTokens).toBe(101); // 1 chunk + 100 vlm

    // Second prompt
    const p2 = sessionManager.sendPromptStreaming(
      BigInt(42), 'More',
      (token) => {},
      { onTokenUsage: () => {} }
    );
    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'b' }, _mockContent: 'Ok' });
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'c' }, _mockContent: '!' });
    emit({ type: 'stream_end' }); // no vlm
    await p2;

    expect(getSession().totalTokens).toBe(103); // 101 + 2 chunks
  });
});

// ============= Sub-phase 5.5: getLastTokenUsage() Getter =============

describe('Sub-phase 5.5: getLastTokenUsage() Getter', () => {
  test('returns undefined before any prompt', () => {
    const { sessionManager } = createMockedSessionManager({ encryption: true });
    const usage = sessionManager.getLastTokenUsage(BigInt(42));
    expect(usage).toBeUndefined();
  });

  test('returns last prompt TokenUsageInfo after stream_end', async () => {
    const { sessionManager, emit } = createMockedSessionManager({ encryption: true });

    const resultPromise = sessionManager.sendPromptStreaming(
      BigInt(42), 'Hello',
      (token) => {},
      { onTokenUsage: () => {} }
    );

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    emit({ type: 'stream_end', vlm_tokens: 500, tokens_used: 10 });
    await resultPromise;

    const usage = sessionManager.getLastTokenUsage(BigInt(42));
    expect(usage).toBeDefined();
    expect(usage!.llmTokens).toBe(10);
    expect(usage!.vlmTokens).toBe(500);
    expect(usage!.totalTokens).toBe(510);
  });
});
