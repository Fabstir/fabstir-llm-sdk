/**
 * Embedding Service Base Class
 * Abstract base for embedding providers with rate limiting and cost tracking
 * Max 300 lines
 */

import {
  EmbeddingProvider,
  EmbeddingConfig,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingResult,
  CostEntry,
  CostStats,
  RateLimitState
} from './types.js';

/**
 * Abstract base class for embedding services
 */
export abstract class EmbeddingService {
  protected readonly provider: EmbeddingProvider;
  protected readonly apiKey: string;
  protected readonly model: string;
  protected readonly config: EmbeddingConfig;

  // Cost tracking
  private costEntries: CostEntry[] = [];

  // Rate limiting state
  private rateLimit: RateLimitState = {
    requestsThisMinute: 0,
    tokensThisMinute: 0,
    lastResetTime: Date.now(),
    waitTimeMs: 0
  };

  constructor(config: EmbeddingConfig) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('API key is required');
    }

    this.provider = config.provider;
    this.apiKey = config.apiKey;
    this.model = config.model || this.getDefaultModel();
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 30000,
      maxRequestsPerMinute: 60,
      maxTokensPerMinute: 100000,
      maxDailyCostUsd: 10,
      ...config
    };
  }

  /**
   * Get default model for provider
   */
  protected abstract getDefaultModel(): string;

  /**
   * Embed single text
   */
  abstract embedText(text: string, inputType?: string): Promise<EmbeddingResult>;

  /**
   * Embed multiple texts in batch
   */
  abstract embedBatch(texts: string[], inputType?: string): Promise<EmbeddingResponse>;

  /**
   * Get cost statistics
   */
  getCostStats(): CostStats {
    const totalCost = this.costEntries.reduce((sum, entry) => sum + entry.cost, 0);
    const totalTokens = this.costEntries.reduce((sum, entry) => sum + entry.tokenCount, 0);
    const totalRequests = this.costEntries.length;

    // Cost by provider
    const costByProvider: Record<EmbeddingProvider, number> = {
      [EmbeddingProvider.OpenAI]: 0,
      [EmbeddingProvider.Cohere]: 0,
      [EmbeddingProvider.Host]: 0
    };

    this.costEntries.forEach(entry => {
      costByProvider[entry.provider] += entry.cost;
    });

    // Cost by day
    const costByDay: Record<string, number> = {};
    this.costEntries.forEach(entry => {
      const date = new Date(entry.timestamp).toISOString().split('T')[0];
      costByDay[date] = (costByDay[date] || 0) + entry.cost;
    });

    return {
      totalCost,
      totalTokens,
      totalRequests,
      costByProvider,
      costByDay
    };
  }

  /**
   * Reset cost statistics
   */
  resetCostStats(): void {
    this.costEntries = [];
  }

  /**
   * Track cost for request
   */
  protected trackCost(tokenCount: number, cost: number): void {
    this.costEntries.push({
      timestamp: Date.now(),
      provider: this.provider,
      model: this.model,
      tokenCount,
      cost
    });
  }

  /**
   * Check daily cost limit
   */
  protected async checkDailyCostLimit(): Promise<void> {
    if (!this.config.maxDailyCostUsd) return;

    const today = new Date().toISOString().split('T')[0];
    const stats = this.getCostStats();
    const todayCost = stats.costByDay[today] || 0;

    if (todayCost >= this.config.maxDailyCostUsd) {
      throw new Error(
        `Daily cost limit exceeded: $${todayCost.toFixed(4)} >= $${this.config.maxDailyCostUsd}`
      );
    }
  }

  /**
   * Apply rate limiting
   */
  protected async applyRateLimit(estimatedTokens: number): Promise<void> {
    const now = Date.now();

    // Reset if minute has passed
    if (now - this.rateLimit.lastResetTime >= 60000) {
      this.rateLimit.requestsThisMinute = 0;
      this.rateLimit.tokensThisMinute = 0;
      this.rateLimit.lastResetTime = now;
    }

    const { maxRequestsPerMinute, maxTokensPerMinute } = this.config;

    // Check request limit
    if (maxRequestsPerMinute && this.rateLimit.requestsThisMinute >= maxRequestsPerMinute) {
      const waitTime = 60000 - (now - this.rateLimit.lastResetTime);
      await this.sleep(waitTime);
      // Reset after waiting
      this.rateLimit.requestsThisMinute = 0;
      this.rateLimit.tokensThisMinute = 0;
      this.rateLimit.lastResetTime = Date.now();
    }

    // Check token limit
    if (maxTokensPerMinute && this.rateLimit.tokensThisMinute + estimatedTokens > maxTokensPerMinute) {
      const waitTime = 60000 - (now - this.rateLimit.lastResetTime);
      await this.sleep(waitTime);
      // Reset after waiting
      this.rateLimit.requestsThisMinute = 0;
      this.rateLimit.tokensThisMinute = 0;
      this.rateLimit.lastResetTime = Date.now();
    }

    // Increment counters
    this.rateLimit.requestsThisMinute++;
    this.rateLimit.tokensThisMinute += estimatedTokens;
  }

  /**
   * Retry logic with exponential backoff
   */
  protected async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries: number = this.config.maxRetries || 3
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Don't retry on certain errors
        if (error.status === 401 || error.status === 403) {
          throw error;  // Authentication errors
        }

        if (attempt < retries) {
          const delay = this.config.retryDelay! * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Retry failed');
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Estimate token count from text
   * Rough estimate: ~4 characters per token
   */
  protected estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Validate text input
   */
  protected validateText(text: string): void {
    if (!text || text.trim() === '') {
      throw new Error('Text cannot be empty');
    }
  }

  /**
   * Validate batch input
   */
  protected validateBatch(texts: string[], maxBatchSize: number): void {
    if (!texts || texts.length === 0) {
      throw new Error('texts array cannot be empty');
    }

    if (texts.length > maxBatchSize) {
      throw new Error(
        `Batch size ${texts.length} exceeds max batch size ${maxBatchSize}`
      );
    }

    texts.forEach(text => this.validateText(text));
  }

  /**
   * Calculate cost from token count
   */
  protected calculateCost(tokenCount: number, costPer1MTokens: number): number {
    return (tokenCount / 1_000_000) * costPer1MTokens;
  }
}
