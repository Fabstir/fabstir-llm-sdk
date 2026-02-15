/**
 * @fileoverview Tests for SessionManager.generateImage() encrypted WebSocket path
 * Sub-phase 3.1: generateImage() Encrypted WebSocket
 *
 * Tests the WebSocket-based image generation with encryption.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  ImageGenerationResult,
  ImageGenerationOptions,
} from '../../src/types/image-generation.types';
import { MAX_PROMPT_LENGTH } from '../../src/types/image-generation.types';
import { ImageGenerationError } from '../../src/errors/image-generation-errors';

// We test generateImage as a standalone function to avoid heavy SessionManager mocking
import { generateImageWs } from '../../src/utils/image-generation-ws';

const MOCK_SESSION_ID = '12345';

const MOCK_RESULT: ImageGenerationResult = {
  image: 'base64imagedata',
  model: 'stable-diffusion-xl',
  size: '1024x1024',
  steps: 4,
  seed: 99999,
  processingTimeMs: 3200,
  safety: { promptSafe: true, outputSafe: true, safetyLevel: 'strict' },
  billing: { generationUnits: 10, modelMultiplier: 1.0, megapixels: 1.05, steps: 4 },
  provider: 'host-1',
  chainId: 84532,
  chainName: 'Base Sepolia',
  nativeToken: 'ETH',
};

function createMockWsClient() {
  const handlers: Array<(data: any) => void> = [];
  return {
    isConnected: vi.fn().mockReturnValue(true),
    sendWithoutResponse: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn((handler: (data: any) => void) => {
      handlers.push(handler);
      return () => {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      };
    }),
    // Test helper: simulate server response
    _simulateMessage(data: any) {
      for (const h of handlers) h(data);
    },
  };
}

function createMockEncryptionManager() {
  return {
    encryptMessage: vi.fn((_key: Uint8Array, plaintext: string, _idx: number) => ({
      ciphertextHex: Buffer.from(plaintext).toString('hex'),
      nonceHex: '000000000000000000000000',
      aadHex: '',
    })),
    decryptMessage: vi.fn((_key: Uint8Array, payload: any) => {
      return Buffer.from(payload.ciphertextHex, 'hex').toString('utf-8');
    }),
  };
}

function createMockRateLimiter(canGenerate = true, retryMs = 0) {
  return {
    canGenerate: vi.fn().mockReturnValue(canGenerate),
    recordRequest: vi.fn(),
    getTimeUntilNextSlot: vi.fn().mockReturnValue(retryMs),
    getRemainingRequests: vi.fn().mockReturnValue(canGenerate ? 5 : 0),
  };
}

describe('generateImageWs', () => {
  let mockWs: ReturnType<typeof createMockWsClient>;
  let mockEncryption: ReturnType<typeof createMockEncryptionManager>;
  let mockRateLimiter: ReturnType<typeof createMockRateLimiter>;
  let sessionKey: Uint8Array;
  let messageIndex: { value: number };

  beforeEach(() => {
    mockWs = createMockWsClient();
    mockEncryption = createMockEncryptionManager();
    mockRateLimiter = createMockRateLimiter();
    sessionKey = new Uint8Array(32);
    messageIndex = { value: 0 };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return ImageGenerationResult on successful generation', async () => {
    const promise = generateImageWs({
      wsClient: mockWs as any,
      encryptionManager: mockEncryption as any,
      rateLimiter: mockRateLimiter as any,
      sessionId: MOCK_SESSION_ID,
      sessionKey,
      messageIndex,
      prompt: 'a beautiful sunset',
    });

    // Simulate server encrypted response
    const responsePayload = {
      ciphertextHex: Buffer.from(JSON.stringify({
        type: 'image_generation_result',
        ...MOCK_RESULT,
      })).toString('hex'),
      nonceHex: '000000000000000000000000',
      aadHex: '',
    };
    mockWs._simulateMessage({
      type: 'encrypted_response',
      session_id: MOCK_SESSION_ID,
      payload: responsePayload,
    });

    const result = await promise;
    expect(result).toEqual(MOCK_RESULT);
  });

  it('should send encrypted_message with action image_generation', async () => {
    const promise = generateImageWs({
      wsClient: mockWs as any,
      encryptionManager: mockEncryption as any,
      rateLimiter: mockRateLimiter as any,
      sessionId: MOCK_SESSION_ID,
      sessionKey,
      messageIndex,
      prompt: 'a cat',
    });

    // Check that sendWithoutResponse was called
    expect(mockWs.sendWithoutResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'encrypted_message',
        session_id: MOCK_SESSION_ID,
      }),
    );

    // Verify encrypted payload contains action: 'image_generation'
    const encryptCall = mockEncryption.encryptMessage.mock.calls[0];
    const plaintextSent = encryptCall[1];
    const parsed = JSON.parse(plaintextSent);
    expect(parsed.action).toBe('image_generation');

    // Resolve promise
    mockWs._simulateMessage({
      type: 'encrypted_response',
      session_id: MOCK_SESSION_ID,
      payload: {
        ciphertextHex: Buffer.from(JSON.stringify({
          type: 'image_generation_result',
          ...MOCK_RESULT,
        })).toString('hex'),
        nonceHex: '000000000000000000000000',
        aadHex: '',
      },
    });
    await promise;
  });

  it('should include prompt, size, steps in encrypted payload', async () => {
    const promise = generateImageWs({
      wsClient: mockWs as any,
      encryptionManager: mockEncryption as any,
      rateLimiter: mockRateLimiter as any,
      sessionId: MOCK_SESSION_ID,
      sessionKey,
      messageIndex,
      prompt: 'a landscape',
      options: { size: '768x1024', steps: 50 },
    });

    const encryptCall = mockEncryption.encryptMessage.mock.calls[0];
    const parsed = JSON.parse(encryptCall[1]);
    expect(parsed.prompt).toBe('a landscape');
    expect(parsed.size).toBe('768x1024');
    expect(parsed.steps).toBe(50);

    mockWs._simulateMessage({
      type: 'encrypted_response',
      session_id: MOCK_SESSION_ID,
      payload: {
        ciphertextHex: Buffer.from(JSON.stringify({
          type: 'image_generation_result',
          ...MOCK_RESULT,
        })).toString('hex'),
        nonceHex: '000000000000000000000000',
        aadHex: '',
      },
    });
    await promise;
  });

  it('should use default size 1024x1024 when not specified', async () => {
    const promise = generateImageWs({
      wsClient: mockWs as any,
      encryptionManager: mockEncryption as any,
      rateLimiter: mockRateLimiter as any,
      sessionId: MOCK_SESSION_ID,
      sessionKey,
      messageIndex,
      prompt: 'a dog',
    });

    const parsed = JSON.parse(mockEncryption.encryptMessage.mock.calls[0][1]);
    expect(parsed.size).toBe('1024x1024');

    mockWs._simulateMessage({
      type: 'encrypted_response',
      session_id: MOCK_SESSION_ID,
      payload: {
        ciphertextHex: Buffer.from(JSON.stringify({
          type: 'image_generation_result',
          ...MOCK_RESULT,
        })).toString('hex'),
        nonceHex: '000000000000000000000000',
        aadHex: '',
      },
    });
    await promise;
  });

  it('should use default steps 4 when not specified', async () => {
    const promise = generateImageWs({
      wsClient: mockWs as any,
      encryptionManager: mockEncryption as any,
      rateLimiter: mockRateLimiter as any,
      sessionId: MOCK_SESSION_ID,
      sessionKey,
      messageIndex,
      prompt: 'a bird',
    });

    const parsed = JSON.parse(mockEncryption.encryptMessage.mock.calls[0][1]);
    expect(parsed.steps).toBe(4);

    mockWs._simulateMessage({
      type: 'encrypted_response',
      session_id: MOCK_SESSION_ID,
      payload: {
        ciphertextHex: Buffer.from(JSON.stringify({
          type: 'image_generation_result',
          ...MOCK_RESULT,
        })).toString('hex'),
        nonceHex: '000000000000000000000000',
        aadHex: '',
      },
    });
    await promise;
  });

  it('should include optional model field when provided', async () => {
    const promise = generateImageWs({
      wsClient: mockWs as any,
      encryptionManager: mockEncryption as any,
      rateLimiter: mockRateLimiter as any,
      sessionId: MOCK_SESSION_ID,
      sessionKey,
      messageIndex,
      prompt: 'a fish',
      options: { model: 'flux-1-schnell' },
    });

    const parsed = JSON.parse(mockEncryption.encryptMessage.mock.calls[0][1]);
    expect(parsed.model).toBe('flux-1-schnell');

    mockWs._simulateMessage({
      type: 'encrypted_response',
      session_id: MOCK_SESSION_ID,
      payload: {
        ciphertextHex: Buffer.from(JSON.stringify({
          type: 'image_generation_result',
          ...MOCK_RESULT,
        })).toString('hex'),
        nonceHex: '000000000000000000000000',
        aadHex: '',
      },
    });
    await promise;
  });

  it('should reject with PROMPT_BLOCKED on node error', async () => {
    const promise = generateImageWs({
      wsClient: mockWs as any,
      encryptionManager: mockEncryption as any,
      rateLimiter: mockRateLimiter as any,
      sessionId: MOCK_SESSION_ID,
      sessionKey,
      messageIndex,
      prompt: 'something bad',
    });

    mockWs._simulateMessage({
      type: 'encrypted_response',
      session_id: MOCK_SESSION_ID,
      payload: {
        ciphertextHex: Buffer.from(JSON.stringify({
          type: 'image_generation_error',
          error_code: 'PROMPT_BLOCKED',
          error: 'Prompt blocked by safety',
        })).toString('hex'),
        nonceHex: '000000000000000000000000',
        aadHex: '',
      },
    });

    await expect(promise).rejects.toThrow(ImageGenerationError);
    try { await promise; } catch (e) {
      expect((e as ImageGenerationError).code).toBe('PROMPT_BLOCKED');
    }
  });

  it('should reject with DIFFUSION_SERVICE_UNAVAILABLE on node error', async () => {
    const promise = generateImageWs({
      wsClient: mockWs as any,
      encryptionManager: mockEncryption as any,
      rateLimiter: mockRateLimiter as any,
      sessionId: MOCK_SESSION_ID,
      sessionKey,
      messageIndex,
      prompt: 'a tree',
    });

    mockWs._simulateMessage({
      type: 'encrypted_response',
      session_id: MOCK_SESSION_ID,
      payload: {
        ciphertextHex: Buffer.from(JSON.stringify({
          type: 'image_generation_error',
          error_code: 'DIFFUSION_SERVICE_UNAVAILABLE',
          error: 'Diffusion service down',
        })).toString('hex'),
        nonceHex: '000000000000000000000000',
        aadHex: '',
      },
    });

    try { await promise; } catch (e) {
      expect(e).toBeInstanceOf(ImageGenerationError);
      expect((e as ImageGenerationError).code).toBe('DIFFUSION_SERVICE_UNAVAILABLE');
    }
  });

  it('should throw VALIDATION_FAILED for empty prompt', async () => {
    await expect(
      generateImageWs({
        wsClient: mockWs as any,
        encryptionManager: mockEncryption as any,
        rateLimiter: mockRateLimiter as any,
        sessionId: MOCK_SESSION_ID,
        sessionKey,
        messageIndex,
        prompt: '',
      }),
    ).rejects.toThrow(ImageGenerationError);

    try {
      await generateImageWs({
        wsClient: mockWs as any,
        encryptionManager: mockEncryption as any,
        rateLimiter: mockRateLimiter as any,
        sessionId: MOCK_SESSION_ID,
        sessionKey,
        messageIndex,
        prompt: '',
      });
    } catch (e) {
      expect((e as ImageGenerationError).code).toBe('VALIDATION_FAILED');
    }
  });

  it('should throw VALIDATION_FAILED for prompt exceeding MAX_PROMPT_LENGTH', async () => {
    const longPrompt = 'x'.repeat(MAX_PROMPT_LENGTH + 1);

    try {
      await generateImageWs({
        wsClient: mockWs as any,
        encryptionManager: mockEncryption as any,
        rateLimiter: mockRateLimiter as any,
        sessionId: MOCK_SESSION_ID,
        sessionKey,
        messageIndex,
        prompt: longPrompt,
      });
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ImageGenerationError);
      expect((e as ImageGenerationError).code).toBe('VALIDATION_FAILED');
    }
  });

  it('should throw VALIDATION_FAILED for invalid size', async () => {
    try {
      await generateImageWs({
        wsClient: mockWs as any,
        encryptionManager: mockEncryption as any,
        rateLimiter: mockRateLimiter as any,
        sessionId: MOCK_SESSION_ID,
        sessionKey,
        messageIndex,
        prompt: 'valid prompt',
        options: { size: '800x600' as any },
      });
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ImageGenerationError);
      expect((e as ImageGenerationError).code).toBe('VALIDATION_FAILED');
    }
  });

  it('should throw VALIDATION_FAILED for steps out of range', async () => {
    try {
      await generateImageWs({
        wsClient: mockWs as any,
        encryptionManager: mockEncryption as any,
        rateLimiter: mockRateLimiter as any,
        sessionId: MOCK_SESSION_ID,
        sessionKey,
        messageIndex,
        prompt: 'valid prompt',
        options: { steps: 101 },
      });
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ImageGenerationError);
      expect((e as ImageGenerationError).code).toBe('VALIDATION_FAILED');
    }
  });

  it('should throw RATE_LIMIT_EXCEEDED with retryAfter when rate limited', async () => {
    const limitedRateLimiter = createMockRateLimiter(false, 15000);

    try {
      await generateImageWs({
        wsClient: mockWs as any,
        encryptionManager: mockEncryption as any,
        rateLimiter: limitedRateLimiter as any,
        sessionId: MOCK_SESSION_ID,
        sessionKey,
        messageIndex,
        prompt: 'a mountain',
      });
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ImageGenerationError);
      expect((e as ImageGenerationError).code).toBe('RATE_LIMIT_EXCEEDED');
      expect((e as ImageGenerationError).retryAfter).toBe(15000);
    }
  });
});
