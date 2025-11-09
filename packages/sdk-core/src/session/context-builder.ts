/**
 * Context Builder
 * Retrieves and formats context from vector databases for RAG-enhanced prompts
 * Max 250 lines
 */

import type { EmbeddingService } from '../embeddings/EmbeddingService.js';
import type { VectorRAGManager } from '../managers/VectorRAGManager.js';
import type { SearchResult } from '../rag/types.js';
import type { ContextRetrievalOptions, RAGMetrics } from './rag-config.js';

/**
 * Formatted context result
 */
export interface FormattedContext {
  /**
   * The formatted context string ready for prompt injection
   */
  context: string;

  /**
   * Search results used to build context
   */
  results: SearchResult[];

  /**
   * Metrics for this retrieval
   */
  metrics: {
    retrievalTimeMs: number;
    embeddingTimeMs: number;
    searchTimeMs: number;
    formatTimeMs: number;
    resultsFound: number;
    averageSimilarity: number;
    contextTokens: number;
  };
}

/**
 * Context Builder
 * Orchestrates context retrieval and formatting for RAG sessions
 */
export class ContextBuilder {
  private embeddingService: EmbeddingService;
  private vectorRAGManager: VectorRAGManager;
  private vectorDbSessionId: string;
  private metrics: RAGMetrics;

  constructor(
    embeddingService: EmbeddingService,
    vectorRAGManager: VectorRAGManager,
    vectorDbSessionId: string
  ) {
    this.embeddingService = embeddingService;
    this.vectorRAGManager = vectorRAGManager;
    this.vectorDbSessionId = vectorDbSessionId;
    this.metrics = {
      totalRetrievals: 0,
      averageSimilarity: 0,
      averageLatencyMs: 0,
      emptyRetrievals: 0,
      totalContextTokens: 0
    };
  }

  /**
   * Retrieve context for a prompt
   * @param options - Context retrieval options
   * @returns Formatted context ready for injection
   */
  async retrieveContext(options: ContextRetrievalOptions): Promise<FormattedContext> {
    const startTime = performance.now();

    try {
      // Step 1: Embed the prompt
      const embeddingStart = performance.now();
      const embeddingResult = await this.embeddingService.embedText(options.prompt);
      const embeddingTime = performance.now() - embeddingStart;

      // Step 2: Search vector database
      const searchStart = performance.now();
      const results = await this.vectorRAGManager.searchVectors(
        this.vectorDbSessionId,
        embeddingResult.embedding,
        options.topK || 5,
        {
          threshold: options.threshold,
          filter: options.filter
        }
      );
      const searchTime = performance.now() - searchStart;

      // Step 3: Format context
      const formatStart = performance.now();
      const context = this.formatContext(results, options);
      const formatTime = performance.now() - formatStart;

      // Step 4: Calculate metrics
      const totalTime = performance.now() - startTime;
      const avgSimilarity = results.length > 0
        ? results.reduce((sum, r) => sum + r.score, 0) / results.length
        : 0;

      const contextTokens = this.estimateTokens(context);

      // Update running metrics
      this.updateMetrics({
        latencyMs: totalTime,
        similarity: avgSimilarity,
        empty: results.length === 0,
        contextTokens
      });

      return {
        context,
        results,
        metrics: {
          retrievalTimeMs: totalTime,
          embeddingTimeMs: embeddingTime,
          searchTimeMs: searchTime,
          formatTimeMs: formatTime,
          resultsFound: results.length,
          averageSimilarity: avgSimilarity,
          contextTokens
        }
      };
    } catch (error) {
      // On error, return empty context
      this.updateMetrics({
        latencyMs: performance.now() - startTime,
        similarity: 0,
        empty: true,
        contextTokens: 0
      });

      return {
        context: '',
        results: [],
        metrics: {
          retrievalTimeMs: performance.now() - startTime,
          embeddingTimeMs: 0,
          searchTimeMs: 0,
          formatTimeMs: 0,
          resultsFound: 0,
          averageSimilarity: 0,
          contextTokens: 0
        }
      };
    }
  }

  /**
   * Format search results into context string
   * @param results - Search results from vector DB
   * @param options - Context retrieval options
   * @returns Formatted context string
   */
  private formatContext(results: SearchResult[], options: ContextRetrievalOptions): string {
    if (results.length === 0) {
      return '';
    }

    const template = options.template || "Context from your documents:\n{context}\n\n";
    const includeSources = options.includeSources !== false;
    const maxTokens = options.maxTokens || 2000;

    // Build context from results
    const contextParts: string[] = [];
    const sources: Set<string> = new Set();

    for (const result of results) {
      const text = result.metadata.text || result.metadata.content || '';
      const source = result.metadata.documentName || result.metadata.source || 'Unknown';

      if (text) {
        contextParts.push(text);
        sources.add(source);
      }
    }

    // Join context parts
    let context = contextParts.join('\n\n');

    // Truncate to max tokens if needed
    context = this.truncateToTokenLimit(context, maxTokens);

    // Apply template
    let formattedContext = template.replace('{context}', context);

    // Add sources if requested
    if (includeSources && sources.size > 0) {
      const sourcesText = `Sources: ${Array.from(sources).join(', ')}`;

      // If template has {sources} placeholder, replace it
      if (template.includes('{sources}')) {
        formattedContext = formattedContext.replace('{sources}', sourcesText);
      } else {
        // Otherwise, append sources after the context
        formattedContext += sourcesText;
      }
    } else if (template.includes('{sources}')) {
      // Remove sources placeholder if not including sources
      formattedContext = formattedContext.replace('{sources}', '');
    }

    return formattedContext;
  }

  /**
   * Truncate context to token limit
   * @param context - Context string
   * @param maxTokens - Maximum tokens
   * @returns Truncated context
   */
  private truncateToTokenLimit(context: string, maxTokens: number): string {
    const estimatedTokens = this.estimateTokens(context);

    if (estimatedTokens <= maxTokens) {
      return context;
    }

    // Rough truncation: 1 token ≈ 4 characters
    const maxChars = maxTokens * 4;
    const truncated = context.substring(0, maxChars);

    // Try to cut at sentence boundary
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    const cutPoint = Math.max(lastPeriod, lastNewline);

    if (cutPoint > maxChars * 0.8) {
      return truncated.substring(0, cutPoint + 1) + '\n[...truncated]';
    }

    return truncated + '\n[...truncated]';
  }

  /**
   * Estimate token count for text
   * Rough approximation: 1 token ≈ 4 characters
   * @param text - Text to estimate
   * @returns Estimated token count
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Update running metrics
   * @param update - Metric update values
   */
  private updateMetrics(update: {
    latencyMs: number;
    similarity: number;
    empty: boolean;
    contextTokens: number;
  }): void {
    const n = this.metrics.totalRetrievals;

    // Update running averages
    this.metrics.averageLatencyMs =
      (this.metrics.averageLatencyMs * n + update.latencyMs) / (n + 1);

    this.metrics.averageSimilarity =
      (this.metrics.averageSimilarity * n + update.similarity) / (n + 1);

    // Update counters
    this.metrics.totalRetrievals++;
    this.metrics.totalContextTokens += update.contextTokens;

    if (update.empty) {
      this.metrics.emptyRetrievals++;
    }
  }

  /**
   * Get current metrics
   * @returns Current RAG metrics
   */
  getMetrics(): RAGMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRetrievals: 0,
      averageSimilarity: 0,
      averageLatencyMs: 0,
      emptyRetrievals: 0,
      totalContextTokens: 0
    };
  }
}
