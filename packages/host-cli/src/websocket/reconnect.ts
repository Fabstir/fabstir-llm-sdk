import { EventEmitter } from 'events';

export interface ReconnectOptions {
  connect: () => Promise<boolean>;
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: number;
}

export interface ReconnectionInfo {
  attempts: number;
  isReconnecting: boolean;
  nextAttemptIn: number;
  lastError?: Error;
}

export interface CircuitBreakerOptions {
  threshold: number;
  resetTimeout: number;
}

interface CircuitState {
  failures: number;
  lastFailure?: Date;
  isOpen: boolean;
  resetTimer?: NodeJS.Timer;
}

export class ReconnectManager extends EventEmitter {
  private options: ReconnectOptions;
  private attempts: number = 0;
  private isReconnecting: boolean = false;
  private lastError?: Error;
  private nextAttemptTimer?: NodeJS.Timer;
  private enabled: boolean = true;
  private jitter: number = 0;
  private healthCheckFn?: () => Promise<boolean>;
  private healthCheckInterval?: number;
  private healthCheckTimer?: NodeJS.Timer;
  private circuitBreaker?: CircuitState;
  private circuitBreakerOptions?: CircuitBreakerOptions;

  constructor(options: ReconnectOptions) {
    super();
    this.options = {
      maxAttempts: options.maxAttempts || 5,
      initialDelay: options.initialDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      backoffMultiplier: options.backoffMultiplier || 2,
      jitter: options.jitter || 0,
      ...options
    };
    this.jitter = this.options.jitter || 0;
  }

  async start(): Promise<void> {
    if (!this.enabled || this.isReconnecting) {
      return;
    }

    if (this.isCircuitOpen()) {
      this.emit('circuit-open');
      return;
    }

    this.isReconnecting = true;
    this.attempts = 0;

    while (this.attempts < this.options.maxAttempts! && this.enabled && this.isReconnecting) {
      this.attempts++;
      this.emit('reconnect-start', { attempt: this.attempts });

      try {
        const success = await this.options.connect();
        if (success) {
          this.handleSuccess();
          return;
        }
      } catch (error) {
        this.lastError = error as Error;
        this.handleFailure();
      }

      if (this.attempts < this.options.maxAttempts! && this.enabled && this.isReconnecting) {
        const delay = this.getNextDelay(this.attempts - 1);
        await this.delay(delay);
      }
    }

    this.isReconnecting = false;
    if (this.attempts >= this.options.maxAttempts!) {
      this.emit('reconnect-exhausted', { attempts: this.attempts, lastError: this.lastError });
    }
  }

  stop(): void {
    this.isReconnecting = false;
    this.clearTimers();
  }

  async forceReconnect(): Promise<void> {
    this.stop();
    this.resetAttempts();
    await this.start();
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
    this.stop();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getIsReconnecting(): boolean {
    return this.isReconnecting;
  }

  getAttempts(): number {
    return this.attempts;
  }

  resetAttempts(): void {
    this.attempts = 0;
  }

  getNextDelay(attempt: number): number {
    const baseDelay = Math.min(
      this.options.initialDelay! * Math.pow(this.options.backoffMultiplier!, attempt),
      this.options.maxDelay!
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

  setJitter(jitter: number): void {
    this.jitter = Math.max(0, Math.min(1, jitter)); // Clamp between 0 and 1
  }

  getReconnectionInfo(): ReconnectionInfo {
    const nextDelay = this.isReconnecting ? this.getNextDelay(this.attempts) : 0;
    return {
      attempts: this.attempts,
      isReconnecting: this.isReconnecting,
      nextAttemptIn: nextDelay,
      lastError: this.lastError
    };
  }

  setHealthCheck(checkFn: () => Promise<boolean>, interval: number): void {
    this.healthCheckFn = checkFn;
    this.healthCheckInterval = interval;
  }

  scheduleHealthCheck(): void {
    if (!this.healthCheckFn || !this.healthCheckInterval) {
      return;
    }

    this.clearHealthCheckTimer();
    this.healthCheckTimer = setTimeout(() => {
      this.checkHealth();
    }, this.healthCheckInterval);
  }

  async checkHealth(): Promise<void> {
    if (!this.healthCheckFn) {
      return;
    }

    try {
      const isHealthy = await this.healthCheckFn();
      if (!isHealthy) {
        this.emit('health-check-failed');
        await this.start();
      }
    } catch (error) {
      this.emit('health-check-error', error);
      await this.start();
    }

    // Schedule next health check
    this.scheduleHealthCheck();
  }

  enableCircuitBreaker(options: CircuitBreakerOptions): void {
    this.circuitBreakerOptions = options;
    this.circuitBreaker = {
      failures: 0,
      isOpen: false
    };
  }

  isCircuitOpen(): boolean {
    return this.circuitBreaker?.isOpen || false;
  }

  private handleSuccess(): void {
    this.isReconnecting = false;
    // Don't reset attempts here - it's reset when start() is called
    this.lastError = undefined;

    // Reset circuit breaker
    if (this.circuitBreaker) {
      this.circuitBreaker.failures = 0;
      this.circuitBreaker.isOpen = false;
      if (this.circuitBreaker.resetTimer) {
        clearTimeout(this.circuitBreaker.resetTimer);
        this.circuitBreaker.resetTimer = undefined;
      }
    }

    this.emit('reconnect-success', { attempts: this.attempts });
    this.scheduleHealthCheck();
  }

  private handleFailure(): void {
    this.emit('reconnect-failed', {
      attempt: this.attempts,
      error: this.lastError
    });

    // Update circuit breaker
    if (this.circuitBreaker && this.circuitBreakerOptions) {
      this.circuitBreaker.failures++;
      this.circuitBreaker.lastFailure = new Date();

      if (this.circuitBreaker.failures >= this.circuitBreakerOptions.threshold) {
        this.openCircuit();
      }
    }
  }

  private openCircuit(): void {
    if (!this.circuitBreaker || !this.circuitBreakerOptions) {
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
    }, this.circuitBreakerOptions.resetTimeout);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      this.nextAttemptTimer = setTimeout(resolve, ms);
    });
  }

  private clearTimers(): void {
    if (this.nextAttemptTimer) {
      clearTimeout(this.nextAttemptTimer);
      this.nextAttemptTimer = undefined;
    }
    this.clearHealthCheckTimer();
  }

  private clearHealthCheckTimer(): void {
    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }
}