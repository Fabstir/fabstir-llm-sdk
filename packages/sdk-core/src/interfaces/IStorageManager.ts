// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Storage Manager Interface
 * Browser-compatible storage operations using S5.js
 */

import { StorageOptions, StorageResult, ConversationData, Message } from '../types';
import { UserSettings, PartialUserSettings, HostSelectionMode } from '../types/settings.types';
import { ModelInfo } from '../types/models';

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

  /**
   * Get S5 client instance (for VectorRAGManager)
   */
  getS5Client(): any;

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

  // ============= AI Preference Helper Methods (Phase 4.1) =============

  /**
   * Set ModelManager for preference helpers
   * Required for getDefaultModel() and setDefaultModel() validation
   *
   * @param modelManager - ModelManager instance with getModelDetails method
   */
  setModelManager(modelManager: { getModelDetails(modelId: string): Promise<ModelInfo | null> }): void;

  /**
   * Get user's default model
   * Returns ModelInfo if a default is set, null otherwise
   *
   * @returns ModelInfo if default is set and model exists, null otherwise
   * @throws Error if ModelManager not set
   * @example
   * ```typescript
   * const defaultModel = await storageManager.getDefaultModel();
   * if (defaultModel) {
   *   console.log('Default model:', defaultModel.fileName);
   * }
   * ```
   */
  getDefaultModel(): Promise<ModelInfo | null>;

  /**
   * Set user's default model
   * Pass null to clear the default
   * Validates model exists before setting
   *
   * @param modelId - Model ID to set as default, or null to clear
   * @throws Error if ModelManager not set or model not found
   * @example
   * ```typescript
   * await storageManager.setDefaultModel('0x...'); // Set default
   * await storageManager.setDefaultModel(null);    // Clear default
   * ```
   */
  setDefaultModel(modelId: string | null): Promise<void>;

  /**
   * Get user's host selection mode
   * Returns AUTO if not set or no settings exist
   *
   * @returns Current HostSelectionMode
   * @example
   * ```typescript
   * const mode = await storageManager.getHostSelectionMode();
   * console.log('Selection mode:', mode); // 'auto', 'cheapest', etc.
   * ```
   */
  getHostSelectionMode(): Promise<HostSelectionMode>;

  /**
   * Set user's host selection mode
   * For SPECIFIC mode, preferredHostAddress is required
   *
   * @param mode - HostSelectionMode to set
   * @param preferredHostAddress - Required for SPECIFIC mode
   * @throws Error if SPECIFIC mode without preferredHostAddress
   * @example
   * ```typescript
   * await storageManager.setHostSelectionMode(HostSelectionMode.CHEAPEST);
   * await storageManager.setHostSelectionMode(HostSelectionMode.SPECIFIC, '0x...');
   * ```
   */
  setHostSelectionMode(mode: HostSelectionMode, preferredHostAddress?: string): Promise<void>;

  /**
   * Clear all AI preferences (model and host)
   * Resets to defaults without affecting other settings
   *
   * @example
   * ```typescript
   * await storageManager.clearAIPreferences();
   * // defaultModelId = null
   * // hostSelectionMode = AUTO
   * // preferredHostAddress = null
   * ```
   */
  clearAIPreferences(): Promise<void>;
}