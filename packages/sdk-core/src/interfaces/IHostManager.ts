/**
 * Host Manager Interface
 * Browser-compatible host/node management
 */

import { HostInfo, HostMetadata, ModelSpec } from '../types/models';
import { HostRegistrationWithModels } from '../managers/HostManager';

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
   * Get host status
   */
  getHostStatus(hostAddress: string): Promise<{
    isRegistered: boolean;
    isActive: boolean;
    supportedModels: string[];
    stake: bigint;
    metadata?: HostMetadata;
    apiUrl?: string;
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
   * Update host minimum pricing
   * @param newMinPrice - New minimum price per token (100-100,000 range)
   * @returns Transaction hash
   */
  updatePricing(newMinPrice: string): Promise<string>;

  /**
   * Get host minimum pricing
   * @param hostAddress - Host address to query pricing for
   * @returns Minimum price per token as bigint (0 if host not registered)
   */
  getPricing(hostAddress: string): Promise<bigint>;

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
}