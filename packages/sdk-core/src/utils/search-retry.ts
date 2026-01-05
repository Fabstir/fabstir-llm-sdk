/**
 * @fileoverview Search retry utility with exponential backoff
 *
 * Provides retry logic for web search operations with support for:
 * - Exponential backoff delays
 * - Retry-After header hints from rate limiting
 * - Retryable vs non-retryable error classification
 */

import { WebSearchError } from '../errors/web-search-errors';
import type { SearchApiResponse } from '../types/web-search.types';

/**
 * Execute a search function with automatic retries for transient failures.
 *
 * Uses exponential backoff (2^attempt seconds) or respects Retry-After hints.
 * Only retries on retryable errors (rate_limited, timeout, provider_error).
 *
 * @param searchFn - Async function that performs the search
 * @param maxRetries - Maximum number of attempts (default: 3)
 * @returns Search results if successful
 * @throws Original error after max retries or non-retryable error
 *
 * @example
 * ```typescript
 * const results = await searchWithRetry(
 *   () => sessionManager.searchDirect(hostUrl, 'query'),
 *   3
 * );
 * ```
 */
export async function searchWithRetry(
  searchFn: () => Promise<SearchApiResponse>,
  maxRetries: number = 3
): Promise<SearchApiResponse> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await searchFn();
    } catch (error) {
      // Only retry WebSearchError with retryable codes
      if (error instanceof WebSearchError && error.isRetryable) {
        if (attempt < maxRetries) {
          // Use Retry-After hint if provided, otherwise exponential backoff
          const waitMs = error.retryAfter
            ? error.retryAfter * 1000
            : Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, waitMs));
          continue;
        }
      }
      // Non-retryable error or max retries exceeded - throw
      throw error;
    }
  }
  // This shouldn't be reached, but throw for safety
  throw new WebSearchError('Max retries exceeded', 'timeout');
}
