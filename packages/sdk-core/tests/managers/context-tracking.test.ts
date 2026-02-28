// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Context Memory Tracking Tests
 *
 * Tests for context window usage tracking, warning callbacks,
 * ContextLimitError, and getContextInfo() method.
 */

import { describe, test, expect, vi } from 'vitest';
import 'fake-indexeddb/auto';
import type { TokenUsageInfo, PromptOptions, ContextInfo } from '../../src/types';
import { ContextLimitError } from '../../src/errors/context-errors';
import { SDKError } from '../../src/types';
import { SessionManager } from '../../src/managers/SessionManager';

/**
 * Helper: create a SessionManager with mocks for encrypted streaming tests.
 * Returns { sm, emit, getSession } so tests can inspect session state and fire messages.
 */
function createMockedSM(opts: { encryption?: boolean } = {}) {
  const encryption = opts.encryption !== false;

  const sm = new SessionManager(
    { signer: { address: '0x1111111111111111111111111111111111111111', getAddress: vi.fn().mockResolvedValue('0x1111111111111111111111111111111111111111') } } as any,
    { appendMessage: vi.fn().mockResolvedValue(undefined), loadConversation: vi.fn().mockResolvedValue(null) } as any,
    { getHostPublicKey: vi.fn().mockResolvedValue('02' + 'ab'.repeat(32)) } as any
  );
  (sm as any).initialized = true;

  // Mock encryption internals
  (sm as any).encryptionManager = {
    encryptMessage: vi.fn().mockReturnValue({ ciphertextHex: 'enc', nonceHex: 'n', aadHex: 'a' }),
    encryptSessionKey: vi.fn().mockReturnValue('enc-key'),
    getRecoveryPublicKey: vi.fn().mockReturnValue('04' + 'cd'.repeat(32)),
  };
  (sm as any).sessionKey = new Uint8Array(32);
  (sm as any).messageIndex = 0;
  (sm as any).decryptIncomingMessage = vi.fn().mockImplementation((data: any) => data._mockContent || 'tok');

  // Mock WebSocket with handler capture
  let handlers: Array<(data: any) => void> = [];
  (sm as any).wsClient = {
    sendWithoutResponse: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue('response text'),
    onMessage: vi.fn().mockImplementation((handler: any) => {
      handlers.push(handler);
      return () => { handlers = handlers.filter(h => h !== handler); };
    }),
    isConnected: vi.fn().mockReturnValue(true),
  };

  const emit = (data: any) => handlers.forEach(h => h(data));

  // Session state
  const sessionState = {
    sessionId: BigInt(42), jobId: BigInt(100), chainId: 84532,
    model: 'test-model', provider: 'test-host', status: 'active' as const,
    prompts: [] as string[], responses: [] as string[], checkpoints: [],
    totalTokens: 0, startTime: Date.now(), encryption,
  };
  (sm as any).sessions.set('42', sessionState);

  // Mock init methods
  (sm as any).sendEncryptedInit = vi.fn().mockResolvedValue(undefined);
  (sm as any).sendPlaintextInit = vi.fn().mockResolvedValue(undefined);

  const getSession = () => (sm as any).sessions.get('42');
  return { sm, emit, getSession };
}

// ============= Sub-phase 1.1: Type-level tests =============

describe('Sub-phase 1.1: TokenUsageInfo & PromptOptions extensions', () => {
  test('TokenUsageInfo accepts optional promptTokens and contextWindowSize', () => {
    const usage: TokenUsageInfo = {
      llmTokens: 10, vlmTokens: 0, imageGenTokens: 0, totalTokens: 10,
      promptTokens: 100, contextWindowSize: 32768
    };
    expect(usage.promptTokens).toBe(100);
    expect(usage.contextWindowSize).toBe(32768);
  });

  test('TokenUsageInfo accepts optional contextUtilization (0.0-1.0)', () => {
    const usage: TokenUsageInfo = {
      llmTokens: 10, vlmTokens: 0, imageGenTokens: 0, totalTokens: 10,
      contextUtilization: 0.75
    };
    expect(usage.contextUtilization).toBe(0.75);
  });

  test('TokenUsageInfo accepts optional finishReason', () => {
    const reasons: Array<'stop' | 'length' | 'cancelled'> = ['stop', 'length', 'cancelled'];
    for (const reason of reasons) {
      const usage: TokenUsageInfo = {
        llmTokens: 10, vlmTokens: 0, imageGenTokens: 0, totalTokens: 10,
        finishReason: reason
      };
      expect(usage.finishReason).toBe(reason);
    }
  });

  test('TokenUsageInfo backward compat — existing 4 fields still work without new fields', () => {
    const usage: TokenUsageInfo = {
      llmTokens: 10, vlmTokens: 0, imageGenTokens: 0, totalTokens: 10
    };
    expect(usage.llmTokens).toBe(10);
    expect(usage.promptTokens).toBeUndefined();
    expect(usage.contextWindowSize).toBeUndefined();
    expect(usage.contextUtilization).toBeUndefined();
    expect(usage.finishReason).toBeUndefined();
  });

  test('PromptOptions accepts onContextWarning callback', () => {
    const opts: PromptOptions = {
      onContextWarning: (usage: TokenUsageInfo) => {
        // callback type-checks
      }
    };
    expect(opts.onContextWarning).toBeDefined();
  });

  test('PromptOptions accepts contextWarningThreshold number', () => {
    const opts: PromptOptions = {
      contextWarningThreshold: 0.75
    };
    expect(opts.contextWarningThreshold).toBe(0.75);
  });

  test('ContextInfo interface has all required fields', () => {
    const info: ContextInfo = {
      promptTokens: 1250,
      completionTokens: 150,
      contextWindowSize: 32768,
      utilization: (1250 + 150) / 32768,
      finishReason: 'stop'
    };
    expect(info.promptTokens).toBe(1250);
    expect(info.completionTokens).toBe(150);
    expect(info.contextWindowSize).toBe(32768);
    expect(info.utilization).toBeCloseTo(0.0427, 3);
    expect(info.finishReason).toBe('stop');

    // finishReason can also be null
    const info2: ContextInfo = { ...info, finishReason: null };
    expect(info2.finishReason).toBeNull();
  });
});

// ============= Sub-phase 1.2: ContextLimitError tests =============

describe('Sub-phase 1.2: ContextLimitError', () => {
  test('ContextLimitError has code TOKEN_LIMIT_EXCEEDED', () => {
    const err = new ContextLimitError('Prompt exceeds context window', 33500, 32768);
    expect(err.code).toBe('TOKEN_LIMIT_EXCEEDED');
  });

  test('ContextLimitError has promptTokens and contextWindowSize', () => {
    const err = new ContextLimitError('Prompt exceeds context window', 33500, 32768);
    expect(err.promptTokens).toBe(33500);
    expect(err.contextWindowSize).toBe(32768);
  });

  test('ContextLimitError.excess = promptTokens - contextWindowSize', () => {
    const err = new ContextLimitError('Prompt exceeds context window', 33500, 32768);
    expect(err.excess).toBe(732);
  });

  test('ContextLimitError is instanceof Error', () => {
    const err = new ContextLimitError('Prompt exceeds context window', 33500, 32768);
    expect(err instanceof Error).toBe(true);
    expect(err instanceof ContextLimitError).toBe(true);
    expect(err.name).toBe('ContextLimitError');
    expect(err.message).toBe('Prompt exceeds context window');
  });
});

// ============= Sub-phase 2.1: _processStreamEnd & context tracking =============

describe('Sub-phase 2.1: stream_end context tracking', () => {
  test('stream_end with usage object populates promptTokens in TokenUsageInfo', async () => {
    const { sm, emit } = createMockedSM({ encryption: true });
    let captured: TokenUsageInfo | undefined;

    const promise = sm.sendPromptStreaming(42n, 'Hello', () => {}, {
      onTokenUsage: (u) => { captured = u; }
    });

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    emit({ type: 'stream_end', tokens_used: 150, usage: { prompt_tokens: 1250, completion_tokens: 150, context_window_size: 32768 } });

    await promise;
    expect(captured).toBeDefined();
    expect(captured!.promptTokens).toBe(1250);
  });

  test('stream_end with usage object populates contextWindowSize', async () => {
    const { sm, emit } = createMockedSM({ encryption: true });
    let captured: TokenUsageInfo | undefined;

    const promise = sm.sendPromptStreaming(42n, 'Hello', () => {}, {
      onTokenUsage: (u) => { captured = u; }
    });

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    emit({ type: 'stream_end', tokens_used: 150, usage: { prompt_tokens: 1250, completion_tokens: 150, context_window_size: 32768 } });

    await promise;
    expect(captured!.contextWindowSize).toBe(32768);
  });

  test('contextUtilization computed as (prompt + completion) / window', async () => {
    const { sm, emit } = createMockedSM({ encryption: true });
    let captured: TokenUsageInfo | undefined;

    const promise = sm.sendPromptStreaming(42n, 'Hello', () => {}, {
      onTokenUsage: (u) => { captured = u; }
    });

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    emit({ type: 'stream_end', tokens_used: 150, usage: { prompt_tokens: 1250, completion_tokens: 150, context_window_size: 32768 } });

    await promise;
    expect(captured!.contextUtilization).toBeCloseTo((1250 + 150) / 32768, 5);
  });

  test('finish_reason surfaced in TokenUsageInfo.finishReason', async () => {
    const { sm, emit } = createMockedSM({ encryption: true });
    let captured: TokenUsageInfo | undefined;

    const promise = sm.sendPromptStreaming(42n, 'Hello', () => {}, {
      onTokenUsage: (u) => { captured = u; }
    });

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    emit({ type: 'stream_end', tokens_used: 150, finish_reason: 'length', usage: { prompt_tokens: 1250, completion_tokens: 150, context_window_size: 32768 } });

    await promise;
    expect(captured!.finishReason).toBe('length');
  });

  test('onContextWarning fires when utilization >= 0.8 (default threshold)', async () => {
    const { sm, emit } = createMockedSM({ encryption: true });
    let warningUsage: TokenUsageInfo | undefined;

    const promise = sm.sendPromptStreaming(42n, 'Hello', () => {}, {
      onTokenUsage: () => {},
      onContextWarning: (u) => { warningUsage = u; }
    });

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    // utilization = (27000 + 1000) / 32768 ≈ 0.854 → >= 0.8
    emit({ type: 'stream_end', tokens_used: 1000, usage: { prompt_tokens: 27000, completion_tokens: 1000, context_window_size: 32768 } });

    await promise;
    expect(warningUsage).toBeDefined();
    expect(warningUsage!.contextUtilization).toBeGreaterThanOrEqual(0.8);
  });

  test('onContextWarning does NOT fire when utilization < threshold', async () => {
    const { sm, emit } = createMockedSM({ encryption: true });
    let warningFired = false;

    const promise = sm.sendPromptStreaming(42n, 'Hello', () => {}, {
      onTokenUsage: () => {},
      onContextWarning: () => { warningFired = true; }
    });

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    // utilization = (10000 + 150) / 32768 ≈ 0.31 → < 0.8
    emit({ type: 'stream_end', tokens_used: 150, usage: { prompt_tokens: 10000, completion_tokens: 150, context_window_size: 32768 } });

    await promise;
    expect(warningFired).toBe(false);
  });

  test('custom contextWarningThreshold is respected', async () => {
    const { sm, emit } = createMockedSM({ encryption: true });
    let warningFired = false;

    const promise = sm.sendPromptStreaming(42n, 'Hello', () => {}, {
      onTokenUsage: () => {},
      contextWarningThreshold: 0.9,
      onContextWarning: () => { warningFired = true; }
    });

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    // utilization = (27000 + 1000) / 32768 ≈ 0.854 → < 0.9 threshold
    emit({ type: 'stream_end', tokens_used: 1000, usage: { prompt_tokens: 27000, completion_tokens: 1000, context_window_size: 32768 } });

    await promise;
    expect(warningFired).toBe(false);

    // Now test with utilization above 0.9
    let warningFired2 = false;
    const promise2 = sm.sendPromptStreaming(42n, 'Hello again', () => {}, {
      onTokenUsage: () => {},
      contextWarningThreshold: 0.9,
      onContextWarning: () => { warningFired2 = true; }
    });

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    // utilization = (30000 + 1000) / 32768 ≈ 0.946 → >= 0.9
    emit({ type: 'stream_end', tokens_used: 1000, usage: { prompt_tokens: 30000, completion_tokens: 1000, context_window_size: 32768 } });

    await promise2;
    expect(warningFired2).toBe(true);
  });

  test('stream_end WITHOUT usage object still works (backward compat)', async () => {
    const { sm, emit } = createMockedSM({ encryption: true });
    let captured: TokenUsageInfo | undefined;

    const promise = sm.sendPromptStreaming(42n, 'Hello', () => {}, {
      onTokenUsage: (u) => { captured = u; }
    });

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    emit({ type: 'stream_end', tokens_used: 5 }); // No usage object

    await promise;
    expect(captured).toBeDefined();
    expect(captured!.llmTokens).toBe(5);
    expect(captured!.promptTokens).toBeUndefined();
    expect(captured!.contextWindowSize).toBeUndefined();
    expect(captured!.contextUtilization).toBeUndefined();
  });

  test('existing onTokenUsage callback still fires with all original fields', async () => {
    const { sm, emit } = createMockedSM({ encryption: true });
    let captured: TokenUsageInfo | undefined;

    const promise = sm.sendPromptStreaming(42n, 'Hello', () => {}, {
      onTokenUsage: (u) => { captured = u; }
    });

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    emit({ type: 'stream_end', tokens_used: 100, vlm_tokens: 50, usage: { prompt_tokens: 500, completion_tokens: 100, context_window_size: 32768 } });

    await promise;
    expect(captured).toBeDefined();
    expect(captured!.llmTokens).toBe(100);
    expect(captured!.vlmTokens).toBe(50);
    expect(captured!.imageGenTokens).toBe(0);
    expect(captured!.totalTokens).toBe(150);
  });
});

// ============= Sub-phase 2.2: TOKEN_LIMIT_EXCEEDED error handling =============

describe('Sub-phase 2.2: TOKEN_LIMIT_EXCEEDED error handling', () => {
  test('TOKEN_LIMIT_EXCEEDED error throws ContextLimitError', async () => {
    const { sm, emit } = createMockedSM({ encryption: true });

    const promise = sm.sendPromptStreaming(42n, 'Hello', () => {});

    await new Promise(r => setTimeout(r, 20));
    emit({
      type: 'error',
      code: 'TOKEN_LIMIT_EXCEEDED',
      message: 'Prompt exceeds context window',
      prompt_tokens: 33500,
      context_window_size: 32768
    });

    await expect(promise).rejects.toThrow(ContextLimitError);
  });

  test('ContextLimitError has correct promptTokens and contextWindowSize from node', async () => {
    const { sm, emit } = createMockedSM({ encryption: true });

    const promise = sm.sendPromptStreaming(42n, 'Hello', () => {});

    await new Promise(r => setTimeout(r, 20));
    emit({
      type: 'error',
      code: 'TOKEN_LIMIT_EXCEEDED',
      message: 'Prompt exceeds context window',
      prompt_tokens: 33500,
      context_window_size: 32768
    });

    try {
      await promise;
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ContextLimitError);
      const ctxErr = err as ContextLimitError;
      expect(ctxErr.promptTokens).toBe(33500);
      expect(ctxErr.contextWindowSize).toBe(32768);
      expect(ctxErr.excess).toBe(732);
    }
  });

  test('generic node error still throws SDKError with REQUEST_ERROR code', async () => {
    const { sm, emit } = createMockedSM({ encryption: true });

    const promise = sm.sendPromptStreaming(42n, 'Hello', () => {});

    await new Promise(r => setTimeout(r, 20));
    emit({
      type: 'error',
      message: 'Something went wrong'
    });

    try {
      await promise;
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SDKError);
      // Outer try-catch in sendPromptStreaming wraps errors in WS_PROMPT_ERROR
      expect((err as SDKError).code).toBe('WS_PROMPT_ERROR');
      expect(err).not.toBeInstanceOf(ContextLimitError);
    }
  });
});

// ============= Sub-phase 2.3: getContextInfo() =============

describe('Sub-phase 2.3: getContextInfo()', () => {
  test('getContextInfo() returns null before any prompt', () => {
    const { sm } = createMockedSM({ encryption: true });
    const result = sm.getContextInfo(42n);
    expect(result).toBeNull();
  });

  test('getContextInfo() returns ContextInfo after stream_end with usage', async () => {
    const { sm, emit } = createMockedSM({ encryption: true });

    const promise = sm.sendPromptStreaming(42n, 'Hello', () => {}, {
      onTokenUsage: () => {}
    });

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    emit({ type: 'stream_end', tokens_used: 150, finish_reason: 'stop', usage: { prompt_tokens: 1250, completion_tokens: 150, context_window_size: 32768 } });

    await promise;

    const info = sm.getContextInfo(42n);
    expect(info).not.toBeNull();
    expect(info!.promptTokens).toBe(1250);
    expect(info!.contextWindowSize).toBe(32768);
    expect(info!.utilization).toBeGreaterThan(0);
    expect(info!.finishReason).toBe('stop');
  });

  test('getContextInfo() utilization is 0 when contextWindowSize unknown', async () => {
    const { sm, emit } = createMockedSM({ encryption: true });

    const promise = sm.sendPromptStreaming(42n, 'Hello', () => {}, {
      onTokenUsage: () => {}
    });

    await new Promise(r => setTimeout(r, 20));
    emit({ type: 'encrypted_chunk', payload: { ciphertextHex: 'a' }, _mockContent: 'Hi' });
    // No usage object — older node
    emit({ type: 'stream_end', tokens_used: 5 });

    await promise;

    // No usage was sent, so lastPromptTokens is undefined → getContextInfo returns null
    const info = sm.getContextInfo(42n);
    expect(info).toBeNull();
  });
});
