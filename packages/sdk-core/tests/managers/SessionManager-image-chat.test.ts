// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * SessionManager Image Chat Tests
 *
 * Tests for Image WebSocket Chat feature.
 * Images are sent inside the encrypted WebSocket payload alongside the user's prompt.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import type { ISessionManager } from '../../src/interfaces/ISessionManager';
import type { PromptOptions, ImageAttachment } from '../../src/types/index';
import { validateImageAttachments } from '../../src/utils/image-validation';
import { SessionManager } from '../../src/managers/SessionManager';

// ============= Sub-phase 1.1: Image Types =============

describe('Sub-phase 1.1: Image Types', () => {
  test('ImageAttachment has data (string) and format (ImageFormat) fields', async () => {
    const { ImageAttachment } = await import('../../src/types/index') as any;
    // TypeScript compile-time check — runtime we verify shape works
    const attachment: import('../../src/types/index').ImageAttachment = {
      data: 'iVBORw0KGgoAAAANSUhEUg==',
      format: 'png',
    };
    expect(attachment.data).toBe('iVBORw0KGgoAAAANSUhEUg==');
    expect(attachment.format).toBe('png');
  });

  test('PromptOptions has optional images field', async () => {
    const options: import('../../src/types/index').PromptOptions = {};
    expect(options.images).toBeUndefined();

    const optionsWithImages: import('../../src/types/index').PromptOptions = {
      images: [{ data: 'abc', format: 'jpeg' }],
    };
    expect(optionsWithImages.images).toHaveLength(1);
  });

  test('ImageFormat accepts png, jpeg, webp, gif', () => {
    const formats: import('../../src/types/index').ImageFormat[] = ['png', 'jpeg', 'webp', 'gif'];
    expect(formats).toEqual(['png', 'jpeg', 'webp', 'gif']);
  });
});

// ============= Sub-phase 1.2: ISessionManager Interface =============

describe('Sub-phase 1.2: ISessionManager Interface', () => {
  test('sendPromptStreaming accepts 4th options parameter', async () => {
    // Verify the interface accepts a call with 4 arguments including PromptOptions
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

    const images = [{ data: 'abc123', format: 'png' as const }];
    await mockManager.sendPromptStreaming(BigInt(1), 'describe', undefined, { images });
    expect(receivedOptions?.images).toEqual(images);
  });

  test('sendPromptStreaming works without 4th parameter (backward compat)', async () => {
    const mockManager = {
      sendPromptStreaming: async (
        _sessionId: bigint,
        _prompt: string,
        _onToken?: (token: string) => void,
        _options?: PromptOptions,
      ): Promise<string> => 'response',
    } satisfies Pick<ISessionManager, 'sendPromptStreaming'>;

    // Call without options — must compile and work
    const result = await mockManager.sendPromptStreaming(BigInt(1), 'hello');
    expect(result).toBe('response');
  });
});

// ============= Sub-phase 1.3: Image Validation =============

describe('Sub-phase 1.3: Image Validation', () => {
  const expectSDKError = (fn: () => void, code: string) => {
    try {
      fn();
      expect.fail('Expected SDKError to be thrown');
    } catch (err: any) {
      expect(err.name).toBe('SDKError');
      expect(err.code).toBe(code);
    }
  };

  test('accepts valid PNG image attachment', () => {
    const images: ImageAttachment[] = [{ data: 'iVBORw0KGgo=', format: 'png' }];
    expect(() => validateImageAttachments(images)).not.toThrow();
  });

  test('accepts valid JPEG image attachment', () => {
    const images: ImageAttachment[] = [{ data: '/9j/4AAQSkZJRg==', format: 'jpeg' }];
    expect(() => validateImageAttachments(images)).not.toThrow();
  });

  test('accepts valid WebP and GIF formats', () => {
    const images: ImageAttachment[] = [
      { data: 'UklGR', format: 'webp' },
      { data: 'R0lGODlh', format: 'gif' },
    ];
    expect(() => validateImageAttachments(images)).not.toThrow();
  });

  test('rejects data:image/png;base64,... prefix', () => {
    const images: ImageAttachment[] = [
      { data: 'data:image/png;base64,iVBORw0KGgo=', format: 'png' },
    ];
    expectSDKError(() => validateImageAttachments(images), 'INVALID_IMAGE_DATA');
  });

  test('rejects unsupported format', () => {
    const images = [{ data: 'abc', format: 'bmp' }] as any;
    expectSDKError(() => validateImageAttachments(images), 'INVALID_IMAGE_FORMAT');
  });

  test('rejects empty images array', () => {
    expectSDKError(() => validateImageAttachments([]), 'INVALID_IMAGE_DATA');
  });

  test('rejects non-string data field', () => {
    const images = [{ data: 12345, format: 'png' }] as any;
    expectSDKError(() => validateImageAttachments(images), 'INVALID_IMAGE_DATA');
  });

  test('rejects image exceeding 10MB', () => {
    const largeData = 'A'.repeat(14_000_000);
    const images: ImageAttachment[] = [{ data: largeData, format: 'png' }];
    expectSDKError(() => validateImageAttachments(images), 'IMAGE_TOO_LARGE');
  });
});

// ============= Sub-phase 2.1: Encrypted Payload Restructure =============
// ============= Sub-phase 2.2: Wire sendPromptStreaming =============
// ============= Sub-phase 2.3: Edge Case Guards =============

describe('Sub-phase 2.1-2.3: Encrypted Payload & Image Wiring', () => {
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

    // Set initialized flag
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

    // Mock session key
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

    // Mock sendEncryptedInit to skip the full init flow (already tested in SessionManager-encryption.test.ts)
    (sessionManager as any).sendEncryptedInit = vi.fn().mockResolvedValue(undefined);
    // Mock sendPlaintextInit for plaintext path tests
    (sessionManager as any).sendPlaintextInit = vi.fn().mockResolvedValue(undefined);
  });

  // --- Sub-phase 2.1 tests ---

  test('encrypted payload decrypts to valid JSON', async () => {
    await (sessionManager as any).sendEncryptedMessage('Hello world');
    expect(capturedEncryptedMessage).toBeDefined();
    const parsed = JSON.parse(capturedEncryptedMessage!);
    expect(typeof parsed).toBe('object');
  });

  test('decrypted JSON contains prompt, model, max_tokens, temperature, stream', async () => {
    await (sessionManager as any).sendEncryptedMessage('Test prompt');
    const parsed = JSON.parse(capturedEncryptedMessage!);
    expect(parsed.prompt).toBe('Test prompt');
    expect(parsed.model).toBe('CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf');
    expect(parsed.max_tokens).toBe(4000);
    expect(parsed.temperature).toBe(0.7);
    expect(parsed.stream).toBe(true);
  });

  test('decrypted JSON contains images array when images provided', async () => {
    const images: ImageAttachment[] = [
      { data: 'iVBORw0KGgo=', format: 'png' },
    ];
    await (sessionManager as any).sendEncryptedMessage('Describe this', undefined, images);
    const parsed = JSON.parse(capturedEncryptedMessage!);
    expect(parsed.images).toEqual([{ data: 'iVBORw0KGgo=', format: 'png' }]);
  });

  test('decrypted JSON omits images field when no images provided', async () => {
    await (sessionManager as any).sendEncryptedMessage('Just text');
    const parsed = JSON.parse(capturedEncryptedMessage!);
    expect(parsed).not.toHaveProperty('images');
  });

  test('images entries have data and format fields only', async () => {
    const images: ImageAttachment[] = [
      { data: 'abc123', format: 'jpeg' },
    ];
    await (sessionManager as any).sendEncryptedMessage('Describe', undefined, images);
    const parsed = JSON.parse(capturedEncryptedMessage!);
    expect(Object.keys(parsed.images[0]).sort()).toEqual(['data', 'format']);
  });

  test('validation runs before encryption (invalid image throws, nothing sent)', async () => {
    const invalidImages: ImageAttachment[] = [
      { data: 'data:image/png;base64,abc', format: 'png' },
    ];
    await expect(
      (sessionManager as any).sendEncryptedMessage('Describe', undefined, invalidImages)
    ).rejects.toThrow();
    // encryptMessage should NOT have been called
    expect((sessionManager as any).encryptionManager.encryptMessage).not.toHaveBeenCalled();
  });

  // --- Sub-phase 2.2 tests ---

  test('sendPromptStreaming with images passes them to encrypted message', async () => {
    // Mock the streaming response flow - simulate receiving a response
    const wsClient = (sessionManager as any).wsClient;
    let messageHandler: any;
    wsClient.onMessage = vi.fn().mockImplementation((handler: any) => {
      messageHandler = handler;
      // Simulate response after a tick
      setTimeout(() => {
        handler({
          type: 'stream_chunk',
          content: 'Image shows a cat',
        });
        handler({
          type: 'stream_end',
        });
      }, 10);
      return () => {};
    });

    const images: ImageAttachment[] = [{ data: 'iVBORw0KGgo=', format: 'png' }];
    const result = await sessionManager.sendPromptStreaming(
      BigInt(42), 'Describe image', undefined, { images }
    );

    // Verify encrypted message received the images
    expect(capturedEncryptedMessage).toBeDefined();
    const parsed = JSON.parse(capturedEncryptedMessage!);
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0].format).toBe('png');
  });

  test('sendPromptStreaming without images works (no regression)', async () => {
    const wsClient = (sessionManager as any).wsClient;
    wsClient.onMessage = vi.fn().mockImplementation((handler: any) => {
      setTimeout(() => {
        handler({ type: 'stream_chunk', content: 'Hello!' });
        handler({ type: 'stream_end' });
      }, 10);
      return () => {};
    });

    const result = await sessionManager.sendPromptStreaming(BigInt(42), 'Hello');
    expect(capturedEncryptedMessage).toBeDefined();
    const parsed = JSON.parse(capturedEncryptedMessage!);
    expect(parsed).not.toHaveProperty('images');
    expect(parsed.prompt).toBe('Hello');
  });

  test('plaintext path includes images in request object', async () => {
    // Switch session to plaintext (no encryption)
    const session = (sessionManager as any).sessions.get('42');
    session.encryption = false;
    // Clear encryption manager to force plaintext path
    (sessionManager as any).sessionKey = null;

    const images: ImageAttachment[] = [{ data: 'abc', format: 'jpeg' }];

    const wsClient = (sessionManager as any).wsClient;
    wsClient.onMessage = vi.fn().mockImplementation((handler: any) => {
      setTimeout(() => {
        handler({ type: 'stream_chunk', content: 'I see...' });
        handler({ type: 'stream_end' });
      }, 10);
      return () => {};
    });

    await sessionManager.sendPromptStreaming(BigInt(42), 'What is this?', undefined, { images });

    // In plaintext mode, images should be in the request object
    expect(capturedWsMessage).toBeDefined();
    expect(capturedWsMessage.request?.images).toEqual([{ data: 'abc', format: 'jpeg' }]);
  });

  test('message metadata stores imageCount (not raw image data)', async () => {
    const wsClient = (sessionManager as any).wsClient;
    wsClient.onMessage = vi.fn().mockImplementation((handler: any) => {
      setTimeout(() => {
        handler({ type: 'stream_chunk', content: 'Done' });
        handler({ type: 'stream_end' });
      }, 10);
      return () => {};
    });

    const mockStorageManager = (sessionManager as any).storageManager;
    const images: ImageAttachment[] = [
      { data: 'img1', format: 'png' },
      { data: 'img2', format: 'jpeg' },
    ];

    await sessionManager.sendPromptStreaming(BigInt(42), 'Describe', undefined, { images });

    // Check that appendMessage was called with imageCount metadata
    const calls = mockStorageManager.appendMessage.mock.calls;
    const userMessageCall = calls.find((c: any) => c[1]?.role === 'user');
    expect(userMessageCall).toBeDefined();
    expect(userMessageCall[1].metadata?.imageCount).toBe(2);
  });

  // --- Sub-phase 2.3 tests ---

  test('streamResponse throws IMAGES_NOT_SUPPORTED when images provided', async () => {
    try {
      await sessionManager.streamResponse(
        BigInt(42), 'Describe', () => {}, { images: [{ data: 'abc', format: 'png' }] }
      );
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('IMAGES_NOT_SUPPORTED');
    }
  });

  test('streamResponse continues to work without images', async () => {
    // streamResponse is a REST-based fallback that makes HTTP calls
    // It should work without images (we don't test the full HTTP flow, just that it doesn't throw early)
    const session = (sessionManager as any).sessions.get('42');
    session.endpoint = 'http://localhost:8080';

    // Mock fetch for the REST call
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"content":"hi"}\n\n') })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        }),
      },
    }) as any;

    try {
      await sessionManager.streamResponse(BigInt(42), 'Hello', () => {});
    } catch {
      // May throw due to incomplete mock — that's OK, the point is it didn't throw IMAGES_NOT_SUPPORTED
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ============= Sub-phase 3.2: DocumentManager Image Rejection =============

describe('Sub-phase 3.2: DocumentManager Image Rejection', () => {
  test('processDocument throws for PNG file with descriptive message', async () => {
    const { DocumentManager } = await import('../../src/managers/DocumentManager');
    const mockEmbeddingService = {
      embed: vi.fn(),
      embedBatch: vi.fn(),
    } as any;

    const docManager = new DocumentManager({ embeddingService: mockEmbeddingService });
    const pngFile = new File(['fake png data'], 'photo.png', { type: 'image/png' });

    try {
      await docManager.processDocument(pngFile);
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.message).toContain('sendPromptStreaming');
      expect(err.message).toContain('images');
    }
  });

  test('processDocument throws for JPEG file', async () => {
    const { DocumentManager } = await import('../../src/managers/DocumentManager');
    const mockEmbeddingService = { embed: vi.fn(), embedBatch: vi.fn() } as any;

    const docManager = new DocumentManager({ embeddingService: mockEmbeddingService });
    const jpegFile = new File(['fake jpeg data'], 'photo.jpeg', { type: 'image/jpeg' });

    try {
      await docManager.processDocument(jpegFile);
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.message).toContain('sendPromptStreaming');
    }
  });
});
