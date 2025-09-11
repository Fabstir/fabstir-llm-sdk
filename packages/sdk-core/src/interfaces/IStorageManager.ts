/**
 * Storage Manager Interface
 * Browser-compatible storage operations using S5.js
 */

import { StorageOptions, StorageResult, ConversationData, Message } from '../types';

export interface IStorageManager {
  /**
   * Initialize storage with S5 seed
   */
  initialize(seed: string): Promise<void>;
  
  /**
   * Store data to S5 network
   */
  store(
    data: string | Uint8Array | object,
    options?: StorageOptions
  ): Promise<StorageResult>;
  
  /**
   * Retrieve data from S5 network
   */
  retrieve(cid: string): Promise<any>;
  
  /**
   * Store a conversation
   */
  storeConversation(conversation: ConversationData): Promise<StorageResult>;
  
  /**
   * Retrieve a conversation
   */
  retrieveConversation(conversationId: string): Promise<ConversationData>;
  
  /**
   * List all conversations
   */
  listConversations(): Promise<ConversationData[]>;
  
  /**
   * Add message to conversation
   */
  addMessage(
    conversationId: string,
    message: Message
  ): Promise<void>;
  
  /**
   * Delete data
   */
  delete(cid: string): Promise<void>;
  
  /**
   * Check if data exists
   */
  exists(cid: string): Promise<boolean>;
  
  /**
   * Get storage statistics
   */
  getStats(): Promise<{
    totalSize: number;
    fileCount: number;
    conversations: number;
  }>;
  
  /**
   * Clear all local cache
   */
  clearCache(): Promise<void>;
}