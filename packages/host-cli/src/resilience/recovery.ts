import { FallbackManager } from './fallback';
import { ethers } from 'ethers';
import EventEmitter from 'events';

export interface RecoveryConfig {
  fallbackManager: FallbackManager;
  maxRetries?: number;
  retryDelay?: number;
  timeoutMs?: number;
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  factor?: number;
}

export interface RecoveryStatistics {
  totalAttempts: number;
  successfulRecoveries: number;
  failures: number;
  successRate: number;
}

export class NetworkRecovery {
  private config: Required<RecoveryConfig>;
  private connectionPool: Map<string, ethers.Provider>;
  private eventEmitter?: EventEmitter;
  private statistics: {
    totalAttempts: number;
    successfulRecoveries: number;
    failures: number;
  };

  constructor(config: RecoveryConfig) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      timeoutMs: 30000,
      ...config
    };

    this.connectionPool = new Map();
    this.statistics = {
      totalAttempts: 0,
      successfulRecoveries: 0,
      failures: 0
    };
  }

  setEventEmitter(emitter: EventEmitter): void {
    this.eventEmitter = emitter;
  }

  isNetworkError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    return (
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('etimedout') ||
      message.includes('network')
    );
  }

  isTimeoutError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    return message.includes('timeout') || message.includes('timed out');
  }

  isRpcError(error: any): boolean {
    return typeof error?.code === 'number' && error.code < 0;
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = this.config.maxRetries,
      baseDelay = this.config.retryDelay,
      maxDelay = 30000,
      factor = 2
    } = options;

    let lastError: Error | undefined;
    let delay = baseDelay;

    this.eventEmitter?.emit('recovery:started', { operation, options });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.statistics.totalAttempts++;

        if (attempt > 0) {
          await this.sleep(delay);
          delay = Math.min(delay * factor, maxDelay);
          // Emit recovery started on retry attempt
          this.eventEmitter?.emit('recovery:started', { attempt });
        }

        const result = await operation();

        if (attempt > 0) {
          this.statistics.successfulRecoveries++;
          this.eventEmitter?.emit('recovery:success', { attempt, result });
        }

        return result;
      } catch (error: any) {
        lastError = error;

        if (attempt === maxRetries) {
          this.statistics.failures++;
          this.eventEmitter?.emit('recovery:failed', { error, attempts: attempt + 1 });
          break;
        }

        if (!this.isRecoverableError(error)) {
          this.statistics.failures++;
          this.eventEmitter?.emit('recovery:failed', { error, attempts: attempt + 1 });
          throw error;
        }
      }
    }

    throw new Error(`Maximum retries exceeded: ${lastError?.message}`);
  }

  private isRecoverableError(error: any): boolean {
    return (
      this.isNetworkError(error) ||
      this.isTimeoutError(error) ||
      this.isRpcError(error)
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async addConnection(endpoint: string, provider: ethers.Provider): Promise<void> {
    this.connectionPool.set(endpoint, provider);
  }

  async getHealthyConnection(): Promise<ethers.Provider | null> {
    for (const [endpoint, provider] of this.connectionPool.entries()) {
      try {
        await provider.getBlockNumber();
        return provider;
      } catch {
        this.connectionPool.delete(endpoint);
      }
    }
    return null;
  }

  getConnectionPool(): Map<string, ethers.Provider> {
    return this.connectionPool;
  }

  getStatistics(): RecoveryStatistics {
    const total = this.statistics.successfulRecoveries + this.statistics.failures;
    const successRate = total === 0 ? 100 :
      (this.statistics.successfulRecoveries / total) * 100;

    return {
      ...this.statistics,
      successRate
    };
  }

  recordSuccess(): void {
    this.statistics.successfulRecoveries++;
  }

  recordFailure(): void {
    this.statistics.failures++;
  }
}