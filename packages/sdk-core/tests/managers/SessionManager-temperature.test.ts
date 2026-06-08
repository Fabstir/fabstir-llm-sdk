// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * SessionManager Per-Request Sampling Tests (temperature + maxTokens)
 *
 * Tests for per-request sampling control. `temperature` and `maxTokens` are
 * threaded from PromptOptions through every inference body the SDK builds
 * (encrypted WS, plaintext WS, and REST) down to the host node.
 *
 * Field naming: SDK API is camelCase (`temperature`, `maxTokens`); the wire
 * payload is snake_case (`temperature`, `max_tokens`).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import type { PromptOptions } from '../../src/types/index';
import { SessionManager } from '../../src/managers/SessionManager';
import { LLM_MAX_TOKENS } from '../../src/config/llm-config';

// ============= Sub-phase 1.1: PromptOptions Sampling Fields =============

describe('Sub-phase 1.1: PromptOptions sampling fields', () => {
  test('temperature and maxTokens are optional on PromptOptions', () => {
    const withSampling: PromptOptions = { temperature: 0.15, maxTokens: 2048 };
    const empty: PromptOptions = {};
    expect(withSampling.temperature).toBe(0.15);
    expect(withSampling.maxTokens).toBe(2048);
    expect(empty).toEqual({});
  });

  test('PromptOptions works without sampling (backward compat)', () => {
    const o: PromptOptions = {};
    expect(o.temperature).toBeUndefined();
    expect(o.maxTokens).toBeUndefined();
  });

  test('temperature: 0 is a representable value (not absent)', () => {
    const o: PromptOptions = { temperature: 0 };
    expect(o.temperature).toBe(0);
  });
});

// ============= Sub-phase 2.1: Encrypted Message Path =============

describe('Sub-phase 2.1: sampling in encrypted payload', () => {
  let sessionManager: SessionManager;
  let capturedEncryptedMessage: string | undefined;

  beforeEach(() => {
    capturedEncryptedMessage = undefined;

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

    sessionManager = new SessionManager(mockPaymentManager, mockStorageManager, mockHostManager);
    (sessionManager as any).initialized = true;

    (sessionManager as any).encryptionManager = {
      encryptMessage: vi.fn().mockImplementation((_key: any, message: string, _idx: number) => {
        capturedEncryptedMessage = message;
        return { ciphertextHex: 'encrypted', nonceHex: 'nonce', aadHex: 'aad' };
      }),
      encryptSessionKey: vi.fn().mockReturnValue('encrypted-session-key'),
      getRecoveryPublicKey: vi.fn().mockReturnValue('04' + 'cd'.repeat(32)),
    };

    (sessionManager as any).sessionKey = new Uint8Array(32);
    (sessionManager as any).messageIndex = 0;
    (sessionManager as any).wsClient = {
      sendWithoutResponse: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue('response text'),
      onMessage: vi.fn().mockReturnValue(() => {}),
      isConnected: vi.fn().mockReturnValue(true),
    };

    (sessionManager as any).sessions.set('42', {
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
      encryption: true,
    });
  });

  test('temperature/maxTokens flow into the encrypted payload when set', async () => {
    await (sessionManager as any).sendEncryptedMessage('Hello', undefined, undefined, undefined, {
      temperature: 0.1,
      maxTokens: 512,
    });
    const parsed = JSON.parse(capturedEncryptedMessage!);
    expect(parsed.temperature).toBe(0.1);
    expect(parsed.max_tokens).toBe(512);
  });

  test('temperature defaults to 0.7 and max_tokens to LLM_MAX_TOKENS when no sampling supplied', async () => {
    await (sessionManager as any).sendEncryptedMessage('Hello');
    const parsed = JSON.parse(capturedEncryptedMessage!);
    expect(parsed.temperature).toBe(0.7);
    expect(parsed.max_tokens).toBe(LLM_MAX_TOKENS);
  });

  test('temperature: 0 is honored in the encrypted payload (not coerced to 0.7)', async () => {
    await (sessionManager as any).sendEncryptedMessage('Hello', undefined, undefined, undefined, {
      temperature: 0,
    });
    const parsed = JSON.parse(capturedEncryptedMessage!);
    expect(parsed.temperature).toBe(0);
  });
});

// ============= Sub-phase 2.2: Plaintext & REST Paths =============

describe('Sub-phase 2.2: sampling in sendPrompt REST body', () => {
  let sessionManager: SessionManager;
  let capturedBody: any;

  beforeEach(() => {
    capturedBody = undefined;

    const mockPaymentManager = {
      initialize: vi.fn().mockResolvedValue(undefined),
      isInitialized: vi.fn().mockReturnValue(true),
      signer: { address: '0xabc', getAddress: vi.fn().mockResolvedValue('0xabc') },
    } as any;
    const mockStorageManager = {
      initialize: vi.fn().mockResolvedValue(undefined),
      isInitialized: vi.fn().mockReturnValue(true),
      appendMessage: vi.fn().mockResolvedValue(undefined),
      loadConversation: vi.fn().mockResolvedValue(null),
    } as any;
    const mockHostManager = {
      getHostInfo: vi.fn().mockResolvedValue({ address: '0xhost', apiUrl: 'http://localhost:8080' }),
    } as any;

    sessionManager = new SessionManager(mockPaymentManager, mockStorageManager, mockHostManager);
    (sessionManager as any).initialized = true;
    // Isolate the REST body: bypass RAG augmentation
    (sessionManager as any).injectRAGContext = vi.fn(async (_id: string, p: string) => p);

    (sessionManager as any).sessions.set('42', {
      sessionId: BigInt(42),
      jobId: BigInt(100),
      chainId: 84532,
      model: 'test-model',
      endpoint: 'http://localhost:8080',
      provider: 'test-host',
      status: 'active' as const,
      prompts: [] as string[],
      responses: [] as string[],
      checkpoints: [],
      totalTokens: 0,
      startTime: Date.now(),
    });

    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ response: 'ok' }) } as any;
    }));
  });

  test('sendPrompt REST body carries options.temperature/maxTokens', async () => {
    await sessionManager.sendPrompt(BigInt(42), 'hi', { temperature: 0.2, maxTokens: 333 });
    expect(capturedBody.temperature).toBe(0.2);
    expect(capturedBody.max_tokens).toBe(333);
  });

  test('sendPrompt REST body defaults temperature to 0.7 when unset', async () => {
    await sessionManager.sendPrompt(BigInt(42), 'hi');
    expect(capturedBody.temperature).toBe(0.7);
    expect(capturedBody.max_tokens).toBe(LLM_MAX_TOKENS);
  });
});
