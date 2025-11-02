/**
 * Conversation Memory
 * Stores and retrieves conversation history using vector embeddings for RAG
 * Max 400 lines
 */

import type { EmbeddingService } from '../embeddings/EmbeddingService.js';
import type { VectorRAGManager } from '../managers/VectorRAGManager.js';
import type { VectorRecord } from '../rag/types.js';

/**
 * Conversation message
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  messageIndex: number;
  tokenCount?: number;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  totalTokens: number;
  oldestMessageTimestamp: number;
  newestMessageTimestamp: number;
}

/**
 * Conversation memory configuration
 */
export interface ConversationMemoryConfig {
  /**
   * Enable conversation memory
   */
  enabled: boolean;

  /**
   * Maximum number of historical messages to retrieve via similarity search
   * Default: 5
   */
  maxHistoryMessages?: number;

  /**
   * Maximum number of recent messages to always include
   * Default: 3 (last 3 messages)
   */
  maxRecentMessages?: number;

  /**
   * Maximum tokens for all memory messages combined
   * Default: 1000
   */
  maxMemoryTokens?: number;

  /**
   * Minimum similarity threshold for historical messages
   * Default: 0.6
   */
  similarityThreshold?: number;
}

/**
 * Default conversation memory configuration
 */
export const DEFAULT_MEMORY_CONFIG: Required<Omit<ConversationMemoryConfig, 'enabled'>> = {
  maxHistoryMessages: 5,
  maxRecentMessages: 3,
  maxMemoryTokens: 1000,
  similarityThreshold: 0.6
};

/**
 * Conversation Memory Manager
 * Manages conversation history storage and retrieval for RAG
 */
export class ConversationMemory {
  private embeddingService: EmbeddingService;
  private vectorRAGManager: VectorRAGManager;
  private vectorDbSessionId: string;
  private messages: ConversationMessage[] = [];
  private messageIndex: number = 0;
  private config: Required<ConversationMemoryConfig>;

  constructor(
    embeddingService: EmbeddingService,
    vectorRAGManager: VectorRAGManager,
    vectorDbSessionId: string,
    config: ConversationMemoryConfig
  ) {
    this.embeddingService = embeddingService;
    this.vectorRAGManager = vectorRAGManager;
    this.vectorDbSessionId = vectorDbSessionId;
    this.config = {
      ...DEFAULT_MEMORY_CONFIG,
      ...config
    };
  }

  /**
   * Add a message to conversation memory
   * Embeds and stores the message in vector DB
   */
  async addMessage(role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
    const timestamp = Date.now();
    const tokenCount = this.estimateTokens(content);

    const message: ConversationMessage = {
      role,
      content,
      timestamp,
      messageIndex: this.messageIndex++,
      tokenCount
    };

    // Store in local array
    this.messages.push(message);

    // Embed and store in vector DB
    try {
      const embeddingResult = await this.embeddingService.embedText(content);

      const vectorRecord: VectorRecord = {
        id: `msg-${message.messageIndex}`,
        vector: embeddingResult.embedding,
        metadata: {
          role: message.role,
          content: message.content,
          timestamp: message.timestamp,
          messageIndex: message.messageIndex,
          tokenCount: message.tokenCount
        }
      };

      await this.vectorRAGManager.addVectors(this.vectorDbSessionId, [vectorRecord]);
    } catch (error: any) {
      console.warn(`Failed to store message in vector DB: ${error.message}`);
      // Continue even if vector storage fails - message still in local array
    }
  }

  /**
   * Get relevant historical messages based on query
   * Uses similarity search to find related past messages
   */
  async getRelevantHistory(query: string, maxMessages?: number): Promise<ConversationMessage[]> {
    const limit = maxMessages || this.config.maxHistoryMessages;

    try {
      // Embed the query
      const embeddingResult = await this.embeddingService.embedText(query);

      // Search for similar messages
      const results = await this.vectorRAGManager.searchVectors(
        this.vectorDbSessionId,
        embeddingResult.embedding,
        limit,
        {
          threshold: this.config.similarityThreshold
        }
      );

      // Convert back to conversation messages
      return results.map(result => ({
        role: result.metadata.role as 'user' | 'assistant' | 'system',
        content: result.metadata.content,
        timestamp: result.metadata.timestamp,
        messageIndex: result.metadata.messageIndex,
        tokenCount: result.metadata.tokenCount
      })).sort((a, b) => a.messageIndex - b.messageIndex); // Sort by order
    } catch (error: any) {
      console.warn(`Failed to retrieve relevant history: ${error.message}`);
      return [];
    }
  }

  /**
   * Get recent messages (always included for context continuity)
   */
  getRecentMessages(count?: number): ConversationMessage[] {
    const limit = count || this.config.maxRecentMessages;
    return this.messages.slice(-limit);
  }

  /**
   * Get context window: recent messages + relevant historical messages
   * Respects token limits and deduplicates
   */
  async getContextWindow(currentPrompt: string, maxTokens?: number): Promise<ConversationMessage[]> {
    const tokenLimit = maxTokens || this.config.maxMemoryTokens;

    // Get recent messages (always included)
    const recentMessages = this.getRecentMessages();

    // Get relevant historical messages
    const historicalMessages = await this.getRelevantHistory(currentPrompt);

    // Build context window with token limit
    return this.buildContextWindow(recentMessages, historicalMessages, tokenLimit);
  }

  /**
   * Build context window from recent and historical messages
   * Deduplicates and respects token limits
   * @private
   */
  private buildContextWindow(
    recentMessages: ConversationMessage[],
    historicalMessages: ConversationMessage[],
    maxTokens: number
  ): ConversationMessage[] {
    // Deduplicate: use Set of message indices
    const recentIndices = new Set(recentMessages.map(m => m.messageIndex));

    // Filter out historical messages that are already in recent
    const uniqueHistorical = historicalMessages.filter(m => !recentIndices.has(m.messageIndex));

    // Combine: recent first (guaranteed), then historical (if space permits)
    let totalTokens = recentMessages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
    const contextWindow: ConversationMessage[] = [...recentMessages];

    // Add historical messages if we have token budget
    for (const msg of uniqueHistorical) {
      const msgTokens = msg.tokenCount || this.estimateTokens(msg.content);

      if (totalTokens + msgTokens <= maxTokens) {
        contextWindow.push(msg);
        totalTokens += msgTokens;
      } else {
        break; // No more space
      }
    }

    // Sort by message index to maintain conversation order
    return contextWindow.sort((a, b) => a.messageIndex - b.messageIndex);
  }

  /**
   * Prune old messages to limit memory usage
   * Keeps most recent messages, removes oldest
   */
  async pruneOldMessages(keepCount: number): Promise<void> {
    if (this.messages.length <= keepCount) {
      return; // Nothing to prune
    }

    const messagesToRemove = this.messages.slice(0, this.messages.length - keepCount);
    const vectorIdsToRemove = messagesToRemove.map(m => `msg-${m.messageIndex}`);

    // Remove from vector DB
    try {
      await this.vectorRAGManager.deleteVectors(this.vectorDbSessionId, vectorIdsToRemove);
    } catch (error: any) {
      console.warn(`Failed to delete vectors: ${error.message}`);
    }

    // Remove from local array
    this.messages = keepCount === 0 ? [] : this.messages.slice(-keepCount);
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): MemoryStats {
    const userMessages = this.messages.filter(m => m.role === 'user').length;
    const assistantMessages = this.messages.filter(m => m.role === 'assistant').length;
    const totalTokens = this.messages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);

    return {
      totalMessages: this.messages.length,
      userMessages,
      assistantMessages,
      totalTokens,
      oldestMessageTimestamp: this.messages[0]?.timestamp || 0,
      newestMessageTimestamp: this.messages[this.messages.length - 1]?.timestamp || 0
    };
  }

  /**
   * Get all messages (for export/debugging)
   */
  getAllMessages(): ConversationMessage[] {
    return [...this.messages];
  }

  /**
   * Clear all conversation memory
   */
  async clearMemory(): Promise<void> {
    // Remove all vectors from DB
    const vectorIds = this.messages.map(m => `msg-${m.messageIndex}`);

    try {
      await this.vectorRAGManager.deleteVectors(this.vectorDbSessionId, vectorIds);
    } catch (error: any) {
      console.warn(`Failed to clear vector DB: ${error.message}`);
    }

    // Clear local state
    this.messages = [];
    this.messageIndex = 0;
  }

  /**
   * Estimate token count for text
   * Rough approximation: 1 token ≈ 4 characters
   * @private
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Format messages for LLM context
   * Returns formatted string ready to inject into prompt
   */
  formatMessagesForContext(messages: ConversationMessage[]): string {
    if (messages.length === 0) {
      return '';
    }

    const formatted = messages.map(msg => {
      const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
      return `${roleLabel}: ${msg.content}`;
    }).join('\n');

    return `Previous conversation:\n${formatted}\n\n`;
  }
}
