/**
 * Host Discovery Service
 * 
 * Retrieves LLM node API endpoints from the blockchain NodeRegistry contract.
 * This enables decentralized discovery of compute nodes without hardcoded URLs.
 */

import { ethers } from 'ethers';
import NodeRegistryABI from '../contracts/abis/NodeRegistryFAB-CLIENT-ABI.json';

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
      // Try to get full node info first for complete metadata
      try {
        const nodeFullInfo = await this.contract.getNodeFullInfo(nodeAddress);
        // Returns: [nodeOperator, stakedAmount, active, metadata, apiUrl]

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
          supportedModels: parsedMetadata.supportedModels || [],
          models: parsedMetadata.models || [],
          region: parsedMetadata.region || '',
          reputation: parsedMetadata.reputation || 95,
          pricePerToken: parsedMetadata.pricePerToken || 2000
        };

        this.nodeCache.set(nodeAddress.toLowerCase(), info);
        this.lastCacheTime = Date.now();

        return apiUrl;
      } catch (e) {
        // Fallback to direct getNodeApiUrl if getNodeFullInfo not available
        const apiUrl = await this.contract.getNodeApiUrl(nodeAddress);

        if (!apiUrl || apiUrl === '') {
          throw new Error(`Node ${nodeAddress} has no API URL registered`);
        }

        // Check if node is active
        const isActive = await this.contract.isNodeActive(nodeAddress);
        if (!isActive) {
          throw new Error(`Node ${nodeAddress} is not active`);
        }

        // Cache minimal result
        const info: NodeInfo = {
          nodeAddress: nodeAddress.toLowerCase(),
          address: nodeAddress.toLowerCase(),
          apiUrl: apiUrl,
          endpoint: apiUrl,
          region: '',
          isActive: true,
          isRegistered: true
        };

        this.nodeCache.set(nodeAddress.toLowerCase(), info);
        this.lastCacheTime = Date.now();

        return apiUrl;
      }
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
          // Returns: [nodeOperator, stakedAmount, active, metadata, apiUrl]
          let nodeFullInfo;
          try {
            nodeFullInfo = await this.contract.getNodeFullInfo(address);
          } catch (e) {
            console.warn(`getNodeFullInfo not available, falling back to individual calls for ${address}`);
            // Fallback to individual calls if getNodeFullInfo is not available
            const apiUrl = await this.contract.getNodeApiUrl(address);
            const isActive = await this.contract.isNodeActive(address);

            if (!isActive) continue;

            activeNodes.push({
              nodeAddress: address.toLowerCase(),
              address: address.toLowerCase(),
              apiUrl: apiUrl || '',
              endpoint: apiUrl || '',
              region: '',
              isActive: true,
              isRegistered: true
            });
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

          // Build complete node info with all metadata
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
            supportedModels: parsedMetadata.supportedModels || [], // From metadata
            models: parsedMetadata.models || [], // From parsed metadata
            region: parsedMetadata.region || '',
            reputation: parsedMetadata.reputation || 95,
            pricePerToken: parsedMetadata.pricePerToken || 2000
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
   * Clear the node cache
   */
  clearCache(): void {
    this.nodeCache.clear();
    this.lastCacheTime = 0;
  }
}