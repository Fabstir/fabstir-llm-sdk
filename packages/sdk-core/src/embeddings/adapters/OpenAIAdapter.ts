/**
 * OpenAI Embedding Adapter
 * Implements embedding generation using OpenAI API
 * Max 250 lines
 */

import { EmbeddingService } from '../EmbeddingService.js';
import {
  EmbeddingProvider,
  EmbeddingConfig,
  EmbeddingResult,
  EmbeddingResponse,
  EMBEDDING_MODELS
} from '../types.js';

/**
 * OpenAI embedding adapter
 */
export class OpenAIAdapter extends EmbeddingService {
  private openai: any;  // OpenAI client instance

  constructor(config: EmbeddingConfig) {
    super(config);
    this.initializeClient();
  }

  /**
   * Initialize OpenAI client
   */
  private async initializeClient(): Promise<void> {
    try {
      // Dynamic import to avoid errors if package not installed
      const { default: OpenAI } = await import('openai');
      this.openai = new OpenAI({
        apiKey: this.apiKey,
        timeout: this.config.timeout
      });
    } catch (error: any) {
      // Package not installed - will be mocked in tests
      this.openai = null;
    }
  }

  protected getDefaultModel(): string {
    return 'text-embedding-3-small';
  }

  /**
   * Embed single text
   */
  async embedText(text: string, inputType?: string): Promise<EmbeddingResult> {
    this.validateText(text);
    await this.checkDailyCostLimit();

    const estimatedTokens = this.estimateTokens(text);
    await this.applyRateLimit(estimatedTokens);

    return await this.retryWithBackoff(async () => {
      // Ensure client is initialized
      if (!this.openai) {
        await this.initializeClient();
      }

      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text,
        dimensions: 384  // Force 384 dimensions
      });

      const embedding = response.data[0].embedding;
      const tokenCount = response.usage.total_tokens;
      const cost = this.calculateCost(tokenCount, EMBEDDING_MODELS['openai-small'].costPer1MTokens);

      this.trackCost(tokenCount, cost);

      return {
        embedding,
        text,
        tokenCount
      };
    });
  }

  /**
   * Embed multiple texts in batch
   */
  async embedBatch(texts: string[], inputType?: string): Promise<EmbeddingResponse> {
    const modelInfo = EMBEDDING_MODELS['openai-small'];
    this.validateBatch(texts, modelInfo.maxBatchSize);
    await this.checkDailyCostLimit();

    const totalEstimatedTokens = texts.reduce((sum, text) => sum + this.estimateTokens(text), 0);
    await this.applyRateLimit(totalEstimatedTokens);

    return await this.retryWithBackoff(async () => {
      // Ensure client is initialized
      if (!this.openai) {
        await this.initializeClient();
      }

      const response = await this.openai.embeddings.create({
        model: this.model,
        input: texts,
        dimensions: 384
      });

      const embeddings: EmbeddingResult[] = response.data.map((item: any, index: number) => ({
        embedding: item.embedding,
        text: texts[index],
        tokenCount: Math.ceil(response.usage.total_tokens / texts.length)  // Distribute tokens
      }));

      const totalTokens = response.usage.total_tokens;
      const cost = this.calculateCost(totalTokens, modelInfo.costPer1MTokens);

      this.trackCost(totalTokens, cost);

      return {
        embeddings,
        model: this.model,
        provider: EmbeddingProvider.OpenAI,
        totalTokens,
        cost
      };
    });
  }
}
