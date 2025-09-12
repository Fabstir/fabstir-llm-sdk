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
  apiUrl: string;
  region?: string;
  isActive: boolean;
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
      // Call contract to get node info
      const nodeInfo = await this.contract.getNode(nodeAddress);
      
      if (!nodeInfo.isActive) {
        throw new Error(`Node ${nodeAddress} is not active`);
      }

      if (!nodeInfo.apiUrl || nodeInfo.apiUrl === '') {
        throw new Error(`Node ${nodeAddress} has no API URL registered`);
      }

      // Cache the result
      const info: NodeInfo = {
        nodeAddress: nodeAddress.toLowerCase(),
        apiUrl: nodeInfo.apiUrl,
        region: nodeInfo.region,
        isActive: nodeInfo.isActive
      };
      
      this.nodeCache.set(nodeAddress.toLowerCase(), info);
      this.lastCacheTime = Date.now();
      
      return nodeInfo.apiUrl;
    } catch (error: any) {
      throw new Error(`Failed to discover node ${nodeAddress}: ${error.message}`);
    }
  }

  /**
   * Get all active nodes with their API URLs
   */
  async getAllActiveNodes(): Promise<NodeInfo[]> {
    try {
      // Get all registered nodes from contract
      const nodeAddresses = await this.contract.getAllNodes();
      const activeNodes: NodeInfo[] = [];

      for (const address of nodeAddresses) {
        try {
          const nodeInfo = await this.contract.getNode(address);
          if (nodeInfo.isActive && nodeInfo.apiUrl) {
            activeNodes.push({
              nodeAddress: address.toLowerCase(),
              apiUrl: nodeInfo.apiUrl,
              region: nodeInfo.region,
              isActive: true
            });
          }
        } catch (error) {
          console.warn(`Failed to get info for node ${address}:`, error);
        }
      }

      // Update cache
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