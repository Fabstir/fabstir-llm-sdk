// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Host Manager Interface
 * Browser-compatible host/node management
 */

import { HostInfo, HostMetadata, ModelSpec, ModelPricing } from '../types/models';
import { HostRegistrationWithModels } from '../managers/HostManager';
import type { WebSearchCapabilities } from '../types/web-search.types';

export interface IHostManager {
  /**
   * Register as a host/node with model support
   */
  registerHostWithModels(request: HostRegistrationWithModels): Promise<string>;

  /**
   * Unregister as a host
   */
  unregisterHost(): Promise<string>;

  /**
   * Update host metadata
   */
  updateMetadata(metadata: string): Promise<string>;

  /**
   * Update host API URL
   */
  updateApiUrl(apiUrl: string): Promise<string>;

  /**
   * Add stake to host
   */
  addStake(amount: string): Promise<string>;

  /**
   * Remove stake from host
   */
  removeStake(amount: string): Promise<string>;

  /**
   * Withdraw stake (alias for removeStake)
   */
  withdrawStake(amount: string): Promise<string>;

  /**
   * Get host information
   */
  getHostInfo(address: string): Promise<HostInfo>;

  /**
   * Get host public key for encryption (with signature-based recovery fallback)
   *
   * This method:
   * 1. Checks the cache first for performance
   * 2. Tries to get public key from host metadata (preferred)
   * 3. Falls back to signature-based recovery if metadata missing
   * 4. Caches the recovered key for future use
   *
   * @param hostAddress - Host's EVM address
   * @param hostApiUrl - Optional host API URL (overrides contract's apiUrl)
   * @returns Compressed public key as hex string (66 chars)
   * @throws Error if public key cannot be obtained
   */
  getHostPublicKey(hostAddress: string, hostApiUrl?: string): Promise<string>;

  /**
   * Get web search capabilities for a host.
   *
   * @param hostAddress - Host's EVM address (used to lookup API URL from contract)
   * @param apiUrl - Optional API URL to use instead of looking up from contract
   * @returns WebSearchCapabilities object
   */
  getWebSearchCapabilities(hostAddress: string, apiUrl?: string): Promise<WebSearchCapabilities>;

  /**
   * Get host status (with dual pricing support)
   */
  getHostStatus(hostAddress: string): Promise<{
    isRegistered: boolean;
    isActive: boolean;
    supportedModels: string[];
    stake: bigint;
    metadata?: HostMetadata;
    apiUrl?: string;
    minPricePerTokenNative?: bigint;   // Native token pricing (ETH/BNB)
    minPricePerTokenStable?: bigint;   // Stablecoin pricing (USDC)
  }>;

  /**
   * Get active hosts
   */
  getActiveHosts(): Promise<HostInfo[]>;

  /**
   * Discover all active hosts from blockchain
   */
  discoverAllActiveHosts(): Promise<Array<{nodeAddress: string; apiUrl: string}>>;

  /**
   * Discover all active hosts with their models
   */
  discoverAllActiveHostsWithModels(): Promise<HostInfo[]>;

  /**
   * Query hosts by model
   */
  findHostsByModel(model: string): Promise<HostInfo[]>;

  /**
   * Find hosts that support a specific model
   */
  findHostsForModel(modelId: string): Promise<HostInfo[]>;

  /**
   * Check if host supports a specific model
   */
  hostSupportsModel(hostAddress: string, modelId: string): Promise<boolean>;

  /**
   * Get models supported by a host
   */
  getHostModels(hostAddress: string): Promise<string[]>;

  /**
   * Update host's supported models
   */
  updateHostModels(newModels: ModelSpec[]): Promise<string>;

  /**
   * Update supported model IDs
   */
  updateSupportedModels(modelIds: string[]): Promise<string>;

  /**
   * Set pricing for a specific model + token pair
   * Phase 18: Replaces updatePricingNative, updatePricingStable, setModelPricing
   * @param modelId - Model ID (bytes32 hash)
   * @param tokenAddress - Token address (ethers.ZeroAddress for native ETH/BNB)
   * @param price - Price as string (validated per token type)
   * @returns Transaction hash
   */
  setModelTokenPricing(modelId: string, tokenAddress: string, price: string): Promise<string>;

  /**
   * Clear pricing for a specific model + token pair
   * Phase 18: Replaces clearModelPricing (now per-token)
   * @param modelId - Model ID (bytes32 hash)
   * @param tokenAddress - Token address (ethers.ZeroAddress for native ETH/BNB)
   * @returns Transaction hash
   */
  clearModelTokenPricing(modelId: string, tokenAddress: string): Promise<string>;

  /**
   * Get host accumulated earnings for a specific token
   * @param hostAddress - Host address to check earnings for
   * @param tokenAddress - Token address (use ethers.ZeroAddress for native ETH/BNB)
   * @returns Accumulated earnings as bigint (in token's smallest unit)
   */
  getHostEarnings(hostAddress: string, tokenAddress: string): Promise<bigint>;

  /**
   * Withdraw earnings
   */
  withdrawEarnings(tokenAddress: string): Promise<string>;

  /**
   * Set host status (active/inactive)
   */
  setHostStatus(active: boolean): Promise<string>;

  /**
   * Get host reputation score
   */
  getReputation(address: string): Promise<number>;

  /**
   * Get all model prices for a host for a specific token
   * Phase 18: Now requires token parameter. Returns (modelId, price) pairs.
   * @param hostAddress - Host's EVM address
   * @param tokenAddress - Token address (ethers.ZeroAddress for native, USDC address for stable)
   * @returns Array of ModelPricing objects (price=0 entries filtered out)
   */
  getHostModelPrices(hostAddress: string, tokenAddress: string): Promise<ModelPricing[]>;

  /**
   * Get effective pricing for a specific model + token pair
   * @param hostAddress - Host's EVM address
   * @param modelId - Model ID (bytes32 hash)
   * @param tokenAddress - Token address
   * @returns Effective price as bigint
   */
  getModelPricing(hostAddress: string, modelId: string, tokenAddress: string): Promise<bigint>;
}