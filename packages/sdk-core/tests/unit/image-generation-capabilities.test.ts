import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ImageGenerationCapabilities } from '../../src/types/image-generation.types';

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { getImageGenerationCapabilitiesFromHost } from '../../src/utils/host-image-generation-capabilities';

describe('getImageGenerationCapabilitiesFromHost', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('should return full capabilities when host has all image gen feature flags', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: '8.16.0',
        features: [
          'image-generation',
          'websocket-image-generation',
          'http-image-generation',
          'prompt-safety-classifier',
          'output-safety-classifier',
          'image-generation-billing',
          'image-content-hashes',
        ]
      })
    });
    const caps = await getImageGenerationCapabilitiesFromHost('http://localhost:8080');
    expect(caps.supportsImageGeneration).toBe(true);
    expect(caps.supportsEncryptedWebSocket).toBe(true);
    expect(caps.supportsHttp).toBe(true);
    expect(caps.hasSafetyClassifier).toBe(true);
    expect(caps.hasOutputClassifier).toBe(true);
    expect(caps.hasBilling).toBe(true);
    expect(caps.hasContentHashes).toBe(true);
  });

  it('should return only supportsImageGeneration when host has only image-generation flag', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '8.16.0', features: ['image-generation'] })
    });
    const caps = await getImageGenerationCapabilitiesFromHost('http://localhost:8080');
    expect(caps.supportsImageGeneration).toBe(true);
    expect(caps.supportsEncryptedWebSocket).toBe(false);
    expect(caps.supportsHttp).toBe(false);
    expect(caps.hasSafetyClassifier).toBe(false);
  });

  it('should detect safety classifier flags', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: '8.16.0',
        features: ['image-generation', 'prompt-safety-classifier', 'output-safety-classifier']
      })
    });
    const caps = await getImageGenerationCapabilitiesFromHost('http://localhost:8080');
    expect(caps.hasSafetyClassifier).toBe(true);
    expect(caps.hasOutputClassifier).toBe(true);
  });

  it('should return all false when host lacks image gen features', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '8.15.0', features: ['streaming', 'web-search'] })
    });
    const caps = await getImageGenerationCapabilitiesFromHost('http://localhost:8080');
    expect(caps.supportsImageGeneration).toBe(false);
  });

  it('should return all false with empty features array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '8.15.0', features: [] })
    });
    const caps = await getImageGenerationCapabilitiesFromHost('http://localhost:8080');
    expect(caps.supportsImageGeneration).toBe(false);
  });

  it('should return all false when no features property', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '8.15.0' })
    });
    const caps = await getImageGenerationCapabilitiesFromHost('http://localhost:8080');
    expect(caps.supportsImageGeneration).toBe(false);
  });

  it('should return all false on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const caps = await getImageGenerationCapabilitiesFromHost('http://localhost:8080');
    expect(caps.supportsImageGeneration).toBe(false);
  });

  it('should return all false on non-OK HTTP response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const caps = await getImageGenerationCapabilitiesFromHost('http://localhost:8080');
    expect(caps.supportsImageGeneration).toBe(false);
  });

  it('should return all false on JSON parse error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error('Invalid JSON'); }
    });
    const caps = await getImageGenerationCapabilitiesFromHost('http://localhost:8080');
    expect(caps.supportsImageGeneration).toBe(false);
  });
});
