/**
 * Host Manager Interface
 * Browser-compatible host/node management
 */

import { HostInfo, HostRegistrationRequest, NodeMetrics } from '../types';

export interface IHostManager {
  /**
   * Register as a host/node
   */
  registerHost(request: HostRegistrationRequest): Promise<string>;
  
  /**
   * Unregister as a host
   */
  unregisterHost(): Promise<string>;
  
  /**
   * Update host metadata
   */
  updateMetadata(metadata: string): Promise<string>;
  
  /**
   * Add stake to host
   */
  addStake(amount: string): Promise<string>;
  
  /**
   * Remove stake from host
   */
  removeStake(amount: string): Promise<string>;
  
  /**
   * Get host information
   */
  getHostInfo(address: string): Promise<HostInfo>;
  
  /**
   * List all active hosts
   */
  listActiveHosts(): Promise<HostInfo[]>;

  /**
   * Get active hosts (alias for listActiveHosts)
   */
  getActiveHosts(): Promise<HostInfo[]>;

  /**
   * Discover all active hosts from blockchain
   */
  discoverAllActiveHosts(): Promise<Array<{nodeAddress: string; apiUrl: string}>>;

  /**
   * Query hosts by model
   */
  findHostsByModel(model: string): Promise<HostInfo[]>;
  
  /**
   * Get host metrics
   */
  getHostMetrics(address: string): Promise<NodeMetrics>;
  
  /**
   * Check host earnings
   */
  checkEarnings(tokenAddress: string): Promise<bigint>;

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
   * Submit performance metrics
   */
  submitMetrics(metrics: NodeMetrics): Promise<string>;
}