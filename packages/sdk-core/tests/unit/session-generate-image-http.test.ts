/**
 * @fileoverview Tests for SessionManager.generateImageHttp()
 * Sub-phase 3.2: HTTP Image Generation Path
 *
 * Tests the HTTP-based image generation method with mock fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ImageGenerationResult, ImageGenerationOptions } from '../../src/types/image-generation.types';
import { ImageGenerationError } from '../../src/errors/image-generation-errors';

// We test the standalone function that will be added to SessionManager
// Import directly to test in isolation
import { generateImageHttp } from '../../src/utils/image-generation-http';

const MOCK_HOST_URL = 'https://host.example.com';

const MOCK_RESULT: ImageGenerationResult = {
  image: 'base64imagedata',
  model: 'stable-diffusion-xl',
  size: '1024x1024',
  steps: 30,
  seed: 12345,
  processingTimeMs: 4500,
  safety: { promptSafe: true, outputSafe: true, safetyLevel: 'strict' },
  billing: { generationUnits: 10, modelMultiplier: 1.0, megapixels: 1.05, steps: 30 },
  provider: 'host-1',
  chainId: 84532,
  chainName: 'Base Sepolia',
  nativeToken: 'ETH',
};

describe('generateImageHttp', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return parsed ImageGenerationResult on 200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_RESULT,
    });

    const result = await generateImageHttp(MOCK_HOST_URL, 'a beautiful sunset');
    expect(result).toEqual(MOCK_RESULT);
  });

  it('should send POST to /v1/images/generate with correct body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_RESULT,
    });

    await generateImageHttp(MOCK_HOST_URL, 'a cat on a roof', {
      model: 'sdxl',
      size: '512x512',
      steps: 20,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${MOCK_HOST_URL}/v1/images/generate`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.prompt).toBe('a cat on a roof');
    expect(body.model).toBe('sdxl');
    expect(body.size).toBe('512x512');
    expect(body.steps).toBe(20);
  });

  it('should use default size 1024x1024 when not specified', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_RESULT,
    });

    await generateImageHttp(MOCK_HOST_URL, 'a dog');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.size).toBe('1024x1024');
  });

  it('should include optional model field in request body when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_RESULT,
    });

    await generateImageHttp(MOCK_HOST_URL, 'a bird', { model: 'flux-1' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('flux-1');
  });

  it('should throw PROMPT_BLOCKED on 400 with blocked in body', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Prompt blocked by safety filter',
    });

    try {
      await generateImageHttp(MOCK_HOST_URL, 'some prompt');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ImageGenerationError);
      expect((e as ImageGenerationError).code).toBe('PROMPT_BLOCKED');
    }
  });

  it('should throw VALIDATION_FAILED on 400 without blocked', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Invalid request parameters',
    });

    try {
      await generateImageHttp(MOCK_HOST_URL, 'some prompt');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ImageGenerationError);
      expect((e as ImageGenerationError).code).toBe('VALIDATION_FAILED');
    }
  });

  it('should throw DIFFUSION_SERVICE_UNAVAILABLE on 503', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
    });

    try {
      await generateImageHttp(MOCK_HOST_URL, 'some prompt');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ImageGenerationError);
      expect((e as ImageGenerationError).code).toBe('DIFFUSION_SERVICE_UNAVAILABLE');
    }
  });

  it('should throw IMAGE_GENERATION_FAILED on 500', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal server error',
    });

    try {
      await generateImageHttp(MOCK_HOST_URL, 'some prompt');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ImageGenerationError);
      expect((e as ImageGenerationError).code).toBe('IMAGE_GENERATION_FAILED');
    }
  });

  it('should throw VALIDATION_FAILED for empty prompt (client-side)', async () => {
    try {
      await generateImageHttp(MOCK_HOST_URL, '');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ImageGenerationError);
      expect((e as ImageGenerationError).code).toBe('VALIDATION_FAILED');
    }

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should throw VALIDATION_FAILED for prompt exceeding 2000 chars (client-side)', async () => {
    const longPrompt = 'x'.repeat(2001);

    try {
      await generateImageHttp(MOCK_HOST_URL, longPrompt);
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ImageGenerationError);
      expect((e as ImageGenerationError).code).toBe('VALIDATION_FAILED');
    }

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
