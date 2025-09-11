/**
 * Browser-compatible Storage Manager using S5.js
 * 
 * This manager handles decentralized storage operations through S5.js,
 * which is fully browser-compatible. No Node.js dependencies.
 */

import { S5 } from '@s5-dev/s5js';
import { IStorageManager } from '../interfaces';
import { 
  SDKError,
  StorageOptions,
  StorageResult,
  ConversationData,
  Message
} from '../types';

export interface Exchange {
  prompt: string;
  response: string;
  timestamp: number;
  tokensUsed?: number;
  model?: string;
}

export interface SessionMetadata {
  sessionId: string;
  created: number;
  model?: string;
  temperature?: number;
  hostAddress?: string;
  userAddress: string;
}

export interface SessionSummary {
  exchangeCount: number;
  totalTokens: number;
  lastUpdated: number;
  firstExchange?: number;
  lastExchange?: number;
}

export interface ListOptions {
  limit?: number;
  cursor?: string;
  reverse?: boolean;
}

/**
 * Browser-compatible StorageManager implementation
 * Uses S5.js for decentralized storage operations
 */
export class StorageManager implements IStorageManager {
  static readonly DEFAULT_S5_PORTAL = 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p';
  static readonly SEED_MESSAGE = 'Generate S5 seed for Fabstir LLM';
  static readonly REGISTRY_PREFIX = 'fabstir-llm';
  static readonly CONVERSATION_PATH = 'home/conversations';
  static readonly SESSIONS_PATH = 'home/sessions';
  
  private s5Client?: any;
  private userSeed?: string;
  private userAddress?: string;
  private initialized = false;

  constructor(private s5PortalUrl: string = StorageManager.DEFAULT_S5_PORTAL) {}

  /**
   * Initialize storage with S5 seed
   */
  async initialize(seed: string, userAddress?: string): Promise<void> {
    try {
      this.userSeed = seed;
      this.userAddress = userAddress || '';
      
      // Create S5 client with browser-compatible configuration
      this.s5Client = await S5.create({ 
        initialPeers: [this.s5PortalUrl],
        // No Node.js specific options
      });
      
      await this.s5Client.recoverIdentityFromSeedPhrase(this.userSeed);
      
      // Optional portal registration
      try {
        await this.s5Client.registerOnNewPortal('https://s5.vup.cx');
      } catch (error) {
        console.debug('Portal registration failed, continuing');
      }
      
      await this.s5Client.fs.ensureIdentityInitialized();
      this.initialized = true;
    } catch (error: any) {
      throw new SDKError(
        `Failed to initialize StorageManager: ${error.message}`,
        'STORAGE_INIT_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Store data to S5 network
   */
  async store(
    data: string | Uint8Array | object,
    options?: StorageOptions
  ): Promise<StorageResult> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      // Generate unique key based on timestamp
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const key = `${timestamp}-${random}`;
      const path = `${StorageManager.CONVERSATION_PATH}/${this.userAddress}/${key}.json`;

      // Prepare data with metadata
      const storageData = {
        data,
        metadata: {
          ...options?.metadata,
          timestamp,
          compressed: options?.compress || false,
          encrypted: options?.encrypt || false
        }
      };

      // Store to S5
      await this.s5Client.fs.put(path, storageData);

      // Get CID for the stored data
      const metadata = await this.s5Client.fs.getMetadata(path);
      
      return {
        cid: metadata?.cid || key,
        url: `s5://${metadata?.cid || key}`,
        size: JSON.stringify(storageData).length,
        timestamp
      };
    } catch (error: any) {
      throw new SDKError(
        `Failed to store data: ${error.message}`,
        'STORAGE_STORE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Retrieve data from S5 network
   */
  async retrieve(cid: string): Promise<any> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      // Try to retrieve by path or CID
      const path = cid.includes('/') 
        ? cid 
        : `${StorageManager.CONVERSATION_PATH}/${this.userAddress}/${cid}.json`;
      
      const retrievedData = await this.s5Client.fs.get(path);
      if (!retrievedData) return null;
      
      return retrievedData.data || retrievedData;
    } catch (error: any) {
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        return null;
      }
      throw new SDKError(
        `Failed to retrieve data: ${error.message}`,
        'STORAGE_RETRIEVE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Delete data from S5 network
   */
  async delete(cid: string): Promise<void> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      const path = cid.includes('/') 
        ? cid 
        : `${StorageManager.CONVERSATION_PATH}/${this.userAddress}/${cid}.json`;
      
      await this.s5Client.fs.delete(path);
    } catch (error: any) {
      throw new SDKError(
        `Failed to delete data: ${error.message}`,
        'STORAGE_DELETE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * List stored items
   */
  async list(prefix?: string): Promise<string[]> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      const userPath = `${StorageManager.CONVERSATION_PATH}/${this.userAddress}`;
      const files = [];
      
      // Use async iterator (browser-compatible)
      for await (const item of this.s5Client.fs.list(userPath)) {
        if (item.type === 'file' && item.name.endsWith('.json')) {
          const key = item.name.replace('.json', '');
          if (!prefix || key.startsWith(prefix)) {
            files.push(key);
          }
        }
      }
      
      return files;
    } catch (error: any) {
      console.debug('List error (returning empty):', error.message);
      return [];
    }
  }

  /**
   * Store a conversation (implements interface method)
   */
  async storeConversation(conversation: ConversationData): Promise<StorageResult> {
    return this.saveConversation(conversation);
  }

  /**
   * Retrieve a conversation (implements interface method)
   */
  async retrieveConversation(conversationId: string): Promise<ConversationData> {
    const conversation = await this.loadConversation(conversationId);
    if (!conversation) {
      throw new SDKError(
        `Conversation ${conversationId} not found`,
        'CONVERSATION_NOT_FOUND'
      );
    }
    return conversation;
  }

  /**
   * List all conversations (implements interface method)
   */
  async listConversations(): Promise<ConversationData[]> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    const sessions = await this.listSessions();
    const conversations: ConversationData[] = [];
    
    for (const session of sessions) {
      const conversation = await this.loadConversation(session.id);
      if (conversation) {
        conversations.push(conversation);
      }
    }
    
    return conversations;
  }

  /**
   * Add message to conversation (implements interface method)
   */
  async addMessage(conversationId: string, message: Message): Promise<void> {
    return this.appendMessage(conversationId, message);
  }

  /**
   * Check if data exists (implements interface method)
   */
  async exists(cid: string): Promise<boolean> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      const path = cid.includes('/') 
        ? cid 
        : `${StorageManager.CONVERSATION_PATH}/${this.userAddress}/${cid}.json`;
      
      const metadata = await this.s5Client.fs.getMetadata(path);
      return !!metadata;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get storage statistics (implements interface method)
   */
  async getStats(): Promise<{
    totalSize: number;
    fileCount: number;
    conversations: number;
  }> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    let totalSize = 0;
    let fileCount = 0;
    
    const conversations = await this.listConversations();
    
    // Count files in conversation path
    const conversationPath = `${StorageManager.CONVERSATION_PATH}/${this.userAddress}`;
    try {
      for await (const item of this.s5Client.fs.list(conversationPath)) {
        if (item.type === 'file') {
          fileCount++;
          // Estimate size based on metadata if available
          if (item.size) {
            totalSize += item.size;
          }
        }
      }
    } catch {}
    
    // Count files in sessions path
    const sessionsPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}`;
    try {
      for await (const item of this.s5Client.fs.list(sessionsPath)) {
        if (item.type === 'file') {
          fileCount++;
          if (item.size) {
            totalSize += item.size;
          }
        }
      }
    } catch {}
    
    return {
      totalSize,
      fileCount,
      conversations: conversations.length
    };
  }

  /**
   * Clear all local cache (implements interface method)
   */
  async clearCache(): Promise<void> {
    // S5.js handles its own caching internally
    // This method is a no-op for browser compatibility
    console.debug('Cache clear requested - S5.js manages its own cache');
  }

  /**
   * Save conversation data
   */
  async saveConversation(conversation: ConversationData): Promise<StorageResult> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      const path = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${conversation.id}/conversation.json`;
      
      await this.s5Client.fs.put(path, conversation);
      
      const metadata = await this.s5Client.fs.getMetadata(path);
      
      return {
        cid: metadata?.cid || conversation.id,
        url: `s5://${metadata?.cid || conversation.id}`,
        size: JSON.stringify(conversation).length,
        timestamp: conversation.updatedAt
      };
    } catch (error: any) {
      throw new SDKError(
        `Failed to save conversation: ${error.message}`,
        'STORAGE_SAVE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Load conversation data
   */
  async loadConversation(conversationId: string): Promise<ConversationData | null> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      const path = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${conversationId}/conversation.json`;
      const data = await this.s5Client.fs.get(path);
      return data || null;
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return null;
      }
      throw new SDKError(
        `Failed to load conversation: ${error.message}`,
        'STORAGE_LOAD_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Append message to conversation
   */
  async appendMessage(conversationId: string, message: Message): Promise<void> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      // Load existing conversation or create new one
      let conversation = await this.loadConversation(conversationId);
      
      if (!conversation) {
        conversation = {
          id: conversationId,
          messages: [],
          metadata: {},
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
      }
      
      // Append message
      conversation.messages.push(message);
      conversation.updatedAt = Date.now();
      
      // Save updated conversation
      await this.saveConversation(conversation);
    } catch (error: any) {
      throw new SDKError(
        `Failed to append message: ${error.message}`,
        'STORAGE_APPEND_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(
    conversationId: string,
    limit?: number
  ): Promise<Message[]> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      const conversation = await this.loadConversation(conversationId);
      if (!conversation) return [];
      
      const messages = conversation.messages || [];
      
      if (limit && limit > 0) {
        return messages.slice(-limit);
      }
      
      return messages;
    } catch (error: any) {
      throw new SDKError(
        `Failed to get conversation history: ${error.message}`,
        'STORAGE_HISTORY_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Clear all conversations
   */
  async clearAll(): Promise<void> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      const sessionsPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}`;
      await this.s5Client.fs.delete(sessionsPath);
      
      const conversationsPath = `${StorageManager.CONVERSATION_PATH}/${this.userAddress}`;
      await this.s5Client.fs.delete(conversationsPath);
    } catch (error: any) {
      // Ignore errors if paths don't exist
      console.debug('Clear all error (ignored):', error.message);
    }
  }

  /**
   * Check if storage is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get S5 client instance (for advanced usage)
   */
  getS5Client(): any {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }
    return this.s5Client;
  }

  // ============= Session-Based Methods =============
  
  /**
   * Store a single exchange efficiently
   */
  async storeExchange(sessionId: string, exchange: Exchange): Promise<string> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }
    
    try {
      const sessionPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${sessionId}`;
      
      // Use timestamp with random suffix to prevent collisions
      const timestamp = exchange.timestamp || Date.now();
      const random = Math.random().toString(36).substring(7);
      const exchangePath = `${sessionPath}/exchanges/${timestamp}-${random}.json`;
      
      await this.s5Client.fs.put(exchangePath, exchange);
      
      // Update session summary
      await this.updateSessionSummary(sessionId, exchange);
      
      return exchangePath;
    } catch (error: any) {
      throw new SDKError(
        `Failed to store exchange: ${error.message}`,
        'STORAGE_EXCHANGE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Update session summary atomically
   */
  private async updateSessionSummary(sessionId: string, exchange: Exchange): Promise<void> {
    try {
      const sessionPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${sessionId}`;
      const summaryPath = `${sessionPath}/summary.json`;
      
      let summary: SessionSummary;
      try {
        summary = await this.s5Client.fs.get(summaryPath) || {
          exchangeCount: 0,
          totalTokens: 0,
          lastUpdated: Date.now()
        };
      } catch {
        summary = {
          exchangeCount: 0,
          totalTokens: 0,
          lastUpdated: Date.now()
        };
      }
      
      // Update summary
      summary.exchangeCount++;
      summary.totalTokens += exchange.tokensUsed || 0;
      summary.lastUpdated = Date.now();
      
      if (!summary.firstExchange) {
        summary.firstExchange = exchange.timestamp;
      }
      summary.lastExchange = exchange.timestamp;
      
      await this.s5Client.fs.put(summaryPath, summary);
    } catch (error: any) {
      console.error(`Failed to update session summary: ${error.message}`);
    }
  }

  /**
   * Get recent exchanges with pagination
   */
  async getRecentExchanges(sessionId: string, limit: number = 10): Promise<Exchange[]> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }
    
    try {
      const exchangesPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${sessionId}/exchanges`;
      
      const files = [];
      for await (const item of this.s5Client.fs.list(exchangesPath)) {
        files.push(item);
      }
      
      // Sort by filename (timestamp) to get most recent
      const sortedFiles = files
        .filter(f => f.type === 'file' && f.name.endsWith('.json'))
        .sort((a, b) => {
          const aTime = parseInt(a.name.split('-')[0]) || 0;
          const bTime = parseInt(b.name.split('-')[0]) || 0;
          return bTime - aTime;
        })
        .slice(0, limit);
      
      const exchanges: Exchange[] = [];
      for (const file of sortedFiles) {
        try {
          const exchange = await this.s5Client.fs.get(`${exchangesPath}/${file.name}`);
          if (exchange) {
            exchanges.push(exchange);
          }
        } catch (error) {
          console.error(`Failed to load exchange ${file.name}:`, error);
        }
      }
      
      return exchanges.reverse();
    } catch (error: any) {
      console.debug(`Failed to get recent exchanges: ${error.message}`);
      return [];
    }
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<Array<{ id: string; created?: number }>> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }
    
    try {
      const sessionsPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}`;
      const sessions = [];
      
      for await (const entry of this.s5Client.fs.list(sessionsPath)) {
        if (entry.type === 'directory') {
          let created = Date.now();
          try {
            const metadata = await this.s5Client.fs.get(`${sessionsPath}/${entry.name}/metadata.json`);
            if (metadata?.created) {
              created = metadata.created;
            }
          } catch {}
          
          sessions.push({ 
            id: entry.name,
            created
          });
        }
      }
      
      return sessions;
    } catch (error: any) {
      console.debug('listSessions error:', error.message);
      return [];
    }
  }
}