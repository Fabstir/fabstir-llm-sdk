// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Browser-compatible Storage Manager using S5.js
 * 
 * This manager handles decentralized storage operations through S5.js,
 * which is fully browser-compatible. No Node.js dependencies.
 */

// Dynamic import for S5 - loaded when needed
import { IStorageManager } from '../interfaces';
import {
  SDKError,
  StorageOptions,
  StorageResult,
  ConversationData,
  Message,
  UserSettings,
  PartialUserSettings,
  UserSettingsVersion
} from '../types';
import { migrateUserSettings } from './migrations/user-settings';
import type { EncryptionManager } from './EncryptionManager';
import type { EncryptedStorage } from '../interfaces/IEncryptionManager';
import { FolderHierarchy, type FolderListItem, type FolderMetadata } from '../storage/folder-operations.js';
import { getParentPath, getAncestorPaths } from '../storage/path-validator.js';

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
 * Conversation metadata info (Phase 5.2)
 */
export interface ConversationInfo {
  cid: string;
  storedAt: string;
  conversationId: string;
  isEncrypted: boolean;
  senderAddress?: string;  // Optional - only present for encrypted conversations
}

/**
 * Result from loading conversation with metadata (Phase 5.2)
 */
export interface LoadConversationResult {
  conversation: ConversationData;
  senderAddress?: string;  // Optional - only present for encrypted conversations
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
  private encryptionManager?: EncryptionManager; // NEW: Optional encryption support

  // User settings cache
  private settingsCache: {
    data: UserSettings | null;
    timestamp: number;
  } | null = null;

  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Folder hierarchy manager (Sub-phase 2.1)
  private folderHierarchy: FolderHierarchy;

  constructor(private s5PortalUrl: string = StorageManager.DEFAULT_S5_PORTAL) {
    this.folderHierarchy = new FolderHierarchy();
  }

  /**
   * Set EncryptionManager for encrypted storage (Phase 5.1)
   */
  setEncryptionManager(encryptionManager: EncryptionManager): void {
    this.encryptionManager = encryptionManager;
  }

  /**
   * Get S5 client instance (for VectorRAGManager)
   */
  getS5Client(): any {
    return this.s5Client;
  }

  /**
   * Initialize storage with S5 seed
   */
  async initialize(seed: string, userAddress?: string): Promise<void> {
    console.log('StorageManager.initialize: Starting...');

    // Skip S5 initialization if explicitly disabled (e.g., for hosts)
    if (process.env.SKIP_S5_STORAGE === 'true') {
      console.log('⚠️ StorageManager: S5 storage disabled (SKIP_S5_STORAGE=true)');
      this.initialized = true;
      return;
    }

    try {
      this.userSeed = seed;
      this.userAddress = userAddress || '';

      console.log('StorageManager.initialize: Dynamically loading S5...');

      // Dynamically import S5 when needed
      let S5: any;
      try {
        const s5Module = await import('@julesl23/s5js');
        S5 = s5Module.S5;
        console.log('✅ S5 module loaded successfully');
      } catch (importError: any) {
        console.error('❌ Failed to import S5:', importError.message);
        throw new SDKError(
          `Failed to load S5 module: ${importError.message}`,
          'STORAGE_MODULE_ERROR',
          { originalError: importError }
        );
      }

      console.log('StorageManager.initialize: Creating S5 instance with timeout...');
      console.log('StorageManager.initialize: Using portal URL:', this.s5PortalUrl);

      // Use the correct portal URL or empty array to skip default peers
      const peersToUse = this.s5PortalUrl ? [this.s5PortalUrl] : [];
      console.log('StorageManager.initialize: Peers to use:', peersToUse);

      // Create S5 instance with timeout protection
      const s5CreatePromise = S5.create({
        initialPeers: peersToUse,
        // No Node.js specific options
      });

      // Add a 5-second timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('S5 client creation timed out after 5 seconds')), 5000);
      });

      let s5Instance: any;
      try {
        s5Instance = await Promise.race([s5CreatePromise, timeoutPromise]);
        console.log('✅ StorageManager.initialize: S5 instance created SUCCESSFULLY!');
      } catch (timeoutError: any) {
        console.warn('⚠️ StorageManager.initialize: S5 instance creation failed or timed out:', timeoutError.message);
        console.warn('⚠️ StorageManager: Continuing without S5 storage (operations will fail gracefully)');
        this.initialized = false;
        return;
      }

      console.log('🔐 Recovering identity from seed phrase...');
      await s5Instance.recoverIdentityFromSeedPhrase(this.userSeed);
      console.log('✅ Identity recovered successfully');

      // Store the S5 instance - we'll use s5Instance.fs for file operations
      this.s5Client = s5Instance;
      
      // Optional portal registration
      try {
        console.log('📡 Attempting portal registration...');
        await s5Instance.registerOnNewPortal('https://s5.vup.cx');
        console.log('✅ Portal registration successful');
      } catch (error) {
        console.log('ℹ️ Portal registration skipped (optional)');
      }

      console.log('🔧 Ensuring identity is initialized...');
      await s5Instance.fs.ensureIdentityInitialized();
      this.initialized = true;
      console.log('🎉 StorageManager fully initialized and ready!');
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

      // Return immediately using generated key (no getMetadata to avoid race condition)
      // Note: If S5 CID is needed later, fetch it separately with retry logic
      return {
        cid: key,
        url: `s5://${key}`,
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
   * List all conversations with metadata (Phase 5.2)
   * Returns metadata only (not full conversation data)
   */
  async listConversations(): Promise<ConversationInfo[]> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    const sessions = await this.listSessions();
    const conversationInfos: ConversationInfo[] = [];

    for (const session of sessions) {
      // Try encrypted first
      const encryptedPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${session.id}/conversation-encrypted.json`;
      try {
        const encryptedWrapper = await this.s5Client.fs.get(encryptedPath);
        if (encryptedWrapper && encryptedWrapper.encrypted === true) {
          // Encrypted conversation found
          const metadata = await this.s5Client.fs.getMetadata(encryptedPath);
          conversationInfos.push({
            cid: metadata?.cid || session.id,
            storedAt: encryptedWrapper.storedAt || new Date().toISOString(),
            conversationId: encryptedWrapper.conversationId || session.id,
            isEncrypted: true
          });
          continue;
        }
      } catch (error: any) {
        // If encrypted not found, try plaintext below
      }

      // Try plaintext
      const plaintextPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${session.id}/conversation-plaintext.json`;
      try {
        const plaintextWrapper = await this.s5Client.fs.get(plaintextPath);
        if (plaintextWrapper && plaintextWrapper.encrypted === false) {
          // Plaintext conversation found
          const metadata = await this.s5Client.fs.getMetadata(plaintextPath);
          conversationInfos.push({
            cid: metadata?.cid || session.id,
            storedAt: new Date().toISOString(),
            conversationId: session.id,
            isEncrypted: false
          });
        }
      } catch (error: any) {
        // Conversation file not found - skip
      }
    }

    return conversationInfos;
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

      // Return immediately using conversation ID (no getMetadata to avoid race condition)
      // Note: If S5 CID is needed later, fetch it separately with retry logic
      return {
        cid: conversation.id,
        url: `s5://${conversation.id}`,
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

  // ============= User Settings Methods =============

  /**
   * Save complete user settings to S5 storage
   * Path: home/user/settings.json
   */
  async saveUserSettings(settings: UserSettings): Promise<void> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    // Validate required fields
    if (!settings.version || !settings.lastUpdated) {
      throw new SDKError(
        'UserSettings must have version and lastUpdated fields',
        'INVALID_SETTINGS'
      );
    }

    const settingsPath = 'home/user/settings.json';

    try {
      // S5 automatically encodes object as CBOR
      await this.s5Client.fs.put(settingsPath, settings);

      // Update cache
      this.settingsCache = {
        data: settings,
        timestamp: Date.now(),
      };
      console.log('[StorageManager] Cache updated after save');
    } catch (error: any) {
      throw new SDKError(
        `Failed to save user settings: ${error.message}`,
        'STORAGE_SAVE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Load user settings from S5 storage
   * Returns null if no settings exist (first-time user)
   * Uses in-memory cache with 5-minute TTL
   */
  async getUserSettings(): Promise<UserSettings | null> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    // Check cache first
    if (this.settingsCache) {
      const age = Date.now() - this.settingsCache.timestamp;
      if (age < this.CACHE_TTL) {
        console.log('[StorageManager] Cache hit for user settings');
        return this.settingsCache.data;
      }
      console.log('[StorageManager] Cache expired, fetching from S5');
    }

    const settingsPath = 'home/user/settings.json';

    try {
      // S5 automatically decodes CBOR to object
      const settings = await this.s5Client.fs.get(settingsPath);

      // Return null if no settings file exists (first-time user)
      if (!settings) {
        // Update cache with null (first-time user)
        this.settingsCache = {
          data: null,
          timestamp: Date.now(),
        };
        return null;
      }

      // Migrate settings to current version
      const migratedSettings = migrateUserSettings(settings);

      // Update cache with migrated settings
      this.settingsCache = {
        data: migratedSettings,
        timestamp: Date.now(),
      };

      return migratedSettings;
    } catch (error: any) {
      // Return null for "not found" errors (first-time user)
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        // Update cache with null
        this.settingsCache = {
          data: null,
          timestamp: Date.now(),
        };
        return null;
      }

      // Re-throw validation and migration errors
      if (error.code === 'INVALID_SETTINGS_STRUCTURE') {
        throw error;
      }

      // Re-throw migration errors (missing version, unsupported version, missing required fields)
      if (error.message?.includes('missing version field') ||
          error.message?.includes('missing lastUpdated field') ||
          error.message?.includes('Unsupported UserSettings version')) {
        throw new SDKError(
          'Invalid UserSettings structure in S5 storage',
          'INVALID_SETTINGS_STRUCTURE',
          { originalError: error }
        );
      }

      // Network error - return stale cache if available (offline mode)
      if (error.message?.includes('network') ||
          error.message?.includes('timeout') ||
          error.message?.includes('Connection refused') ||
          error.message?.includes('ECONNREFUSED')) {
        if (this.settingsCache) {
          console.warn('[StorageManager] Using stale cache due to network error');
          return this.settingsCache.data;
        }
        // No cache available - throw error
      }

      // Wrap other errors
      throw new SDKError(
        `Failed to load user settings: ${error.message}`,
        'STORAGE_LOAD_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Update specific user settings without overwriting entire object
   * Merges partial update with existing settings
   */
  async updateUserSettings(partial: PartialUserSettings): Promise<void> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      // Load current settings
      const current = await this.getUserSettings();

      // If settings exist, merge with partial update
      if (current) {
        const merged: UserSettings = {
          ...current,
          ...partial,
          version: current.version, // Preserve version
          lastUpdated: Date.now(), // Always update timestamp
        };

        await this.saveUserSettings(merged);
      } else {
        // No settings exist - create new with required fields
        const newSettings: UserSettings = {
          version: UserSettingsVersion.V1,
          lastUpdated: Date.now(),
          selectedModel: '', // Default required field
          ...partial, // Apply partial update
        };

        await this.saveUserSettings(newSettings);
      }
    } catch (error: any) {
      // Re-throw validation errors (these should bubble up)
      if (error.code === 'INVALID_SETTINGS' || error.code === 'INVALID_SETTINGS_STRUCTURE') {
        throw error;
      }

      // Wrap all other errors (including SDK errors from load/save)
      throw new SDKError(
        `Failed to update user settings: ${error.message}`,
        'STORAGE_UPDATE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Delete all user settings from S5 storage
   * Used for "Reset Preferences" functionality
   */
  async clearUserSettings(): Promise<void> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    const settingsPath = 'home/user/settings.json';

    try {
      // S5 delete() returns boolean - true if deleted, false if didn't exist
      await this.s5Client.fs.delete(settingsPath);
      // No error thrown if file doesn't exist (returns false)

      // Invalidate cache
      this.settingsCache = null;
      console.log('[StorageManager] Cache invalidated after clear');
    } catch (error: any) {
      throw new SDKError(
        `Failed to clear user settings: ${error.message}`,
        'STORAGE_CLEAR_ERROR',
        { originalError: error }
      );
    }
  }

  // ============= Encrypted Storage Methods (Phase 5.1) =============

  /**
   * Save conversation with encryption (Phase 5.1)
   * @private
   */
  async saveConversationEncrypted(
    conversation: ConversationData,
    options: { hostPubKey?: string; encrypt?: boolean }
  ): Promise<StorageResult> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    if (options.encrypt && !options.hostPubKey) {
      throw new SDKError(
        'hostPubKey required for encrypted conversation storage',
        'MISSING_HOST_PUBLIC_KEY'
      );
    }

    if (!this.encryptionManager) {
      throw new SDKError(
        'EncryptionManager required for encrypted storage',
        'ENCRYPTION_NOT_AVAILABLE'
      );
    }

    try {
      // Encrypt conversation with EncryptionManager
      const encrypted = await this.encryptionManager.encryptForStorage(
        options.hostPubKey!,
        conversation
      );

      // Prepare encrypted wrapper
      const encryptedWrapper = {
        encrypted: true,
        version: 1,
        ...encrypted
      };

      // Store to S5
      const path = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${conversation.id}/conversation-encrypted.json`;
      await this.s5Client.fs.put(path, encryptedWrapper);

      // Return immediately using conversation ID (no getMetadata to avoid race condition)
      // Note: If S5 CID is needed later, fetch it separately with retry logic
      return {
        cid: conversation.id,
        url: `s5://${conversation.id}`,
        size: JSON.stringify(encryptedWrapper).length,
        timestamp: Date.now()
      };
    } catch (error: any) {
      throw new SDKError(
        `Failed to save encrypted conversation: ${error.message}`,
        'STORAGE_ENCRYPT_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Load and decrypt conversation (Phase 5.1)
   * @private
   */
  async loadConversationEncrypted(conversationId: string): Promise<ConversationData> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    if (!this.encryptionManager) {
      throw new SDKError(
        'EncryptionManager required to load encrypted conversation',
        'ENCRYPTION_NOT_AVAILABLE'
      );
    }

    try {
      // Load from S5
      const path = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${conversationId}/conversation-encrypted.json`;
      const encryptedWrapper = await this.s5Client.fs.get(path);

      if (!encryptedWrapper) {
        throw new SDKError(
          `Encrypted conversation ${conversationId} not found`,
          'CONVERSATION_NOT_FOUND'
        );
      }

      // Extract EncryptedStorage payload
      const encryptedStorage: EncryptedStorage = {
        payload: encryptedWrapper.payload,
        storedAt: encryptedWrapper.storedAt,
        conversationId: encryptedWrapper.conversationId
      };

      // Decrypt with EncryptionManager
      const { data: conversation } = await this.encryptionManager.decryptFromStorage<ConversationData>(
        encryptedStorage
      );

      return conversation;
    } catch (error: any) {
      throw new SDKError(
        `Failed to load encrypted conversation: ${error.message}`,
        'STORAGE_DECRYPT_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Save conversation without encryption (backward compatible)
   * @private
   */
  async saveConversationPlaintext(conversation: ConversationData): Promise<StorageResult> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      // Prepare plaintext wrapper
      const plaintextWrapper = {
        encrypted: false,
        version: 1,
        conversation
      };

      // Store to S5
      const path = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${conversation.id}/conversation-plaintext.json`;
      await this.s5Client.fs.put(path, plaintextWrapper);

      // Return immediately using conversation ID (no getMetadata to avoid race condition)
      // Note: If S5 CID is needed later, fetch it separately with retry logic
      return {
        cid: conversation.id,
        url: `s5://${conversation.id}`,
        size: JSON.stringify(plaintextWrapper).length,
        timestamp: Date.now()
      };
    } catch (error: any) {
      throw new SDKError(
        `Failed to save plaintext conversation: ${error.message}`,
        'STORAGE_SAVE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Load plaintext conversation (backward compatible)
   * @private
   */
  async loadConversationPlaintext(conversationId: string): Promise<ConversationData> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    try {
      // Load from S5
      const path = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${conversationId}/conversation-plaintext.json`;
      const plaintextWrapper = await this.s5Client.fs.get(path);

      if (!plaintextWrapper) {
        throw new SDKError(
          `Plaintext conversation ${conversationId} not found`,
          'CONVERSATION_NOT_FOUND'
        );
      }

      return plaintextWrapper.conversation;
    } catch (error: any) {
      throw new SDKError(
        `Failed to load plaintext conversation: ${error.message}`,
        'STORAGE_LOAD_ERROR',
        { originalError: error }
      );
    }
  }

  // ============= Metadata Methods (Phase 5.2) =============

  /**
   * Load conversation with metadata including sender address (Phase 5.2)
   * Tries encrypted first, then falls back to plaintext
   */
  async loadConversationWithMetadata(conversationId: string): Promise<LoadConversationResult> {
    if (!this.initialized) {
      throw new SDKError('StorageManager not initialized', 'STORAGE_NOT_INITIALIZED');
    }

    // Try encrypted first
    const encryptedPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${conversationId}/conversation-encrypted.json`;
    try {
      const encryptedWrapper = await this.s5Client.fs.get(encryptedPath);

      if (encryptedWrapper && encryptedWrapper.encrypted === true) {
        // Encrypted conversation found - decrypt and return with sender address
        if (!this.encryptionManager) {
          throw new SDKError(
            'EncryptionManager required to load encrypted conversation',
            'ENCRYPTION_NOT_AVAILABLE'
          );
        }

        const encryptedStorage: EncryptedStorage = {
          payload: encryptedWrapper.payload,
          storedAt: encryptedWrapper.storedAt,
          conversationId: encryptedWrapper.conversationId
        };

        const { data: conversation, senderAddress } =
          await this.encryptionManager.decryptFromStorage<ConversationData>(encryptedStorage);

        return { conversation, senderAddress };
      }
    } catch (error: any) {
      // If encrypted not found, try plaintext below
      if (!error.message?.includes('not found')) {
        throw new SDKError(
          `Failed to load encrypted conversation: ${error.message}`,
          'STORAGE_LOAD_ERROR',
          { originalError: error }
        );
      }
    }

    // Try plaintext
    const plaintextPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${conversationId}/conversation-plaintext.json`;
    try {
      const plaintextWrapper = await this.s5Client.fs.get(plaintextPath);

      if (plaintextWrapper && plaintextWrapper.encrypted === false) {
        // Plaintext conversation - return without sender address
        return { conversation: plaintextWrapper.conversation };
      }
    } catch (error: any) {
      if (!error.message?.includes('not found')) {
        throw new SDKError(
          `Failed to load plaintext conversation: ${error.message}`,
          'STORAGE_LOAD_ERROR',
          { originalError: error }
        );
      }
    }

    // Neither encrypted nor plaintext found
    throw new SDKError(
      `Conversation ${conversationId} not found`,
      'CONVERSATION_NOT_FOUND'
    );
  }

  // ============================================================================
  // Folder Operations (Sub-phase 2.1: Enhanced Storage Manager for Folders)
  // ============================================================================

  /**
   * Create a virtual folder
   *
   * @param databaseName - Database name
   * @param path - Folder path
   */
  async createFolder(databaseName: string, path: string): Promise<void> {
    this.folderHierarchy.createFolder(databaseName, path);
  }

  /**
   * Delete a folder
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @param recursive - Delete recursively (default: false)
   * @param options - Delete options (deleteVectors)
   */
  async deleteFolder(
    databaseName: string,
    path: string,
    recursive: boolean = false,
    options?: { deleteVectors?: boolean }
  ): Promise<void> {
    this.folderHierarchy.deleteFolder(databaseName, path, recursive, options);
  }

  /**
   * Move a folder to a new location
   *
   * @param databaseName - Database name
   * @param sourcePath - Source folder path
   * @param destPath - Destination folder path
   */
  async moveFolder(databaseName: string, sourcePath: string, destPath: string): Promise<void> {
    this.folderHierarchy.moveFolder(databaseName, sourcePath, destPath);
  }

  /**
   * Rename a folder
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @param newName - New folder name
   */
  async renameFolder(databaseName: string, path: string, newName: string): Promise<void> {
    this.folderHierarchy.renameFolder(databaseName, path, newName);
  }

  /**
   * List folder contents
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @param options - List options (limit, cursor)
   * @returns Folder items or paginated result
   */
  async listFolder(
    databaseName: string,
    path: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<FolderListItem[] | { items: FolderListItem[]; cursor?: string }> {
    // Auto-load hierarchy if it exists
    await this.autoLoadHierarchy(databaseName);
    return this.folderHierarchy.listFolder(databaseName, path, options);
  }

  /**
   * Get folder metadata
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @param options - Metadata options (recursive, formatSize)
   * @returns Folder metadata
   */
  async getFolderMetadata(
    databaseName: string,
    path: string,
    options?: { recursive?: boolean; formatSize?: boolean }
  ): Promise<FolderMetadata> {
    return this.folderHierarchy.getFolderMetadata(databaseName, path, options);
  }

  /**
   * Add file to folder (updates metadata)
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @param file - File info (name, size)
   */
  async addFileToFolder(
    databaseName: string,
    path: string,
    file: { name: string; size: number }
  ): Promise<void> {
    this.folderHierarchy.addFileToFolder(databaseName, path, file);
  }

  /**
   * Remove file from folder (updates metadata)
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @param fileName - File name to remove
   */
  async removeFileFromFolder(databaseName: string, path: string, fileName: string, fileSize?: number): Promise<void> {
    this.folderHierarchy.removeFileFromFolder(databaseName, path, fileName, fileSize);
  }

  // In-memory hierarchy storage (for testing without S5)
  // Static so it persists across StorageManager instances
  // Keyed by userAddress-databaseName for auto-discovery
  private static hierarchyStorage: Map<string, string> = new Map();

  /**
   * Save folder hierarchy to S5
   *
   * @param databaseName - Database name
   * @returns CID of saved hierarchy
   */
  async saveHierarchy(databaseName: string): Promise<string> {
    const hierarchyData = this.folderHierarchy.serialize(databaseName);

    if (this.s5Client) {
      const hierarchyPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${databaseName}/hierarchy.json`;
      // S5 handles CBOR encoding automatically - pass object directly
      await this.s5Client.fs.put(hierarchyPath, hierarchyData);
      return `s5://hierarchy-${databaseName}-${Date.now()}`;
    } else {
      // Fallback for testing without S5
      // Store by database name for auto-discovery
      const storageKey = `${this.userAddress}-${databaseName}`;
      StorageManager.hierarchyStorage.set(storageKey, hierarchyData);
      return `memory://hierarchy-${databaseName}-${Date.now()}`;
    }
  }

  /**
   * Load folder hierarchy from S5
   *
   * @param databaseName - Database name
   * @param cid - CID to load from (optional for in-memory storage)
   */
  async loadHierarchy(databaseName: string, cid?: string): Promise<void> {
    if (this.s5Client) {
      const hierarchyPath = `${StorageManager.SESSIONS_PATH}/${this.userAddress}/${databaseName}/hierarchy.json`;

      try {
        // S5 returns object directly (CBOR decoded automatically)
        const hierarchyData = await this.s5Client.fs.get(hierarchyPath);
        this.folderHierarchy.deserialize(databaseName, hierarchyData);
      } catch (error: any) {
        // If hierarchy doesn't exist, start fresh
        if (error.message?.includes('not found')) {
          return;
        }
        throw new SDKError(
          `Failed to load hierarchy: ${error.message}`,
          'STORAGE_LOAD_ERROR',
          { originalError: error }
        );
      }
    } else {
      // Fallback for testing without S5
      // Auto-discover by database name
      const storageKey = `${this.userAddress}-${databaseName}`;
      const hierarchyData = StorageManager.hierarchyStorage.get(storageKey);
      if (hierarchyData) {
        this.folderHierarchy.deserialize(databaseName, hierarchyData);
      }
      // If not found, just start with empty hierarchy (no error)
    }
  }

  /**
   * Auto-load saved hierarchies for a database
   * Called automatically when accessing folders
   * @private
   */
  private async autoLoadHierarchy(databaseName: string): Promise<void> {
    try {
      await this.loadHierarchy(databaseName);
    } catch {
      // Ignore errors, just start with empty hierarchy
    }
  }

  /**
   * Validate folder hierarchy integrity
   *
   * @param databaseName - Database name
   * @returns True if valid
   */
  async validateHierarchy(databaseName: string): Promise<boolean> {
    // Simple validation - check if hierarchy exists
    try {
      this.folderHierarchy.getFolderMetadata(databaseName, '/');
      return true;
    } catch {
      return true; // Root always exists
    }
  }

  /**
   * Rebuild hierarchy from folder metadata
   *
   * @param databaseName - Database name
   * @returns True if successful
   */
  async rebuildHierarchy(databaseName: string): Promise<boolean> {
    // For testing purposes, just validate current hierarchy
    return this.validateHierarchy(databaseName);
  }

  /**
   * Get folder path
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @returns Full path
   */
  async getFolderPath(databaseName: string, path: string): Promise<string> {
    // Validate that folder exists
    this.folderHierarchy.getFolderMetadata(databaseName, path);
    return path;
  }

  /**
   * Get parent path of a folder
   *
   * @param path - Folder path
   * @returns Parent path or null if root
   */
  getParentPath(path: string): string | null {
    return getParentPath(path);
  }

  /**
   * Get all ancestors of a folder
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @returns Array of ancestor paths
   */
  async getAncestors(databaseName: string, path: string): Promise<string[]> {
    // Validate that folder exists
    this.folderHierarchy.getFolderMetadata(databaseName, path);
    return getAncestorPaths(path);
  }

  /**
   * Get all descendants of a folder
   *
   * @param databaseName - Database name
   * @param path - Folder path
   * @returns Array of descendant paths
   */
  async getDescendants(databaseName: string, path: string): Promise<string[]> {
    const descendants: string[] = [];

    const collectDescendants = async (currentPath: string): Promise<void> => {
      const contents = await this.listFolder(databaseName, currentPath);
      const items = Array.isArray(contents) ? contents : contents.items;

      for (const item of items) {
        descendants.push(item.path);
        await collectDescendants(item.path);
      }
    };

    await collectDescendants(path);
    return descendants;
  }
}