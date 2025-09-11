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