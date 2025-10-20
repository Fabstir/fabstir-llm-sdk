// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Supported wallet provider types
 */
export enum WalletProviderType {
  METAMASK = 'metamask',
  RAINBOW = 'rainbow',
  EOA = 'eoa', // Generic EOA provider
  BASE_ACCOUNT_KIT = 'base-account-kit'
}

/**
 * Options for wallet provider selection
 */
export interface WalletProviderOptions {
  preferGasless?: boolean;
  priority?: WalletProviderType[];
  config?: any; // Provider-specific configuration
}