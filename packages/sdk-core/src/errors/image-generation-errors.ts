/**
 * @fileoverview Image generation error class
 *
 * Custom error class for image generation failures with retry support.
 */

import type { ImageGenerationErrorCode } from '../types/image-generation.types';

/** Error codes that are retryable (transient failures) */
const RETRYABLE_CODES: ImageGenerationErrorCode[] = [
  'RATE_LIMIT_EXCEEDED',
  'IMAGE_GENERATION_FAILED',
];

/**
 * Error class for image generation failures.
 *
 * @example
 * ```typescript
 * throw new ImageGenerationError('Rate limited', 'RATE_LIMIT_EXCEEDED', 5000);
 * ```
 */
export class ImageGenerationError extends Error {
  public readonly code: ImageGenerationErrorCode;
  public readonly retryAfter?: number;

  constructor(message: string, code: ImageGenerationErrorCode, retryAfter?: number) {
    super(message);
    this.name = 'ImageGenerationError';
    this.code = code;
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, ImageGenerationError.prototype);
  }

  /**
   * Whether this error is retryable (transient failure).
   * Rate limiting and generation failures can be retried.
   */
  get isRetryable(): boolean {
    return RETRYABLE_CODES.includes(this.code);
  }
}
