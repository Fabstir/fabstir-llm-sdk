/**
 * Error Handler
 * Comprehensive error handling with retry logic and circuit breaker
 * Max 350 lines
 */

export interface ErrorHandlerConfig {
  maxRetries?: number;
  retryDelay?: number;
  exponentialBackoff?: boolean;
  circuitBreakerThreshold?: number;
  circuitBreakerTimeout?: number;
  onError?: (error: EnrichedError) => void;
}

export interface ClassifiedError {
  type: 'network' | 'storage' | 'validation' | 'concurrency' | 'system';
  recoverable: boolean;
  retryable: boolean;
}

export interface EnrichedError extends Error {
  context?: any;
  timestamp?: number;
  classification?: ClassifiedError;
}

interface ErrorRecord {
  error: EnrichedError;
  timestamp: number;
}

export class ErrorHandler {
  private config: Required<Omit<ErrorHandlerConfig, 'onError'>> & { onError?: (error: EnrichedError) => void };
  private errorHistory: ErrorRecord[] = [];
  private circuitState: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(config: ErrorHandlerConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      exponentialBackoff: config.exponentialBackoff ?? false,
      circuitBreakerThreshold: config.circuitBreakerThreshold ?? 5,
      circuitBreakerTimeout: config.circuitBreakerTimeout ?? 60000,
      onError: config.onError
    };
  }

  /**
   * Classify error type and recoverability
   */
  classify(error: Error): ClassifiedError {
    const name = error.name.toLowerCase();
    const message = error.message.toLowerCase();

    // Network errors
    if (name.includes('network') || message.includes('network') ||
        message.includes('fetch') || message.includes('connection')) {
      return { type: 'network', recoverable: true, retryable: true };
    }

    // Storage errors
    if (name.includes('quota') || message.includes('quota') ||
        name.includes('storage') || message.includes('indexeddb')) {
      return { type: 'storage', recoverable: true, retryable: false };
    }

    // Validation errors
    if (name.includes('validation') || message.includes('invalid')) {
      return { type: 'validation', recoverable: false, retryable: false };
    }

    // Concurrency errors
    if (name.includes('conflict') || message.includes('conflict') ||
        message.includes('transaction') || message.includes('lock')) {
      return { type: 'concurrency', recoverable: true, retryable: true };
    }

    // System errors
    return { type: 'system', recoverable: false, retryable: false };
  }

  /**
   * Handle operation with retry logic
   */
  async handle<T>(operation: () => Promise<T>): Promise<T> {
    // Check circuit breaker
    if (this.circuitState === 'open') {
      const now = Date.now();
      if (now - this.lastFailureTime < this.config.circuitBreakerTimeout) {
        throw new Error('Circuit breaker is open');
      }
      // Transition to half-open
      this.circuitState = 'half-open';
    }

    let lastError: Error | null = null;
    let attempts = 0;

    while (attempts <= this.config.maxRetries) {
      try {
        const result = await operation();

        // Success - reset circuit breaker
        if (this.circuitState === 'half-open') {
          this.circuitState = 'closed';
          this.failureCount = 0;
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        attempts++;

        const classified = this.classify(lastError);

        // Always update circuit breaker on failure
        this.handleCircuitBreaker();

        // Non-retryable errors fail immediately
        if (!classified.retryable) {
          throw lastError;
        }

        // Check if we should retry
        if (attempts > this.config.maxRetries) {
          throw lastError;
        }

        // Wait before retry
        const delay = this.calculateDelay(attempts);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Handle operation with fallback
   */
  async handleWithFallback<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>
  ): Promise<T> {
    try {
      return await this.handle(operation);
    } catch (error) {
      return await fallback();
    }
  }

  /**
   * Enrich error with context
   */
  enrichError(error: Error, context: any): EnrichedError {
    const enriched: EnrichedError = error;
    enriched.context = context;
    enriched.timestamp = Date.now();
    enriched.classification = this.classify(error);
    enriched.stack = error.stack;
    return enriched;
  }

  /**
   * Record error in history
   */
  recordError(error: Error, context: any): void {
    const enriched = this.enrichError(error, context);

    this.errorHistory.push({
      error: enriched,
      timestamp: Date.now()
    });

    // Trigger callback if configured
    if (this.config.onError) {
      this.config.onError(enriched);
    }
  }

  /**
   * Get error history
   */
  getErrorHistory(): EnrichedError[] {
    return this.errorHistory.map(record => record.error);
  }

  /**
   * Get error statistics
   */
  getStats(): {
    total: number;
    byType: Record<string, number>;
  } {
    const byType: Record<string, number> = {};

    for (const record of this.errorHistory) {
      const type = record.error.context?.type || record.error.classification?.type || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
    }

    return {
      total: this.errorHistory.length,
      byType
    };
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
  }

  /**
   * Calculate retry delay
   */
  private calculateDelay(attempt: number): number {
    if (!this.config.exponentialBackoff) {
      return this.config.retryDelay;
    }

    // Exponential backoff: delay * 2^(attempt-1)
    return this.config.retryDelay * Math.pow(2, attempt - 1);
  }

  /**
   * Handle circuit breaker logic
   */
  private handleCircuitBreaker(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.circuitBreakerThreshold) {
      this.circuitState = 'open';
    }
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): 'closed' | 'open' | 'half-open' {
    return this.circuitState;
  }

  /**
   * Reset circuit breaker
   */
  resetCircuit(): void {
    this.circuitState = 'closed';
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}
