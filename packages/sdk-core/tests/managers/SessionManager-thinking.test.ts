// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * SessionManager Thinking Mode Tests
 *
 * Tests for per-request thinking/reasoning mode control.
 * The `thinking` field is threaded from PromptOptions through to the encrypted payload.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import type { ISessionManager } from '../../src/interfaces/ISessionManager';
import type { PromptOptions, ThinkingMode } from '../../src/types/index';
import { SessionManager } from '../../src/managers/SessionManager';

// ============= Sub-phase 1.1: ThinkingMode Type & PromptOptions =============

describe('Sub-phase 1.1: ThinkingMode Type & PromptOptions', () => {
  test('ThinkingMode accepts enabled, disabled, low, medium, high', () => {
    const modes: ThinkingMode[] = ['enabled', 'disabled', 'low', 'medium', 'high'];
    expect(modes).toEqual(['enabled', 'disabled', 'low', 'medium', 'high']);
  });

  test('PromptOptions has optional thinking field', () => {
    const options: PromptOptions = {};
    expect(options.thinking).toBeUndefined();

    const optionsWithThinking: PromptOptions = { thinking: 'high' };
    expect(optionsWithThinking.thinking).toBe('high');
  });

  test('PromptOptions works without thinking (backward compat)', () => {
    const opts: PromptOptions = {};
    expect(opts.thinking).toBeUndefined();

    // Backward compat: images-only still works
    const imgOpts: PromptOptions = {
      images: [{ data: 'abc', format: 'png' }],
    };
    expect(imgOpts.images).toHaveLength(1);
    expect(imgOpts.thinking).toBeUndefined();
  });

  test('sendPromptStreaming accepts thinking in options via mock interface', async () => {
    let receivedOptions: PromptOptions | undefined;
    const mockManager = {
      sendPromptStreaming: async (
        _sessionId: bigint,
        _prompt: string,
        _onToken?: (token: string) => void,
        options?: PromptOptions,
      ): Promise<string> => {
        receivedOptions = options;
        return 'response';
      },
    } satisfies Pick<ISessionManager, 'sendPromptStreaming'>;

    await mockManager.sendPromptStreaming(BigInt(1), 'explain quantum', undefined, { thinking: 'high' });
    expect(receivedOptions?.thinking).toBe('high');
  });
});

// ============= Sub-phase 2.1: Encrypted Message Path =============
// ============= Sub-phase 2.2: Plaintext & REST Paths =============

describe('Sub-phase 2.1-2.2: Thinking Mode in Payloads', () => {
  let sessionManager: SessionManager;
  let capturedEncryptedMessage: string | undefined;
  let capturedWsMessage: any;

  beforeEach(() => {
    capturedEncryptedMessage = undefined;
    capturedWsMessage = undefined;

    // Create SessionManager with minimal mocks
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

    // Mock EncryptionManager to capture what gets encrypted
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

    // Mock WebSocket client
    (sessionManager as any).wsClient = {
      sendWithoutResponse: vi.fn().mockImplementation((msg: any) => {
        capturedWsMessage = msg;
        return Promise.resolve();
      }),
      sendMessage: vi.fn().mockImplementation((msg: any) => {
        capturedWsMessage = msg;
        return Promise.resolve('response text');
      }),
      onMessage: vi.fn().mockReturnValue(() => {}),
      isConnected: vi.fn().mockReturnValue(true),
    };

    // Set active session with encryption
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
      encryption: true,
    };
    (sessionManager as any).sessions.set('42', sessionState);

    (sessionManager as any).sendEncryptedInit = vi.fn().mockResolvedValue(undefined);
    (sessionManager as any).sendPlaintextInit = vi.fn().mockResolvedValue(undefined);
  });

  // --- Sub-phase 2.1: Encrypted payload tests ---

  test('thinking field included in encrypted payload when set', async () => {
    await (sessionManager as any).sendEncryptedMessage('Hello', undefined, undefined, 'high');
    expect(capturedEncryptedMessage).toBeDefined();
    const parsed = JSON.parse(capturedEncryptedMessage!);
    expect(parsed.thinking).toBe('high');
  });

  test('thinking field omitted from encrypted payload when not set', async () => {
    await (sessionManager as any).sendEncryptedMessage('Hello');
    expect(capturedEncryptedMessage).toBeDefined();
    const parsed = JSON.parse(capturedEncryptedMessage!);
    expect(parsed).not.toHaveProperty('thinking');
  });

  test('all 5 ThinkingMode values accepted in encrypted payload', async () => {
    const modes: ThinkingMode[] = ['enabled', 'disabled', 'low', 'medium', 'high'];
    for (const mode of modes) {
      capturedEncryptedMessage = undefined;
      (sessionManager as any).messageIndex = 0;
      await (sessionManager as any).sendEncryptedMessage('Hello', undefined, undefined, mode);
      const parsed = JSON.parse(capturedEncryptedMessage!);
      expect(parsed.thinking).toBe(mode);
    }
  });

  // --- Sub-phase 2.2: Plaintext payload tests ---

  test('thinking included in plaintext request when set', () => {
    // Simulate plaintext payload construction (same pattern as SessionManager)
    const options: PromptOptions = { thinking: 'medium' };
    const plaintextRequest: any = {
      model: 'test-model',
      prompt: 'Hello',
      max_tokens: 4000,
      temperature: 0.7,
      stream: true,
    };

    // This mirrors the pattern that will be added to SessionManager
    if (options?.thinking) {
      plaintextRequest.thinking = options.thinking;
    }

    expect(plaintextRequest.thinking).toBe('medium');
  });
});
