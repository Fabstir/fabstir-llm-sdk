/**
 * Host Embedding Adapter
 * Implements embedding generation using host-side endpoint
 * Zero-cost alternative to OpenAI/Cohere for production use
 * Max 250 lines
 */

import { EmbeddingService } from '../EmbeddingService.js';
import {
  EmbeddingProvider,
  EmbeddingConfig,
  EmbeddingResult,
  EmbeddingResponse
} from '../types.js';

/**
 * Host-specific embedding configuration
 */
export interface HostEmbeddingConfig extends Omit<EmbeddingConfig, 'apiKey' | 'provider'> {
  hostUrl: string;  // e.g., "http://localhost:8080"
  chainId?: number; // Default: 84532 (Base Sepolia)
  apiKey?: string;  // Optional, overridden to empty string
}

/**
 * Host embedding adapter
 * Connects to fabstir-llm-node /v1/embed endpoint for zero-cost embeddings
 */
export class HostAdapter extends EmbeddingService {
  private hostUrl: string;
  private chainId: number;

  constructor(config: HostEmbeddingConfig) {
    // Host adapter doesn't need API key, use placeholder
    super({
      ...config,
      provider: EmbeddingProvider.Host,
      apiKey: config.apiKey || 'host-no-api-key-needed',  // Placeholder for host
    });

    if (!config.hostUrl || config.hostUrl.trim() === '') {
      throw new Error('hostUrl is required for HostAdapter');
    }

    this.hostUrl = config.hostUrl.replace(/\/$/, '');  // Remove trailing slash
    this.chainId = config.chainId || 84532;  // Default to Base Sepolia
  }

  protected getDefaultModel(): string {
    return 'all-MiniLM-L6-v2';
  }

  /**
   * Embed single text
   */
  async embedText(text: string, inputType?: string): Promise<EmbeddingResult> {
    this.validateText(text);

    // For single text, use batch with 1 item for simplicity
    const response = await this.embedBatch([text], inputType);
    return response.embeddings[0];
  }

  /**
   * Embed multiple texts in batch
   */
  async embedBatch(texts: string[], inputType?: string): Promise<EmbeddingResponse> {
    // Validate batch (max 96 texts for host, same as Cohere)
    this.validateBatch(texts, 96);

    // Estimate tokens for rate limiting
    const totalEstimatedTokens = texts.reduce((sum, text) => sum + this.estimateTokens(text), 0);
    await this.applyRateLimit(totalEstimatedTokens);

    // Make HTTP request with retry
    const response = await this.retryWithBackoff(async () => {
      const res = await fetch(`${this.hostUrl}/v1/embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          texts,
          model: this.model,
          chain_id: this.chainId,
        }),
        signal: this.createTimeoutSignal(),
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(
          `Host embedding failed (${res.status}): ${errorBody.message || errorBody.error || 'Unknown error'}`
        );
      }

      return res.json();
    });

    // Validate response format
    if (!response.embeddings || !Array.isArray(response.embeddings)) {
      throw new Error('Invalid response from host: missing embeddings array');
    }

    if (response.embeddings.length !== texts.length) {
      throw new Error(
        `Host returned ${response.embeddings.length} embeddings for ${texts.length} texts`
      );
    }

    // Validate dimensions
    for (const embedding of response.embeddings) {
      if (!embedding.embedding || !Array.isArray(embedding.embedding)) {
        throw new Error('Invalid embedding format from host');
      }

      if (embedding.embedding.length !== 384) {
        throw new Error(
          `Host returned ${embedding.embedding.length}-dimensional embeddings, expected 384`
        );
      }
    }

    // Track cost (always 0.0 for host embeddings)
    this.trackCost(response.totalTokens || 0, 0.0);

    // Return in standard format
    return {
      embeddings: response.embeddings,
      model: response.model || this.model,
      provider: EmbeddingProvider.Host,
      totalTokens: response.totalTokens || 0,
      cost: 0.0  // Always free for host embeddings
    };
  }

  /**
   * Create abort signal for timeout
   */
  private createTimeoutSignal(): AbortSignal | undefined {
    if (!this.config.timeout) return undefined;

    const controller = new AbortController();
    setTimeout(() => controller.abort(), this.config.timeout);
    return controller.signal;
  }

  /**
   * Override checkDailyCostLimit - not needed for free host embeddings
   */
  protected async checkDailyCostLimit(): Promise<void> {
    // Host embeddings are always free, no limit check needed
    return;
  }

  /**
   * Convert ArrayBuffer to base64 string
   * Used for image data encoding before sending to host endpoints
   *
   * @param buffer - ArrayBuffer containing binary data
   * @returns Base64-encoded string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

}
