/**
 * Cohere Embedding Adapter
 * Implements embedding generation using Cohere API
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
 * Cohere embedding adapter
 */
export class CohereAdapter extends EmbeddingService {
  private cohere: any;  // Cohere client instance

  constructor(config: EmbeddingConfig) {
    super(config);
    this.initializeClient();
  }

  /**
   * Initialize Cohere client
   */
  private async initializeClient(): Promise<void> {
    try {
      // Dynamic import to avoid errors if package not installed
      const { CohereClient } = await import('cohere-ai');
      this.cohere = new CohereClient({
        token: this.apiKey
      });
    } catch (error: any) {
      // Package not installed - will be mocked in tests
      this.cohere = null;
    }
  }

  protected getDefaultModel(): string {
    return 'embed-english-light-v3.0';
  }

  /**
   * Embed single text
   */
  async embedText(text: string, inputType: string = 'search_document'): Promise<EmbeddingResult> {
    this.validateText(text);
    await this.checkDailyCostLimit();

    const estimatedTokens = this.estimateTokens(text);
    await this.applyRateLimit(estimatedTokens);

    return await this.retryWithBackoff(async () => {
      // Ensure client is initialized
      if (!this.cohere) {
        await this.initializeClient();
      }

      const response = await this.cohere.embed({
        model: this.model,
        texts: [text],
        inputType: inputType,
        embeddingTypes: ['float']
      });

      const embedding = response.embeddings.float[0];
      // Cohere doesn't return token count, estimate it
      const tokenCount = this.estimateTokens(text);
      const cost = this.calculateCost(tokenCount, EMBEDDING_MODELS['cohere-light'].costPer1MTokens);

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
  async embedBatch(texts: string[], inputType: string = 'search_document'): Promise<EmbeddingResponse> {
    const modelInfo = EMBEDDING_MODELS['cohere-light'];
    this.validateBatch(texts, modelInfo.maxBatchSize);
    await this.checkDailyCostLimit();

    const totalEstimatedTokens = texts.reduce((sum, text) => sum + this.estimateTokens(text), 0);
    await this.applyRateLimit(totalEstimatedTokens);

    return await this.retryWithBackoff(async () => {
      // Ensure client is initialized
      if (!this.cohere) {
        await this.initializeClient();
      }

      const response = await this.cohere.embed({
        model: this.model,
        texts: texts,
        inputType: inputType,
        embeddingTypes: ['float']
      });

      const embeddings: EmbeddingResult[] = response.embeddings.float.map((embedding: number[], index: number) => ({
        embedding,
        text: texts[index],
        tokenCount: this.estimateTokens(texts[index])
      }));

      const totalTokens = embeddings.reduce((sum, e) => sum + e.tokenCount, 0);
      const cost = this.calculateCost(totalTokens, modelInfo.costPer1MTokens);

      this.trackCost(totalTokens, cost);

      return {
        embeddings,
        model: this.model,
        provider: EmbeddingProvider.Cohere,
        totalTokens,
        cost
      };
    });
  }
}
