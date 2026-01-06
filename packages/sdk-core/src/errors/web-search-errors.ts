/**
 * @fileoverview Web search error class
 *
 * Custom error class for web search failures with retry support.
 */

import type { WebSearchErrorCode } from '../types/web-search.types';

/** Error codes that are retryable (transient failures) */
const RETRYABLE_CODES: WebSearchErrorCode[] = [
  'rate_limited',
  'timeout',
  'provider_error',
];

/**
 * Error class for web search failures.
 *
 * @example
 * ```typescript
 * throw new WebSearchError('Rate limited', 'rate_limited', 30);
 * ```
 */
export class WebSearchError extends Error {
  public readonly code: WebSearchErrorCode;
  public readonly retryAfter?: number;

  constructor(message: string, code: WebSearchErrorCode, retryAfter?: number) {
    super(message);
    this.name = 'WebSearchError';
    this.code = code;
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, WebSearchError.prototype);
  }

  /**
   * Whether this error is retryable (transient failure).
   * Rate limiting, timeouts, and provider errors can be retried.
   */
  get isRetryable(): boolean {
    return RETRYABLE_CODES.includes(this.code);
  }
}
