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
      // Call contract to get API URL directly
      const apiUrl = await this.contract.getNodeApiUrl(nodeAddress);
      
      if (!apiUrl || apiUrl === '') {
        throw new Error(`Node ${nodeAddress} has no API URL registered`);
      }

      // Check if node is active
      const isActive = await this.contract.isNodeActive(nodeAddress);
      if (!isActive) {
        throw new Error(`Node ${nodeAddress} is not active`);
      }

      // Cache the result
      const info: NodeInfo = {
        nodeAddress: nodeAddress.toLowerCase(),
        apiUrl: apiUrl,
        region: '',
        isActive: true
      };
      
      this.nodeCache.set(nodeAddress.toLowerCase(), info);
      this.lastCacheTime = Date.now();
      
      return apiUrl;
    } catch (error: any) {
      throw new Error(`Failed to discover node ${nodeAddress}: ${error.message}`);
    }
  }

  /**
   * Get all active nodes with their API URLs
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

      for (const address of nodeAddresses) {
        try {
          // Try to get metadata first - this might contain the API URL
          let apiUrl = '';
          let metadata = '';
          
          // Try the newer getNodeApiUrl function first
          try {
            apiUrl = await this.contract.getNodeApiUrl(address);
          } catch (e) {
            // If getNodeApiUrl fails, try getting metadata
            try {
              metadata = await this.contract.getNodeMetadata(address);
              // Parse metadata to extract API URL if it's JSON
              if (metadata && metadata.startsWith('{')) {
                const metaObj = JSON.parse(metadata);
                apiUrl = metaObj.apiUrl || metaObj.endpoint || '';
              }
            } catch (metaError) {
              console.warn(`No API URL or metadata for node ${address}`);
            }
          }
          
          // Even if no API URL, show the node as registered
          activeNodes.push({
            nodeAddress: address.toLowerCase(),
            apiUrl: apiUrl || 'No API URL registered',
            region: '',
            isActive: true
          });
          
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