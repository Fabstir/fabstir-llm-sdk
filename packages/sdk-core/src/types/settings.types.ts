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

  /** Recently used models (max 5) */
  lastUsedModels?: string[];

  // ============ Host Preferences ============

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
