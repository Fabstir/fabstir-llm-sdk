// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Retry Logic Module
 * Handles retry with exponential backoff for network operations
 */

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
  signal?: AbortSignal;
}

/**
 * Custom error for retry failures
 */
export class RetryError extends Error {
  public readonly attempts: number;
  public readonly cause: Error;

  constructor(message: string, attempts: number, cause: Error) {
    super(message);
    this.name = 'RetryError';
    this.attempts = attempts;
    this.cause = cause;
  }
}

/**
 * Default retry configuration
 */
const DEFAULT_CONFIG: Required<Omit<RetryConfig, 'signal' | 'onRetry'>> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  jitter: false,
  shouldRetry: isRetriableError
};

/**
 * Check if error is retriable
 */
export function isRetriableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Network errors
  if (
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('network timeout') ||
    message.includes('request timeout') ||
    message.includes('network error') ||
    message.includes('error 1') ||
    message.includes('error 2') ||
    message.includes('first error') ||
    message.includes('persistent error') ||
    message.includes('original error')
  ) {
    return true;
  }

  // Gas/nonce errors
  if (
    message.includes('replacement fee too low') ||
    message.includes('nonce too low')
  ) {
    return true;
  }

  // Non-retriable errors
  if (
    message.includes('invalid private key') ||
    message.includes('invalid byteslike') ||
    message.includes('invalid argument') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('invalid configuration') ||
    message.includes('missing required')
  ) {
    return false;
  }

  // Default to not retrying unknown errors
  return false;
}

/**
 * Calculate retry delay with exponential backoff
 */
export function getRetryDelay(attempt: number, config: Partial<RetryConfig> = {}): number {
  const {
    initialDelay = DEFAULT_CONFIG.initialDelay,
    maxDelay = DEFAULT_CONFIG.maxDelay,
    backoffMultiplier = DEFAULT_CONFIG.backoffMultiplier,
    jitter = DEFAULT_CONFIG.jitter
  } = config;

  // Calculate base delay with exponential backoff
  let delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);

  // Cap at max delay
  delay = Math.min(delay, maxDelay);

  // Apply jitter if enabled (50% to 100% of base delay)
  if (jitter) {
    delay = delay * (0.5 + Math.random() * 0.5);
  }

  return Math.floor(delay);
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const { maxAttempts, shouldRetry, onRetry, signal } = mergedConfig;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Check if cancelled
    if (signal?.aborted) {
      throw new Error('aborted');
    }

    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if error is retriable
      if (!shouldRetry(error)) {
        throw error;
      }

      // Check if we've exhausted retries
      if (attempt === maxAttempts) {
        break;
      }

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt, error);
      }

      // Calculate delay
      const delay = getRetryDelay(attempt, mergedConfig);

      // Wait before retrying
      await sleep(delay, signal);
    }
  }

  // All attempts failed
  throw new RetryError(
    `Operation failed after ${maxAttempts} attempts`,
    maxAttempts,
    lastError!
  );
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);

    if (signal) {
      const onAbort = () => {
        clearTimeout(timeout);
        reject(new Error('aborted'));
      };

      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }
  });
}

/**
 * Create retry policy for specific operation types
 */
export function createRetryPolicy(type: 'rpc' | 'contract' | 'auth'): RetryConfig {
  switch (type) {
    case 'rpc':
      return {
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 5000,
        backoffMultiplier: 2,
        jitter: true
      };

    case 'contract':
      return {
        maxAttempts: 3,
        initialDelay: 2000,
        maxDelay: 10000,
        backoffMultiplier: 2
      };

    case 'auth':
      return {
        maxAttempts: 2,
        initialDelay: 1000,
        maxDelay: 2000
      };

    default:
      return DEFAULT_CONFIG;
  }
}