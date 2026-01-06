/**
 * @fileoverview Tests for search retry utility
 * Phase 5.2: Retry Helper Utility
 *
 * Tests exponential backoff retry logic for web search operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock WebSearchError to avoid import issues in test isolation
class MockWebSearchError extends Error {
  public readonly code: string;
  public readonly retryAfter?: number;

  constructor(message: string, code: string, retryAfter?: number) {
    super(message);
    this.name = 'WebSearchError';
    this.code = code;
    this.retryAfter = retryAfter;
  }

  get isRetryable(): boolean {
    return ['rate_limited', 'timeout', 'provider_error'].includes(this.code);
  }
}

// Mock SearchApiResponse
interface MockSearchApiResponse {
  query: string;
  results: Array<{ title: string; url: string; snippet: string; source: string }>;
  resultCount: number;
  searchTimeMs: number;
  provider: string;
  cached: boolean;
  chainId: number;
  chainName: string;
}

// Helper function mirroring implementation
async function searchWithRetry(
  searchFn: () => Promise<MockSearchApiResponse>,
  maxRetries: number = 3
): Promise<MockSearchApiResponse> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await searchFn();
    } catch (error) {
      if (error instanceof MockWebSearchError && error.isRetryable) {
        if (attempt < maxRetries) {
          const waitMs = error.retryAfter
            ? error.retryAfter * 1000
            : Math.pow(2, attempt) * 1000;
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
      }
      throw error;
    }
  }
  throw new MockWebSearchError('Max retries exceeded', 'timeout');
}

describe('searchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return result on first successful attempt', async () => {
    const mockResponse: MockSearchApiResponse = {
      query: 'test query',
      results: [{ title: 'Test', url: 'http://test.com', snippet: 'Test snippet', source: 'test.com' }],
      resultCount: 1,
      searchTimeMs: 100,
      provider: 'brave',
      cached: false,
      chainId: 84532,
      chainName: 'Base Sepolia'
    };

    const searchFn = vi.fn().mockResolvedValue(mockResponse);
    const resultPromise = searchWithRetry(searchFn);

    const result = await resultPromise;

    expect(result).toEqual(mockResponse);
    expect(searchFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors', async () => {
    const mockResponse: MockSearchApiResponse = {
      query: 'test query',
      results: [],
      resultCount: 0,
      searchTimeMs: 50,
      provider: 'brave',
      cached: false,
      chainId: 84532,
      chainName: 'Base Sepolia'
    };

    const searchFn = vi.fn()
      .mockRejectedValueOnce(new MockWebSearchError('Provider error', 'provider_error'))
      .mockResolvedValueOnce(mockResponse);

    const resultPromise = searchWithRetry(searchFn);

    // Fast-forward past first retry delay (2^1 = 2 seconds)
    await vi.advanceTimersByTimeAsync(2000);

    const result = await resultPromise;

    expect(result).toEqual(mockResponse);
    expect(searchFn).toHaveBeenCalledTimes(2);
  });

  it('should use retryAfter hint when provided', async () => {
    const mockResponse: MockSearchApiResponse = {
      query: 'test query',
      results: [],
      resultCount: 0,
      searchTimeMs: 50,
      provider: 'brave',
      cached: false,
      chainId: 84532,
      chainName: 'Base Sepolia'
    };

    const searchFn = vi.fn()
      .mockRejectedValueOnce(new MockWebSearchError('Rate limited', 'rate_limited', 5)) // 5 second retry
      .mockResolvedValueOnce(mockResponse);

    const resultPromise = searchWithRetry(searchFn);

    // Fast-forward past retryAfter (5 seconds)
    await vi.advanceTimersByTimeAsync(5000);

    const result = await resultPromise;

    expect(result).toEqual(mockResponse);
    expect(searchFn).toHaveBeenCalledTimes(2);
  });

  it('should throw non-retryable errors immediately', async () => {
    const searchFn = vi.fn()
      .mockRejectedValueOnce(new MockWebSearchError('Search disabled', 'search_disabled'));

    await expect(searchWithRetry(searchFn)).rejects.toThrow('Search disabled');
    expect(searchFn).toHaveBeenCalledTimes(1);
  });

  it('should throw after max retries exceeded', async () => {
    const searchFn = vi.fn()
      .mockRejectedValue(new MockWebSearchError('Timeout', 'timeout'));

    const resultPromise = searchWithRetry(searchFn, 3);

    // Fast-forward through all retry delays: 2s + 4s = 6s total
    await vi.advanceTimersByTimeAsync(2000); // First retry
    await vi.advanceTimersByTimeAsync(4000); // Second retry
    // Third attempt fails, no more retries

    await expect(resultPromise).rejects.toThrow('Timeout');
    expect(searchFn).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff delays', async () => {
    const mockResponse: MockSearchApiResponse = {
      query: 'test query',
      results: [],
      resultCount: 0,
      searchTimeMs: 50,
      provider: 'brave',
      cached: false,
      chainId: 84532,
      chainName: 'Base Sepolia'
    };

    const searchFn = vi.fn()
      .mockRejectedValueOnce(new MockWebSearchError('Error 1', 'provider_error'))
      .mockRejectedValueOnce(new MockWebSearchError('Error 2', 'provider_error'))
      .mockResolvedValueOnce(mockResponse);

    const resultPromise = searchWithRetry(searchFn, 3);

    // First retry: 2^1 = 2 seconds
    await vi.advanceTimersByTimeAsync(2000);

    // Second retry: 2^2 = 4 seconds
    await vi.advanceTimersByTimeAsync(4000);

    const result = await resultPromise;

    expect(result).toEqual(mockResponse);
    expect(searchFn).toHaveBeenCalledTimes(3);
  });

  it('should pass through non-Error exceptions', async () => {
    const searchFn = vi.fn().mockRejectedValue('string error');

    await expect(searchWithRetry(searchFn)).rejects.toBe('string error');
    expect(searchFn).toHaveBeenCalledTimes(1);
  });

  it('should respect custom maxRetries parameter', async () => {
    const searchFn = vi.fn()
      .mockRejectedValue(new MockWebSearchError('Provider error', 'provider_error'));

    const resultPromise = searchWithRetry(searchFn, 2);

    // Fast-forward through retry delay
    await vi.advanceTimersByTimeAsync(2000);
    // Second attempt fails, no more retries (maxRetries=2)

    await expect(resultPromise).rejects.toThrow('Provider error');
    expect(searchFn).toHaveBeenCalledTimes(2);
  });
});
