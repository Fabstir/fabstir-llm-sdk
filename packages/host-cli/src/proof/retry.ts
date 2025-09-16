import { EventEmitter } from 'events';
import { ProofData } from './submitter';

export interface RetryOptions {
  submitFn: (proof: ProofData) => Promise<any>;
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: number;
}

export interface RetryItem {
  proof: ProofData;
  attempts: number;
  lastAttempt?: number;
  lastError?: string;
  priority?: number;
}

export interface RetryStatistics {
  totalRetries: number;
  successfulRetries: number;
  failedRetries: number;
  currentQueueSize: number;
  successRate: number;
}

export interface CircuitBreakerConfig {
  threshold: number;
  resetTimeout: number;
}

interface CircuitState {
  failures: number;
  lastFailure?: Date;
  isOpen: boolean;
  resetTimer?: NodeJS.Timer;
}

export class ProofRetryManager extends EventEmitter {
  private options: Required<RetryOptions>;
  private retryQueue: RetryItem[] = [];
  private statistics: RetryStatistics = {
    totalRetries: 0,
    successfulRetries: 0,
    failedRetries: 0,
    currentQueueSize: 0,
    successRate: 0
  };
  private autoRetryTimer?: NodeJS.Timer;
  private circuitBreaker?: CircuitState;
  private circuitBreakerConfig?: CircuitBreakerConfig;
  private jitter: number = 0;

  constructor(options: RetryOptions) {
    super();
    this.options = {
      submitFn: options.submitFn,
      maxAttempts: options.maxAttempts || 3,
      initialDelay: options.initialDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      backoffMultiplier: options.backoffMultiplier || 2,
      jitter: options.jitter || 0
    };
    this.jitter = this.options.jitter;
  }

  /**
   * Add proof to retry queue
   */
  addToRetryQueue(proof: ProofData, priority: number = 0): void {
    const item: RetryItem = {
      proof,
      attempts: 0,
      priority
    };

    // Insert based on priority
    let inserted = false;
    for (let i = 0; i < this.retryQueue.length; i++) {
      if ((this.retryQueue[i].priority || 0) < priority) {
        this.retryQueue.splice(i, 0, item);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      this.retryQueue.push(item);
    }

    this.statistics.currentQueueSize = this.retryQueue.length;
    this.emit('proof-queued', { proof, queueSize: this.retryQueue.length });
  }

  /**
   * Get retry queue
   */
  getRetryQueue(): RetryItem[] {
    return [...this.retryQueue];
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.retryQueue.length;
  }

  /**
   * Increment attempts for a proof
   */
  incrementAttempts(sessionId: string): void {
    const item = this.retryQueue.find(i => i.proof.sessionId === sessionId);
    if (item) {
      item.attempts++;
      item.lastAttempt = Date.now();
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  getRetryDelay(attempt: number): number {
    const baseDelay = Math.min(
      this.options.initialDelay * Math.pow(this.options.backoffMultiplier, attempt),
      this.options.maxDelay
    );

    // Apply jitter if configured
    if (this.jitter > 0) {
      const jitterAmount = baseDelay * this.jitter;
      const minDelay = baseDelay - jitterAmount;
      const maxDelay = baseDelay + jitterAmount;
      return Math.floor(minDelay + Math.random() * (maxDelay - minDelay));
    }

    return baseDelay;
  }

  /**
   * Set jitter factor
   */
  setJitter(jitter: number): void {
    this.jitter = Math.max(0, Math.min(1, jitter));
  }

  /**
   * Process retry queue
   */
  async processRetryQueue(): Promise<void> {
    if (this.isCircuitOpen()) {
      this.emit('circuit-open');
      return;
    }

    const items = [...this.retryQueue];
    this.retryQueue = [];
    this.statistics.currentQueueSize = 0;

    for (const item of items) {
      if (item.attempts >= this.options.maxAttempts) {
        this.handleExhausted(item);
        continue;
      }

      await this.retryProof(item);
    }
  }

  /**
   * Process one retry from queue
   */
  async processOneRetry(): Promise<boolean> {
    if (this.isCircuitOpen()) {
      return false;
    }

    const item = this.retryQueue.shift();
    if (!item) {
      return false;
    }

    this.statistics.currentQueueSize = this.retryQueue.length;

    if (item.attempts >= this.options.maxAttempts) {
      this.handleExhausted(item);
      return true;
    }

    await this.retryProof(item);
    return true;
  }

  /**
   * Retry a proof
   */
  private async retryProof(item: RetryItem): Promise<void> {
    item.attempts++;
    item.lastAttempt = Date.now();
    this.statistics.totalRetries++;

    const nextDelay = this.getRetryDelay(item.attempts);

    this.emit('retry-attempt', {
      proof: item.proof,
      attempt: item.attempts,
      nextDelay
    });

    try {
      const result = await this.options.submitFn(item.proof);

      this.statistics.successfulRetries++;
      this.updateSuccessRate();

      if (this.circuitBreaker) {
        this.circuitBreaker.failures = 0;
      }

      this.emit('retry-success', {
        proof: item.proof,
        attempts: item.attempts,
        result
      });

    } catch (error: any) {
      item.lastError = error.message;
      this.statistics.failedRetries++;
      this.updateSuccessRate();

      if (this.circuitBreaker) {
        this.handleCircuitBreakerFailure();
      }

      if (item.attempts < this.options.maxAttempts) {
        // Re-queue for retry
        this.retryQueue.push(item);
        this.statistics.currentQueueSize = this.retryQueue.length;

        this.emit('retry-failed', {
          proof: item.proof,
          attempt: item.attempts,
          error: error.message,
          willRetry: true,
          nextDelay
        });
      } else {
        this.handleExhausted(item);
      }
    }
  }

  /**
   * Handle exhausted retries
   */
  private handleExhausted(item: RetryItem): void {
    this.emit('retry-exhausted', {
      proof: item.proof,
      attempts: item.attempts || this.options.maxAttempts,
      lastError: item.lastError
    });
  }

  /**
   * Start automatic retry processing
   */
  startAutoRetry(interval: number): void {
    if (this.autoRetryTimer) {
      clearInterval(this.autoRetryTimer);
    }

    this.autoRetryTimer = setInterval(async () => {
      if (this.retryQueue.length > 0) {
        await this.processRetryQueue();
      }
    }, interval);

    this.emit('auto-retry-started', { interval });
  }

  /**
   * Stop automatic retry processing
   */
  stopAutoRetry(): void {
    if (this.autoRetryTimer) {
      clearInterval(this.autoRetryTimer);
      this.autoRetryTimer = undefined;
      this.emit('auto-retry-stopped');
    }
  }

  /**
   * Check if auto-retry is enabled
   */
  isAutoRetryEnabled(): boolean {
    return !!this.autoRetryTimer;
  }

  /**
   * Enable circuit breaker
   */
  enableCircuitBreaker(config: CircuitBreakerConfig): void {
    this.circuitBreakerConfig = config;
    this.circuitBreaker = {
      failures: 0,
      isOpen: false
    };
  }

  /**
   * Check if circuit is open
   */
  isCircuitOpen(): boolean {
    return this.circuitBreaker?.isOpen || false;
  }

  /**
   * Handle circuit breaker failure
   */
  private handleCircuitBreakerFailure(): void {
    if (!this.circuitBreaker || !this.circuitBreakerConfig) {
      return;
    }

    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = new Date();

    if (this.circuitBreaker.failures >= this.circuitBreakerConfig.threshold) {
      this.openCircuit();
    }
  }

  /**
   * Open the circuit
   */
  private openCircuit(): void {
    if (!this.circuitBreaker || !this.circuitBreakerConfig) {
      return;
    }

    this.circuitBreaker.isOpen = true;
    this.emit('circuit-opened');

    // Schedule circuit reset
    this.circuitBreaker.resetTimer = setTimeout(() => {
      if (this.circuitBreaker) {
        this.circuitBreaker.isOpen = false;
        this.circuitBreaker.failures = 0;
        this.emit('circuit-closed');
      }
    }, this.circuitBreakerConfig.resetTimeout);
  }

  /**
   * Get statistics
   */
  getStatistics(): RetryStatistics {
    return { ...this.statistics };
  }

  /**
   * Update success rate
   */
  private updateSuccessRate(): void {
    if (this.statistics.totalRetries > 0) {
      this.statistics.successRate =
        this.statistics.successfulRetries / this.statistics.totalRetries;
    }
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.statistics = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      currentQueueSize: this.retryQueue.length,
      successRate: 0
    };
  }

  /**
   * Stop and cleanup
   */
  stop(): void {
    this.stopAutoRetry();
    if (this.circuitBreaker?.resetTimer) {
      clearTimeout(this.circuitBreaker.resetTimer);
    }
    this.removeAllListeners();
  }
}