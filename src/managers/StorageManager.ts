// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { ethers } from 'ethers';
import 'fake-indexeddb/auto'; // Required for S5.js in Node.js
import { S5 } from '@s5-dev/s5js';
import AuthManager from './AuthManager';

// Types for conversation storage
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

export default class StorageManager {
  static readonly DEFAULT_S5_PORTAL = 'wss://z2DcjTLqfj6PTMsDbFfgtuHtYmrKeibFTkvqY8QZeyR3YmE@s5.platformlessai.ai/s5/p2p';
  static readonly SEED_MESSAGE = 'Generate S5 seed for Fabstir LLM';
  static readonly REGISTRY_PREFIX = 'fabstir-llm';
  static readonly CONVERSATION_PATH = 'home/conversations';
  static readonly SESSIONS_PATH = 'home/sessions';
  
  private s5Client?: any;
  private userSeed?: string;
  private userAddress?: string;
  private initialized = false;

  constructor(private s5PortalUrl: string = StorageManager.DEFAULT_S5_PORTAL) {}

  async initialize(authManager: AuthManager): Promise<void> {
    try {
      // ALWAYS use EOA for S5 seed and address, even with smart wallets
      // This ensures consistent S5 paths regardless of wallet type
      this.userSeed = authManager.getS5Seed();
      
      // Use EOA address for S5 paths to maintain consistency
      // Smart wallet addresses would create different S5 paths
      if (authManager.isUsingSmartWallet()) {
        this.userAddress = authManager.getEOAAddress();
      } else {
        this.userAddress = authManager.getUserAddress();
      }
      
      this.s5Client = await S5.create({ initialPeers: [this.s5PortalUrl] });
      await this.s5Client.recoverIdentityFromSeedPhrase(this.userSeed);
      try {
        await this.s5Client.registerOnNewPortal('https://s5.platformlessai.ai');
      } catch (error) {
        console.debug('Portal registration failed, continuing');
      }
      await this.s5Client.fs.ensureIdentityInitialized();
      this.initialized = true;
    } catch (error: any) {
      throw new Error(`Failed to initialize StorageManager: ${error.message}`);
    }
  }

  // ============= Efficient Exchange-Based Storage =============
  
  /**
   * Store a single exchange (prompt + response) efficiently
   * O(1) operation - only stores the new data
   */
  async storeExchange(sessionId: string, exchange: Exchange): Promise<string> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    
    try {
      // Ensure session exists
      const sessionPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${sessionId}`;
      const metadataPath = `${sessionPath}/metadata.json`;
      
      // Check if session exists, if not this might be the first exchange
      let metadata: SessionMetadata | null = null;
      try {
        metadata = await this.s5Client.fs.get(metadataPath);
      } catch (error) {
        // Session doesn't exist yet, this is okay for first exchange
        console.debug(`Session ${sessionId} metadata not found, will be created`);
      }
      
      // Use timestamp with random suffix to prevent collisions
      const timestamp = exchange.timestamp || Date.now();
      const random = Math.random().toString(36).substring(7);
      const exchangePath = `${sessionPath}/exchanges/${timestamp}-${random}.json`;
      
      // Store the exchange
      await this.s5Client.fs.put(exchangePath, exchange);
      
      // Update session summary atomically
      await this.updateSessionSummary(sessionId, exchange);
      
      return exchangePath;
    } catch (error: any) {
      throw new Error(`Failed to store exchange: ${error.message}`);
    }
  }

  /**
   * Create or update session metadata
   */
  async createSessionMetadata(sessionId: string, metadata: Partial<SessionMetadata>): Promise<void> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    
    try {
      const sessionPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${sessionId}`;
      const metadataPath = `${sessionPath}/metadata.json`;
      
      const fullMetadata: SessionMetadata = {
        sessionId,
        created: Date.now(),
        userAddress: this.userAddress!,
        ...metadata
      };
      
      await this.s5Client.fs.put(metadataPath, fullMetadata);
    } catch (error: any) {
      throw new Error(`Failed to create session metadata: ${error.message}`);
    }
  }

  /**
   * Update session summary with atomic counter pattern
   */
  private async updateSessionSummary(sessionId: string, exchange: Exchange): Promise<void> {
    try {
      const sessionPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${sessionId}`;
      const summaryPath = `${sessionPath}/summary.json`;
      
      // Get current summary or create new one
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
      
      // Store updated summary
      await this.s5Client.fs.put(summaryPath, summary);
      
      // Also store atomic counter for accurate counting (handles race conditions)
      const counterPath = `${sessionPath}/counters/${exchange.timestamp}.json`;
      await this.s5Client.fs.put(counterPath, { 
        timestamp: exchange.timestamp,
        tokens: exchange.tokensUsed || 0 
      });
    } catch (error: any) {
      console.error(`Failed to update session summary: ${error.message}`);
      // Don't throw - summary update failure shouldn't block exchange storage
    }
  }

  /**
   * Get recent exchanges with efficient pagination
   * O(limit) operation - only loads requested exchanges
   */
  async getRecentExchanges(sessionId: string, limit: number = 10): Promise<Exchange[]> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    
    try {
      const exchangesPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${sessionId}/exchanges`;
      
      // List files in the exchanges directory using async iterator
      const files = [];
      for await (const item of this.s5Client.fs.list(exchangesPath)) {
        files.push(item);
      }
      
      // Sort by filename (timestamp) to get most recent
      const sortedFiles = files
        .filter(f => f.type === 'file' && f.name.endsWith('.json'))
        .sort((a, b) => {
          // Extract timestamp from filename (format: timestamp-random.json)
          const aTime = parseInt(a.name.split('-')[0]) || 0;
          const bTime = parseInt(b.name.split('-')[0]) || 0;
          return bTime - aTime; // Descending order (most recent first)
        })
        .slice(0, limit);
      
      // Load only the requested exchanges
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
      
      // Return in chronological order (oldest to newest)
      return exchanges.reverse();
    } catch (error: any) {
      console.debug(`Failed to get recent exchanges: ${error.message}`);
      return [];
    }
  }

  /**
   * Iterator for efficient streaming of exchanges
   * Uses cursor-based pagination for large conversations
   */
  async* getExchangesIterator(
    sessionId: string, 
    options: ListOptions = {}
  ): AsyncGenerator<{ exchange: Exchange; cursor?: string }> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    
    const exchangesPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${sessionId}/exchanges`;
    
    try {
      // Use async iterator for listing files
      const files = [];
      let count = 0;
      const maxItems = options.limit || Infinity;
      
      for await (const item of this.s5Client.fs.list(exchangesPath, {
        limit: options.limit,
        cursor: options.cursor
      })) {
        files.push(item);
        count++;
        if (count >= maxItems) break;
      }
      
      // Sort files if needed
      const sortedFiles = options.reverse 
        ? files.sort((a, b) => b.name.localeCompare(a.name))
        : files.sort((a, b) => a.name.localeCompare(b.name));
      
      // Yield exchanges one by one
      for (const file of sortedFiles) {
        if (file.type === 'file' && file.name.endsWith('.json')) {
          try {
            const exchange = await this.s5Client.fs.get(`${exchangesPath}/${file.name}`);
            if (exchange) {
              yield { 
                exchange, 
                cursor: file.cursor || file.name // Use file name as cursor if no cursor provided
              };
            }
          } catch (error) {
            console.error(`Failed to load exchange ${file.name}:`, error);
          }
        }
      }
    } catch (error: any) {
      console.error(`Failed to iterate exchanges: ${error.message}`);
    }
  }

  /**
   * Get all exchanges for a session (use sparingly for large conversations)
   */
  async getAllExchanges(sessionId: string): Promise<Exchange[]> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    
    const exchanges: Exchange[] = [];
    
    // Use iterator to stream all exchanges
    for await (const { exchange } of this.getExchangesIterator(sessionId)) {
      exchanges.push(exchange);
    }
    
    // Sort by timestamp to ensure chronological order
    return exchanges.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  /**
   * Get session summary with statistics
   */
  async getSessionSummary(sessionId: string): Promise<SessionSummary | null> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    
    try {
      const summaryPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${sessionId}/summary.json`;
      return await this.s5Client.fs.get(summaryPath);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get accurate exchange count using atomic counters
   */
  async getExchangeCount(sessionId: string): Promise<number> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    
    try {
      // First try to get from summary (fast path)
      const summary = await this.getSessionSummary(sessionId);
      if (summary) {
        return summary.exchangeCount;
      }
      
      // Fallback: count files in exchanges directory
      const exchangesPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${sessionId}/exchanges`;
      
      let count = 0;
      for await (const item of this.s5Client.fs.list(exchangesPath)) {
        if (item.type === 'file' && item.name.endsWith('.json')) {
          count++;
        }
      }
      
      return count;
    } catch (error) {
      return 0;
    }
  }

  /**
   * List all sessions for the current user (detailed version)
   */
  async listSessionsDetailed(): Promise<Array<{ sessionId: string; metadata?: SessionMetadata; summary?: SessionSummary }>> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    
    try {
      const userSessionsPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}`;
      
      const sessions = [];
      try {
        for await (const item of this.s5Client.fs.list(userSessionsPath)) {
          sessions.push(item);
        }
      } catch (error) {
        // Path doesn't exist yet
        return [];
      }
      
      const sessionList = [];
      for (const session of sessions) {
        if (session.type === 'directory') {
          const sessionId = session.name;
          
          // Try to load metadata and summary
          let metadata, summary;
          try {
            metadata = await this.s5Client.fs.get(`${userSessionsPath}/${sessionId}/metadata.json`);
          } catch {}
          try {
            summary = await this.s5Client.fs.get(`${userSessionsPath}/${sessionId}/summary.json`);
          } catch {}
          
          sessionList.push({ sessionId, metadata, summary });
        }
      }
      
      return sessionList;
    } catch (error: any) {
      console.debug('listSessionsDetailed error:', error.message);
      return [];
    }
  }

  // ============= Legacy Methods (Backward Compatibility) =============
  
  /**
   * Legacy method - stores entire conversation (inefficient)
   * @deprecated Use storeExchange() instead
   */
  async storeData(key: string, data: any, metadata?: Record<string, any>): Promise<string> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    try {
      const dataPath = `${StorageManager.CONVERSATION_PATH}/${this.userAddress}/${key}.json`;
      const storageData = {
        data,
        metadata: { ...metadata, timestamp: Date.now(), version: '1.0', userAddress: this.userAddress }
      };
      await this.s5Client.fs.put(dataPath, storageData);
      return dataPath;
    } catch (error: any) {
      throw new Error(`Failed to store data: ${error.message}`);
    }
  }

  /**
   * Legacy method - retrieves entire conversation
   * @deprecated Use getRecentExchanges() or getExchangesIterator() instead
   */
  async retrieveData(keyOrPath: string): Promise<any> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    try {
      const dataPath = keyOrPath.includes('/') 
        ? keyOrPath 
        : `${StorageManager.CONVERSATION_PATH}/${this.userAddress}/${keyOrPath}.json`;
      
      const retrievedData = await this.s5Client.fs.get(dataPath);
      if (!retrievedData) return null;
      return retrievedData.data || retrievedData;
    } catch (error: any) {
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        return null;
      }
      throw new Error(`Failed to retrieve data: ${error.message}`);
    }
  }

  /**
   * Legacy method - lists user data
   * @deprecated Use listSessions() instead
   */
  async listUserData(): Promise<Array<{ key: string; path: string; timestamp: number }>> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    try {
      const userPath = `${StorageManager.CONVERSATION_PATH}/${this.userAddress}`;
      
      const files = [];
      try {
        for await (const item of this.s5Client.fs.list(userPath)) {
          files.push(item);
        }
      } catch (error) {
        // Path doesn't exist yet
        return [];
      }
      
      const items = [];
      for (const file of files) {
        if (file && file.path) {
          const key = file.path.split('/').pop()?.replace('.json', '') || '';
          items.push({
            key,
            path: file.path,
            timestamp: file.timestamp || Date.now()
          });
        }
      }
      return items;
    } catch (error: any) {
      console.debug('listUserData error (returning empty):', error.message);
      return [];
    }
  }

  async listKeys(prefix: string = ''): Promise<string[]> {
    const items = await this.listUserData();
    return items
      .map(item => item.key)
      .filter(key => key.startsWith(prefix));
  }

  isInitialized(): boolean { return this.initialized; }
  
  // ============= Conversation-Based Methods for UI =============
  
  /**
   * Save a full conversation (for UI compatibility)
   */
  async saveConversation(sessionId: string, messages: Array<{ role: string; content: string }>): Promise<void> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    
    try {
      const conversationPath = `${StorageManager.CONVERSATION_PATH}/${this.userAddress}/${sessionId}/messages.json`;
      await this.s5Client.fs.put(conversationPath, messages);
    } catch (error: any) {
      throw new Error(`Failed to save conversation: ${error.message}`);
    }
  }
  
  /**
   * Load a full conversation (for UI compatibility)
   */
  async loadConversation(sessionId: string): Promise<Array<{ role: string; content: string }>> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    
    try {
      const conversationPath = `${StorageManager.CONVERSATION_PATH}/${this.userAddress}/${sessionId}/messages.json`;
      const messages = await this.s5Client.fs.get(conversationPath);
      return messages || [];
    } catch (error: any) {
      // Return empty array if conversation doesn't exist
      return [];
    }
  }
  
  /**
   * Save session metadata (for UI compatibility)
   */
  async saveSessionMetadata(sessionId: string, metadata: any): Promise<void> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    
    try {
      const metadataPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${sessionId}/ui-metadata.json`;
      await this.s5Client.fs.put(metadataPath, metadata);
    } catch (error: any) {
      throw new Error(`Failed to save session metadata: ${error.message}`);
    }
  }
  
  /**
   * Load session metadata (for UI compatibility)
   */
  async loadSessionMetadata(sessionId: string): Promise<any> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    
    try {
      const metadataPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${sessionId}/ui-metadata.json`;
      return await this.s5Client.fs.get(metadataPath);
    } catch (error: any) {
      return null;
    }
  }
  
  /**
   * List all sessions (for UI compatibility)
   */
  async listSessions(): Promise<Array<{ id: string; created?: number }>> {
    if (!this.initialized) throw new Error('StorageManager not initialized');
    
    try {
      const sessionsPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}`;
      
      const sessions = [];
      try {
        // fs.list returns an async iterator, not an array
        for await (const entry of this.s5Client.fs.list(sessionsPath)) {
          if (entry.type === 'directory') {
            // Try to get metadata for created timestamp
            let created = Date.now();
            try {
              const metadata = await this.s5Client.fs.get(`${sessionsPath}/${entry.name}/ui-metadata.json`);
              if (metadata?.createdAt) {
                created = metadata.createdAt;
              }
            } catch {}
            
            sessions.push({ 
              id: entry.name,
              created
            });
          }
        }
      } catch (error) {
        // Path doesn't exist yet, return empty array
        console.debug('Sessions path does not exist yet');
        return [];
      }
      
      return sessions;
    } catch (error: any) {
      console.debug('listSessions error:', error.message);
      return [];
    }
  }
}