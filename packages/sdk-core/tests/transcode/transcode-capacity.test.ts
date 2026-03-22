import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchTranscodeCapacity } from '../../src/utils/transcode-capacity';
import { TranscodeError } from '../../src/errors/transcode-errors';

describe('fetchTranscodeCapacity', () => {
  const mockFetch = vi.fn();
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    origFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  const validCapacity = { active: 2, max: 5, available: 3, sidecarConnected: true };

  it('returns TranscodeCapacity on successful fetch', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => validCapacity });
    const result = await fetchTranscodeCapacity('http://host1:8080');
    expect(result).toEqual(validCapacity);
  });

  it('uses 3-second timeout by default', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(new AbortController().signal);
    mockFetch.mockResolvedValue({ ok: true, json: async () => validCapacity });
    await fetchTranscodeCapacity('http://host1:8080');
    expect(timeoutSpy).toHaveBeenCalledWith(3000);
  });

  it('throws TranscodeError with TRANSCODE_FAILED on non-200 response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });
    await expect(fetchTranscodeCapacity('http://host1:8080'))
      .rejects.toThrow(TranscodeError);
    await expect(fetchTranscodeCapacity('http://host1:8080'))
      .rejects.toMatchObject({ code: 'TRANSCODE_FAILED' });
  });

  it('throws TranscodeError with TRANSCODE_FAILED on network error', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));
    await expect(fetchTranscodeCapacity('http://host1:8080'))
      .rejects.toThrow(TranscodeError);
    await expect(fetchTranscodeCapacity('http://host1:8080'))
      .rejects.toMatchObject({ code: 'TRANSCODE_FAILED' });
  });

  it('constructs correct URL from host URL (strips trailing slash)', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => validCapacity });
    await fetchTranscodeCapacity('http://host1:8080///');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://host1:8080/v1/transcode/capacity',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('accepts custom timeoutMs', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(new AbortController().signal);
    mockFetch.mockResolvedValue({ ok: true, json: async () => validCapacity });
    await fetchTranscodeCapacity('http://host1:8080', 7000);
    expect(timeoutSpy).toHaveBeenCalledWith(7000);
  });
});
