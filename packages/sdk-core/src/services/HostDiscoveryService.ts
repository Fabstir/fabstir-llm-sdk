// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Host Discovery Service
 * 
 * Retrieves LLM node API endpoints from the blockchain NodeRegistry contract.
 * This enables decentralized discovery of compute nodes without hardcoded URLs.
 */

import { ethers } from 'ethers';
import NodeRegistryABI from '../contracts/abis/NodeRegistryWithModels-CLIENT-ABI.json';

export interface NodeInfo {
  nodeAddress: string;
  address?: string; // Alias for nodeAddress
  apiUrl: string;
  endpoint?: string; // Alias for apiUrl
  region?: string;
  isActive: boolean;
  isRegistered?: boolean;
  operator?: string;
  stakedAmount?: bigint;
  metadata?: string;
  supportedModels?: string[];
  models?: string[];
  reputation?: number;
  pricePerToken?: number;
  minPricePerToken?: bigint; // Legacy - use minPricePerTokenNative
  minPricePerTokenNative?: bigint; // Native token pricing (ETH/BNB)
  minPricePerTokenStable?: bigint; // Stablecoin pricing (USDC)
}

export interface HostDiscoveryOptions {
  modelId?: string;
  region?: string;
  maxPricePerToken?: bigint; // NEW: Filter by maximum price
  sortBy?: 'price' | 'reputation' | 'random'; // NEW: Sort order
}

export class HostDiscoveryService {
  private contract: ethers.Contract;
  private nodeCache: Map<string, NodeInfo> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private lastCacheTime = 0;

  constructor(
    contractAddress: string,
    provider: ethers.Provider
  ) {
    this.contract = new ethers.Contract(
      contractAddress,
      NodeRegistryABI,
      provider
    );
  }

  /**
   * Get API URL for a specific node address
   */
  async getNodeApiUrl(nodeAddress: string): Promise<string> {
    // Check cache first
    const cached = this.nodeCache.get(nodeAddress.toLowerCase());
    if (cached && Date.now() - this.lastCacheTime < this.cacheTimeout) {
      return cached.apiUrl;
    }

    try {
      const nodeFullInfo = await this.contract.getNodeFullInfo(nodeAddress);
      // Contract returns: [operator, stake, active, metadata, apiUrl, models, nativePrice, stablePrice]

      // Check if node is active (index 2)
      if (!nodeFullInfo[2]) {
        throw new Error(`Node ${nodeAddress} is not active`);
      }

      const apiUrl = nodeFullInfo[4]; // apiUrl is at index 4
      if (!apiUrl || apiUrl === '') {
        throw new Error(`Node ${nodeAddress} has no API URL registered`);
      }

      // Parse metadata for additional info (index 3)
      let parsedMetadata: any = {};
      try {
        if (nodeFullInfo[3] && nodeFullInfo[3].startsWith('{')) {
          parsedMetadata = JSON.parse(nodeFullInfo[3]);
        }
      } catch (e) {
        // Ignore parse errors
      }

      // Read pricing from contract
      const minPriceNative = nodeFullInfo[6] || 0n;
      const minPriceStable = nodeFullInfo[7] || 0n;

      // Cache the complete result
      const info: NodeInfo = {
        nodeAddress: nodeAddress.toLowerCase(),
        address: nodeAddress.toLowerCase(),
        operator: nodeFullInfo[0], // nodeOperator
        isActive: nodeFullInfo[2], // active bool
        isRegistered: true,
        stakedAmount: nodeFullInfo[1], // stakedAmount
        metadata: nodeFullInfo[3], // metadata string
        apiUrl: apiUrl,
        endpoint: apiUrl,
        supportedModels: nodeFullInfo[5] || [], // From contract (index 5)
        models: nodeFullInfo[5] || [], // From contract (index 5) - alias
        region: parsedMetadata.region || '',
        reputation: parsedMetadata.reputation || 95,
        pricePerToken: Number(minPriceStable), // Use actual stable price from contract
        minPricePerToken: minPriceNative, // Legacy alias
        minPricePerTokenNative: minPriceNative, // Native pricing (index 6)
        minPricePerTokenStable: minPriceStable // Stable pricing (index 7)
      };

      this.nodeCache.set(nodeAddress.toLowerCase(), info);
      this.lastCacheTime = Date.now();

      return apiUrl;
    } catch (error: any) {
      throw new Error(`Failed to discover node ${nodeAddress}: ${error.message}`);
    }
  }

  /**
   * Get all active nodes with complete metadata from blockchain
   */
  async getAllActiveNodes(): Promise<NodeInfo[]> {
    try {
      // Get all active nodes from contract - returns array of addresses
      const nodeAddresses = await this.contract.getAllActiveNodes();
      const activeNodes: NodeInfo[] = [];

      // If no active nodes, return empty array
      if (!nodeAddresses || nodeAddresses.length === 0) {
        return activeNodes;
      }

      // Fetch complete node info for each address
      for (const address of nodeAddresses) {
        try {
          // Get FULL node info from contract using getNodeFullInfo
          // Returns: [nodeOperator, stakedAmount, active, metadata, apiUrl, supportedModels, minPricePerToken]
          let nodeFullInfo;
          try {
            nodeFullInfo = await this.contract.getNodeFullInfo(address);
          } catch (e) {
            console.warn(`Failed to get node info for ${address}:`, e);
            continue;
          }

          // Skip if node is not active (index 2 is the active bool)
          if (!nodeFullInfo[2]) {
            continue;
          }

          // Parse metadata JSON if available (index 3 is metadata)
          let parsedMetadata: any = {};
          try {
            if (nodeFullInfo[3] && nodeFullInfo[3].startsWith('{')) {
              parsedMetadata = JSON.parse(nodeFullInfo[3]);
            }
          } catch (e) {
            console.warn(`Failed to parse metadata for ${address}:`, e);
          }

          // Debug log to see what we're getting from contract
          console.log(`[HostDiscovery] Contract supportedModels for ${address}:`, nodeFullInfo[5]);
          console.log(`[HostDiscovery] Full nodeFullInfo type:`, Array.isArray(nodeFullInfo) ? 'array' : 'object');
          console.log(`[HostDiscovery] nodeFullInfo length:`, nodeFullInfo.length);

          // Build complete node info with all metadata
          // Contract returns: [operator, stake, active, metadata, apiUrl, models, nativePrice, stablePrice]
          const minPriceNative = nodeFullInfo[6] || 0n;
          const minPriceStable = nodeFullInfo[7] || 0n;

          const nodeInfo: NodeInfo = {
            nodeAddress: address.toLowerCase(),
            address: address.toLowerCase(), // Alias for compatibility
            operator: nodeFullInfo[0], // nodeOperator
            isActive: nodeFullInfo[2], // active bool
            isRegistered: true,
            stakedAmount: nodeFullInfo[1], // stakedAmount
            metadata: nodeFullInfo[3], // Raw metadata string
            apiUrl: nodeFullInfo[4] || parsedMetadata.apiUrl || parsedMetadata.endpoint || '',
            endpoint: nodeFullInfo[4] || parsedMetadata.apiUrl || parsedMetadata.endpoint || '', // Alias
            supportedModels: nodeFullInfo[5] || [], // From contract (index 5)
            models: nodeFullInfo[5] || [], // From contract (index 5) - alias
            region: parsedMetadata.region || '',
            reputation: parsedMetadata.reputation || 95,
            pricePerToken: Number(minPriceStable), // Use actual stable price from contract
            minPricePerToken: minPriceNative, // Legacy alias
            minPricePerTokenNative: minPriceNative, // Native pricing (index 6)
            minPricePerTokenStable: minPriceStable // Stable pricing (index 7)
          };

          activeNodes.push(nodeInfo);

        } catch (error) {
          console.warn(`Failed to get full info for node ${address}:`, error);
        }
      }

      // Update cache with complete node info
      this.lastCacheTime = Date.now();
      activeNodes.forEach(node => {
        this.nodeCache.set(node.nodeAddress, node);
      });

      return activeNodes;
    } catch (error: any) {
      throw new Error(`Failed to discover active nodes: ${error.message}`);
    }
  }

  /**
   * Find hosts with filtering and sorting options
   * @param options - Filtering and sorting options
   * @returns Filtered and sorted list of hosts
   */
  async findHosts(options: HostDiscoveryOptions = {}): Promise<NodeInfo[]> {
    // Get all active hosts
    let hosts = await this.getAllActiveNodes();

    // Filter by model ID (existing functionality)
    if (options.modelId) {
      hosts = hosts.filter(h =>
        h.supportedModels?.includes(options.modelId!) ||
        h.models?.includes(options.modelId!)
      );
    }

    // Filter by region (existing functionality)
    if (options.region) {
      hosts = hosts.filter(h => h.region === options.region);
    }

    // NEW: Filter by maximum price
    if (options.maxPricePerToken !== undefined) {
      hosts = hosts.filter(h => {
        // Exclude hosts with no pricing information (0n, undefined, or null)
        if (!h.minPricePerToken || h.minPricePerToken === 0n) {
          return false;
        }
        return h.minPricePerToken <= options.maxPricePerToken!;
      });
    }

    // NEW: Sort hosts
    if (options.sortBy === 'price') {
      // Sort by price ascending (lowest first), hosts with 0n price go last
      hosts.sort((a, b) => {
        const priceA = a.minPricePerToken || 0n;
        const priceB = b.minPricePerToken || 0n;

        // Put hosts with no pricing (0n) at the end
        if (priceA === 0n && priceB !== 0n) return 1;
        if (priceA !== 0n && priceB === 0n) return -1;
        if (priceA === 0n && priceB === 0n) return 0;

        return Number(priceA - priceB);
      });
    } else if (options.sortBy === 'reputation') {
      // Sort by reputation descending (highest first)
      hosts.sort((a, b) => (b.reputation || 0) - (a.reputation || 0));
    } else if (options.sortBy === 'random') {
      // Random shuffle
      hosts = this.shuffleArray(hosts);
    }

    return hosts;
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   * @param array - Array to shuffle
   * @returns Shuffled copy of array
   */
  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Clear the node cache
   */
  clearCache(): void {
    this.nodeCache.clear();
    this.lastCacheTime = 0;
  }
}