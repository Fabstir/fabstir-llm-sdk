/**
 * @fileoverview Tests for HostManager image generation capability detection
 * Sub-phase 2.2: HostManager Integration
 *
 * Tests that HostManager can detect image generation capabilities from host's
 * /v1/version endpoint and return properly typed ImageGenerationCapabilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ImageGenerationCapabilities } from '../../src/types/image-generation.types';

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { getImageGenerationCapabilitiesFromHost } from '../../src/utils/host-image-generation-capabilities';

describe('HostManager getImageGenerationCapabilities', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('should return capabilities from host with image gen support', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: '8.16.0',
        features: ['image-generation', 'websocket-image-generation', 'http-image-generation']
      })
    });
    const caps = await getImageGenerationCapabilitiesFromHost('http://localhost:8080');
    expect(caps.supportsImageGeneration).toBe(true);
    expect(caps.supportsEncryptedWebSocket).toBe(true);
    expect(caps.supportsHttp).toBe(true);
  });

  it('should return all-false when host lacks image gen features', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '8.15.0', features: ['streaming'] })
    });
    const caps = await getImageGenerationCapabilitiesFromHost('http://localhost:8080');
    expect(caps.supportsImageGeneration).toBe(false);
    expect(caps.supportsEncryptedWebSocket).toBe(false);
    expect(caps.supportsHttp).toBe(false);
  });

  it('should use provided apiUrl when given (skips contract lookup)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: '8.16.0',
        features: ['image-generation']
      })
    });
    const caps = await getImageGenerationCapabilitiesFromHost('http://custom:9090');
    expect(mockFetch).toHaveBeenCalledWith('http://custom:9090/v1/version');
    expect(caps.supportsImageGeneration).toBe(true);
  });

  it('should resolve apiUrl from contract when not provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: '8.16.0',
        features: ['image-generation', 'websocket-image-generation']
      })
    });
    const caps = await getImageGenerationCapabilitiesFromHost('http://host-from-contract:8080');
    expect(mockFetch).toHaveBeenCalledWith('http://host-from-contract:8080/v1/version');
    expect(caps.supportsImageGeneration).toBe(true);
  });

  it('should return all-false when host info resolution fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
    const caps = await getImageGenerationCapabilitiesFromHost('http://unreachable:8080');
    expect(caps.supportsImageGeneration).toBe(false);
    expect(caps.supportsEncryptedWebSocket).toBe(false);
  });
});
