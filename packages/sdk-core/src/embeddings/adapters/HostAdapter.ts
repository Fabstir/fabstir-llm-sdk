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
import type { ImageProcessingResult } from '../../documents/types.js';

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

  /**
   * Call host's /v1/ocr endpoint
   * Extracts text from images using PaddleOCR
   *
   * @param base64Image - Base64-encoded image data
   * @param format - Image format (png, jpeg, webp, gif)
   * @returns OCR result with text, confidence, and processing time
   */
  private async callOcrEndpoint(
    base64Image: string,
    format: string
  ): Promise<{ text: string; confidence: number; processingTimeMs: number }> {
    const response = await fetch(`${this.hostUrl}/v1/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64Image,
        format,
        language: 'en',
        chainId: this.chainId,
      }),
    });

    if (response.status === 503) {
      throw new Error('OCR model not loaded on host');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`OCR failed (${response.status}): ${error.message || error}`);
    }

    const data = await response.json();
    return {
      text: data.text || '',
      confidence: data.confidence || 0,
      processingTimeMs: data.processingTimeMs || 0,
    };
  }

  /**
   * Call host's /v1/describe-image endpoint
   * Generates image description using Florence-2 vision model
   *
   * @param base64Image - Base64-encoded image data
   * @param format - Image format (png, jpeg, webp, gif)
   * @returns Description result with text and processing time
   */
  private async callDescribeEndpoint(
    base64Image: string,
    format: string
  ): Promise<{ description: string; processingTimeMs: number }> {
    const response = await fetch(`${this.hostUrl}/v1/describe-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64Image,
        format,
        detail: 'detailed',
        chainId: this.chainId,
      }),
    });

    if (response.status === 503) {
      throw new Error('Florence vision model not loaded on host');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`Image description failed (${response.status}): ${error.message || error}`);
    }

    const data = await response.json();
    return {
      description: data.description || '',
      processingTimeMs: data.processingTimeMs || 0,
    };
  }

  /**
   * Process image using host OCR and description endpoints
   * Calls BOTH /v1/ocr AND /v1/describe-image in parallel for best RAG results
   *
   * @param file - Image file (PNG, JPEG, WebP, GIF)
   * @returns Combined text from OCR + description
   */
  async processImage(file: File): Promise<ImageProcessingResult> {
    // 1. Convert image to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = this.arrayBufferToBase64(arrayBuffer);
    const format = file.name.split('.').pop()?.toLowerCase() || 'png';

    // 2. Call BOTH endpoints in parallel for best results
    const [ocrResult, describeResult] = await Promise.allSettled([
      this.callOcrEndpoint(base64, format),
      this.callDescribeEndpoint(base64, format),
    ]);

    // 3. Extract results (handle partial failures gracefully)
    const ocrText = ocrResult.status === 'fulfilled' ? ocrResult.value.text : '';
    const ocrConfidence = ocrResult.status === 'fulfilled' ? ocrResult.value.confidence : 0;
    const ocrTime = ocrResult.status === 'fulfilled' ? ocrResult.value.processingTimeMs : 0;
    const description = describeResult.status === 'fulfilled' ? describeResult.value.description : '';
    const describeTime = describeResult.status === 'fulfilled' ? describeResult.value.processingTimeMs : 0;

    // 4. If BOTH failed, throw error
    if (ocrResult.status === 'rejected' && describeResult.status === 'rejected') {
      throw new Error(
        `Image processing failed on host. ` +
        `OCR: ${(ocrResult.reason as Error)?.message || 'Unknown'}. ` +
        `Describe: ${(describeResult.reason as Error)?.message || 'Unknown'}`
      );
    }

    // 5. Combine results
    const combinedText = this.combineImageText(description, ocrText);
    const processingTimeMs = ocrTime + describeTime;

    return {
      description,
      extractedText: ocrText,
      ocrConfidence,
      combinedText,
      processingTimeMs,
    };
  }

  /**
   * Combine image description and OCR text into formatted string
   * Format: [Image Description]\n{desc}\n\n[Extracted Text]\n{ocr}
   */
  private combineImageText(description: string, ocrText: string): string {
    const parts: string[] = [];
    if (description.trim()) {
      parts.push(`[Image Description]\n${description.trim()}`);
    }
    if (ocrText.trim()) {
      parts.push(`[Extracted Text]\n${ocrText.trim()}`);
    }
    return parts.join('\n\n');
  }
}
