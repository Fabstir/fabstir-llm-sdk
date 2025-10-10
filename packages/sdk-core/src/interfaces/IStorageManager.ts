/**
 * Storage Manager Interface
 * Browser-compatible storage operations using S5.js
 */

import { StorageOptions, StorageResult, ConversationData, Message } from '../types';
import { UserSettings, PartialUserSettings } from '../types/settings.types';

export interface IStorageManager {
  /**
   * Initialize storage with S5 seed
   */
  initialize(seed: string): Promise<void>;

  /**
   * Check if storage is initialized
   */
  isInitialized(): boolean;
  
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

  // ============= User Settings Methods =============

  /**
   * Save complete user settings to S5 storage
   * Path: /user/settings.json
   *
   * @param settings - Complete UserSettings object with version and lastUpdated
   * @throws Error if S5 not initialized or save fails
   * @example
   * ```typescript
   * await storageManager.saveUserSettings({
   *   version: UserSettingsVersion.V1,
   *   lastUpdated: Date.now(),
   *   selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
   *   preferredPaymentToken: 'USDC'
   * });
   * ```
   */
  saveUserSettings(settings: UserSettings): Promise<void>;

  /**
   * Load user settings from S5 storage
   * Returns cached value if available within 5-minute TTL
   *
   * @returns UserSettings object if found, null if no settings exist (first-time user)
   * @throws Error if S5 not initialized or network error (when no cache available)
   * @example
   * ```typescript
   * const settings = await storageManager.getUserSettings();
   * if (settings) {
   *   console.log('Model:', settings.selectedModel);
   * } else {
   *   console.log('First-time user');
   * }
   * ```
   */
  getUserSettings(): Promise<UserSettings | null>;

  /**
   * Update specific settings without overwriting entire object
   * Merges partial update with existing settings
   *
   * @param partial - Partial settings to merge (version/lastUpdated managed by SDK)
   * @throws Error if S5 not initialized or update fails
   * @example
   * ```typescript
   * await storageManager.updateUserSettings({
   *   selectedModel: 'mistral-7b.q4_k_m.gguf'
   * });
   * // Other settings remain unchanged
   * ```
   */
  updateUserSettings(partial: PartialUserSettings): Promise<void>;

  /**
   * Delete all user settings from S5 storage
   * Useful for "Reset Preferences" functionality
   *
   * @throws Error if S5 not initialized or delete fails
   * @example
   * ```typescript
   * await storageManager.clearUserSettings();
   * // Subsequent getUserSettings() will return null
   * ```
   */
  clearUserSettings(): Promise<void>;
}