import EventEmitter from 'events';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenMaxCalls?: number;
  monitoringWindow?: number;
  eventEmitter?: EventEmitter;
}

export interface CircuitStatistics {
  consecutiveFailures: number;
  failureRate: number;
}

export interface CircuitMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  rejectedCalls: number;
  averageResponseTime: number;
}

export interface HalfOpenStats {
  successRate: number;
}

export interface RollingWindow {
  callsInWindow: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private config: Required<CircuitBreakerConfig>;
  private consecutiveFailures = 0;
  private lastFailureTime?: number;
  private halfOpenCalls = 0;
  private halfOpenSuccesses = 0;
  private halfOpenFailures = 0;
  private fallback?: (context?: any) => Promise<any>;
  private resetTimer?: NodeJS.Timeout;

  private metrics = {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    rejectedCalls: 0,
    responseTimes: [] as number[],
    windowStartTime: Date.now()
  };

  private rollingWindow: Array<{ timestamp: number; success: boolean }> = [];

  constructor(config: CircuitBreakerConfig = {}) {
    this.config = {
      failureThreshold: 3,
      resetTimeout: 5000,
      halfOpenMaxCalls: 2,
      monitoringWindow: 60000,
      eventEmitter: config.eventEmitter || new EventEmitter(),
      ...config
    };

    this.startResetTimer();
  }

  async execute<T>(operation: () => Promise<T>, context?: any): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.fallback) {
        this.metrics.rejectedCalls++;
        return this.fallback(context);
      }
      this.metrics.rejectedCalls++;
      throw new Error('Circuit breaker is OPEN');
    }

    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        if (this.fallback) {
          this.metrics.rejectedCalls++;
          return this.fallback(context);
        }
        this.metrics.rejectedCalls++;
        throw new Error('Half-open call limit reached');
      }
      this.halfOpenCalls++;
    }

    const startTime = Date.now();

    try {
      const result = await operation();

      this.recordSuccess(Date.now() - startTime);

      if (this.state === 'HALF_OPEN') {
        this.halfOpenSuccesses++;

        // Check if we've completed all test calls
        if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
          // Evaluate success rate
          const successRate = this.halfOpenSuccesses / this.halfOpenCalls;
          if (successRate > 0.5) { // > 50% success rate threshold
            this.close();
          } else {
            this.open();
          }
        }
      }

      return result;
    } catch (error) {
      this.recordFailure(error);

      if (this.state === 'HALF_OPEN') {
        this.halfOpenFailures++;
        // Immediately open on first failure (fail-fast)
        this.open();
      }

      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  isOpen(): boolean {
    return this.state === 'OPEN';
  }

  trip(): void {
    this.open();
  }

  reset(): void {
    this.close();
  }

  forceClose(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.halfOpenCalls = 0;
    this.halfOpenSuccesses = 0;
    this.halfOpenFailures = 0;
  }

  setFallback(fallback: (context?: any) => Promise<any>): void {
    this.fallback = fallback;
  }

  getStatistics(): CircuitStatistics {
    const total = this.metrics.successfulCalls + this.metrics.failedCalls;
    const failureRate = total === 0 ? 0 :
      (this.metrics.failedCalls / total) * 100;

    return {
      consecutiveFailures: this.consecutiveFailures,
      failureRate
    };
  }

  getMetrics(): CircuitMetrics {
    const averageResponseTime = this.metrics.responseTimes.length === 0 ? 0 :
      this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length;

    return {
      totalCalls: this.metrics.totalCalls,
      successfulCalls: this.metrics.successfulCalls,
      failedCalls: this.metrics.failedCalls,
      rejectedCalls: this.metrics.rejectedCalls,
      averageResponseTime
    };
  }

  getHalfOpenStats(): HalfOpenStats {
    const total = this.halfOpenSuccesses + this.halfOpenFailures;
    const successRate = total === 0 ? 0 :
      (this.halfOpenSuccesses / total) * 100;

    return {
      successRate
    };
  }

  getRollingWindow(): RollingWindow {
    const now = Date.now();
    const cutoff = now - this.config.monitoringWindow;

    this.rollingWindow = this.rollingWindow.filter(entry => entry.timestamp > cutoff);

    return {
      callsInWindow: this.rollingWindow.length
    };
  }

  private recordSuccess(responseTime: number): void {
    this.metrics.totalCalls++;
    this.metrics.successfulCalls++;
    this.metrics.responseTimes.push(responseTime);
    this.consecutiveFailures = 0;

    this.rollingWindow.push({
      timestamp: Date.now(),
      success: true
    });

    // Keep response times array bounded
    if (this.metrics.responseTimes.length > 100) {
      this.metrics.responseTimes.shift();
    }
  }

  private recordFailure(error: any): void {
    this.metrics.totalCalls++;
    this.metrics.failedCalls++;
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    this.rollingWindow.push({
      timestamp: Date.now(),
      success: false
    });

    this.config.eventEmitter?.emit('circuit:failure', {
      error,
      consecutiveFailures: this.consecutiveFailures
    });

    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.open();
    }
  }

  private open(): void {
    if (this.state === 'OPEN') return;

    const previousState = this.state;
    this.state = 'OPEN';
    this.halfOpenCalls = 0;
    // Don't reset success/failure counts when reopening from half-open
    // This allows tracking of half-open statistics
    if (previousState !== 'HALF_OPEN') {
      this.halfOpenSuccesses = 0;
      this.halfOpenFailures = 0;
    }

    this.config.eventEmitter?.emit('circuit:state-change', {
      from: previousState,
      to: 'OPEN'
    });

    this.config.eventEmitter?.emit('circuit:trip');

    this.startResetTimer();
  }

  private close(): void {
    if (this.state === 'CLOSED') return;

    const previousState = this.state;
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.halfOpenCalls = 0;
    this.halfOpenSuccesses = 0;
    this.halfOpenFailures = 0;

    this.config.eventEmitter?.emit('circuit:state-change', {
      from: previousState,
      to: 'CLOSED'
    });

    this.stopResetTimer();
  }

  private halfOpen(): void {
    if (this.state === 'HALF_OPEN') return;

    const previousState = this.state;
    this.state = 'HALF_OPEN';
    this.halfOpenCalls = 0;
    // Always reset success/failure counts when entering half-open
    this.halfOpenSuccesses = 0;
    this.halfOpenFailures = 0;

    this.config.eventEmitter?.emit('circuit:state-change', {
      from: previousState,
      to: 'HALF_OPEN'
    });
  }

  private startResetTimer(): void {
    this.stopResetTimer();

    if (this.state === 'OPEN') {
      this.resetTimer = setTimeout(() => {
        this.halfOpen();
      }, this.config.resetTimeout);
    }
  }

  private stopResetTimer(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
  }
}