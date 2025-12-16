// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @file User Settings Types
 * @description TypeScript types and interfaces for user settings storage via S5
 */

/**
 * Schema version for UserSettings
 * Used for migrations when settings structure changes
 */
export enum UserSettingsVersion {
  /** Initial version (v1.2.0) */
  V1 = 1,
  /** V2: Added model/host selection preferences (v1.6.0) */
  V2 = 2,
}

/**
 * Host selection algorithm mode
 * Determines how hosts are selected for sessions
 *
 * @example
 * ```typescript
 * // Use weighted algorithm (default)
 * settings.hostSelectionMode = HostSelectionMode.AUTO;
 *
 * // Always pick cheapest host
 * settings.hostSelectionMode = HostSelectionMode.CHEAPEST;
 *
 * // Use a specific preferred host
 * settings.hostSelectionMode = HostSelectionMode.SPECIFIC;
 * settings.preferredHostAddress = '0x...';
 * ```
 */
export enum HostSelectionMode {
  /** Weighted algorithm balancing price, stake, uptime, and latency (default) */
  AUTO = 'auto',
  /** Select lowest price host first */
  CHEAPEST = 'cheapest',
  /** Prioritize hosts with highest stake and uptime */
  RELIABLE = 'reliable',
  /** Prioritize hosts with lowest latency */
  FASTEST = 'fastest',
  /** Use preferredHostAddress (throws error if unavailable) */
  SPECIFIC = 'specific',
}

/**
 * User preferences and settings stored in S5 decentralized storage
 * Path: /user/settings.json
 *
 * @example
 * ```typescript
 * const settings: UserSettings = {
 *   version: UserSettingsVersion.V1,
 *   lastUpdated: Date.now(),
 *   selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
 *   preferredPaymentToken: 'USDC',
 *   theme: 'dark'
 * };
 * ```
 */
export interface UserSettings {
  // ============ Metadata ============

  /** Schema version for migrations */
  version: UserSettingsVersion;

  /** Last update timestamp (Unix milliseconds) */
  lastUpdated: number;

  // ============ Model Preferences ============

  /** Currently selected model (e.g., "tiny-vicuna-1b.q4_k_m.gguf") */
  selectedModel: string;

  /**
   * Default model ID (bytes32 hash) to use for new sessions
   * Set to null if no default is configured
   * @since V2
   */
  defaultModelId: string | null;

  /** Recently used models (max 5) */
  lastUsedModels?: string[];

  // ============ Host Preferences ============

  /**
   * Host selection algorithm mode
   * Determines how hosts are selected when no explicit host is specified
   * @default HostSelectionMode.AUTO
   * @since V2
   */
  hostSelectionMode: HostSelectionMode;

  /**
   * Preferred host address for SPECIFIC mode
   * Only used when hostSelectionMode is SPECIFIC
   * Set to null for other modes
   * @since V2
   */
  preferredHostAddress: string | null;

  /** Last successfully used host address */
  lastHostAddress?: string;

  /** User-favorited host addresses */
  preferredHosts?: string[];

  // ============ Payment Preferences ============

  /** Default payment token */
  preferredPaymentToken?: 'USDC' | 'ETH';

  /** Auto-approve amount (e.g., "10.0") */
  autoApproveAmount?: string;

  // ============ UI Preferences ============

  /** Show/hide advanced settings panel */
  advancedSettingsExpanded?: boolean;

  /** UI theme preference */
  theme?: 'light' | 'dark' | 'auto';
}

/**
 * Partial user settings for updates
 * Excludes version and lastUpdated (managed by SDK)
 *
 * @example
 * ```typescript
 * const update: PartialUserSettings = {
 *   selectedModel: 'mistral-7b.q4_k_m.gguf'
 * };
 * await storageManager.updateUserSettings(update);
 * ```
 */
export type PartialUserSettings = Partial<
  Omit<UserSettings, 'version' | 'lastUpdated'>
>;
