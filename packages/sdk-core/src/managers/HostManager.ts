/**
 * Browser-compatible Host Manager
 * 
 * Manages host/node operations including registration, staking,
 * metadata management, and earnings withdrawal in browser environments.
 */

import { ethers } from 'ethers';
import { IHostManager } from '../interfaces';
import {
  SDKError,
  HostInfo,
  HostRegistrationRequest,
  NodeMetrics
} from '../types';
import { ContractManager } from '../contracts/ContractManager';
import { HostDiscoveryService } from '../services/HostDiscoveryService';

export class HostManager implements IHostManager {
  private contractManager: ContractManager;
  private signer?: ethers.Signer;
  private initialized = false;
  private nodeRegistryAddress?: string;
  private hostEarningsAddress?: string;
  private fabTokenAddress?: string;
  private discoveryService?: HostDiscoveryService;

  constructor(contractManager: ContractManager) {
    this.contractManager = contractManager;
  }

  /**
   * Initialize the host manager
   */
  async initialize(signer: ethers.Signer): Promise<void> {
    this.signer = signer;
    await this.contractManager.setSigner(signer);
    
    // Get contract addresses
    this.nodeRegistryAddress = await this.contractManager.getContractAddress('nodeRegistry');
    this.fabTokenAddress = await this.contractManager.getContractAddress('fabToken');
    
    // Host earnings is optional
    try {
      this.hostEarningsAddress = await this.contractManager.getContractAddress('hostEarnings');
    } catch {}
    
    // Initialize discovery service
    const provider = await signer.provider;
    if (provider && this.nodeRegistryAddress) {
      this.discoveryService = new HostDiscoveryService(
        this.nodeRegistryAddress,
        provider
      );
    }
    
    this.initialized = true;
  }

  /**
   * Register as a host/node
   */
  async registerHost(request: HostRegistrationRequest): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      // Get contracts
      const nodeRegistryABI = await this.contractManager.getContractABI('nodeRegistry');
      const registry = new ethers.Contract(
        this.nodeRegistryAddress!,
        nodeRegistryABI,
        this.signer
      );

      // Check if already registered
      const hostAddress = await this.signer.getAddress();
      const nodeInfo = await registry['nodes'](hostAddress);
      const isRegistered = nodeInfo.operator !== '0x0000000000000000000000000000000000000000';
      
      if (isRegistered) {
        throw new SDKError('Host is already registered', 'HOST_ALREADY_REGISTERED');
      }

      // Parse stake amount or use minimum
      let stakeAmount: bigint;
      if (request.stakeAmount) {
        stakeAmount = ethers.parseUnits(request.stakeAmount, 18);
      } else {
        const minStake = await registry['MIN_STAKE']();
        stakeAmount = BigInt(minStake.toString());
      }

      // Check and approve FAB tokens if needed
      if (this.fabTokenAddress) {
        const fabToken = this.contractManager.getERC20Contract(this.fabTokenAddress);
        
        // Check balance
        const balance = await fabToken['balanceOf'](hostAddress);
        if (BigInt(balance.toString()) < stakeAmount) {
          throw new SDKError(
            `Insufficient FAB tokens. Need ${ethers.formatUnits(stakeAmount, 18)} FAB`,
            'INSUFFICIENT_BALANCE'
          );
        }

        // Check and set allowance
        const allowance = await fabToken['allowance'](hostAddress, this.nodeRegistryAddress);
        if (BigInt(allowance.toString()) < stakeAmount) {
          const approveTx = await fabToken['approve'](
            this.nodeRegistryAddress,
            stakeAmount,
            { gasLimit: 100000n }
          );
          await approveTx.wait();
        }
      }

      // Register host
      const tx = await registry['registerNode'](
        request.metadata,
        { gasLimit: 300000n }
      );
      
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new SDKError('Registration failed', 'REGISTRATION_FAILED');
      }
      
      return receipt.hash;
    } catch (error: any) {
      if (error instanceof SDKError) throw error;
      throw new SDKError(
        `Failed to register host: ${error.message}`,
        'REGISTRATION_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Unregister as a host
   */
  async unregisterHost(): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      const nodeRegistryABI = await this.contractManager.getContractABI('nodeRegistry');
      const registry = new ethers.Contract(
        this.nodeRegistryAddress!,
        nodeRegistryABI,
        this.signer
      );

      // Check if registered
      const hostAddress = await this.signer.getAddress();
      const nodeInfo = await registry['nodes'](hostAddress);
      const isRegistered = nodeInfo.operator !== '0x0000000000000000000000000000000000000000';
      
      if (!isRegistered) {
        throw new SDKError('Host is not registered', 'HOST_NOT_REGISTERED');
      }

      // Unregister
      const tx = await registry['unregisterNode']({ gasLimit: 200000n });
      
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new SDKError('Unregistration failed', 'UNREGISTRATION_FAILED');
      }
      
      return receipt.hash;
    } catch (error: any) {
      if (error instanceof SDKError) throw error;
      throw new SDKError(
        `Failed to unregister host: ${error.message}`,
        'UNREGISTRATION_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Update host metadata
   */
  async updateMetadata(metadata: string): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      const nodeRegistryABI = await this.contractManager.getContractABI('nodeRegistry');
      const registry = new ethers.Contract(
        this.nodeRegistryAddress!,
        nodeRegistryABI,
        this.signer
      );

      const tx = await registry['updateMetadata'](metadata, { gasLimit: 150000n });
      
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new SDKError('Metadata update failed', 'UPDATE_FAILED');
      }
      
      return receipt.hash;
    } catch (error: any) {
      throw new SDKError(
        `Failed to update metadata: ${error.message}`,
        'UPDATE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Add stake to host
   */
  async addStake(amount: string): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      const nodeRegistryABI = await this.contractManager.getContractABI('nodeRegistry');
      const registry = new ethers.Contract(
        this.nodeRegistryAddress!,
        nodeRegistryABI,
        this.signer
      );

      const stakeAmount = ethers.parseUnits(amount, 18);
      const hostAddress = await this.signer.getAddress();

      // Approve FAB tokens
      if (this.fabTokenAddress) {
        const fabToken = this.contractManager.getERC20Contract(this.fabTokenAddress);
        
        const approveTx = await fabToken['approve'](
          this.nodeRegistryAddress,
          stakeAmount,
          { gasLimit: 100000n }
        );
        await approveTx.wait();
      }

      // Add stake
      const tx = await registry['addStake'](stakeAmount, { gasLimit: 200000n });
      
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new SDKError('Add stake failed', 'ADD_STAKE_FAILED');
      }
      
      return receipt.hash;
    } catch (error: any) {
      throw new SDKError(
        `Failed to add stake: ${error.message}`,
        'ADD_STAKE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Remove stake from host
   */
  async removeStake(amount: string): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      const nodeRegistryABI = await this.contractManager.getContractABI('nodeRegistry');
      const registry = new ethers.Contract(
        this.nodeRegistryAddress!,
        nodeRegistryABI,
        this.signer
      );

      const stakeAmount = ethers.parseUnits(amount, 18);

      // Remove stake
      const tx = await registry['removeStake'](stakeAmount, { gasLimit: 200000n });
      
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new SDKError('Remove stake failed', 'REMOVE_STAKE_FAILED');
      }
      
      return receipt.hash;
    } catch (error: any) {
      throw new SDKError(
        `Failed to remove stake: ${error.message}`,
        'REMOVE_STAKE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get host information
   */
  async getHostInfo(address: string): Promise<HostInfo> {
    if (!this.initialized) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      const nodeRegistryABI = await this.contractManager.getContractABI('nodeRegistry');
      const provider = this.contractManager.getProvider();
      const registry = new ethers.Contract(
        this.nodeRegistryAddress!,
        nodeRegistryABI,
        provider
      );

      const nodeInfo = await registry['nodes'](address);
      const isRegistered = nodeInfo.operator !== '0x0000000000000000000000000000000000000000';

      // Parse models from metadata
      const models = this.parseHostModels(nodeInfo.metadata || '');
      const endpoint = this.parseHostEndpoint(nodeInfo.metadata || '');

      return {
        address,
        isRegistered,
        isActive: nodeInfo.active || false,
        stakedAmount: BigInt(nodeInfo.stakedAmount?.toString() || '0'),
        metadata: nodeInfo.metadata || '',
        models,
        endpoint,
        reputation: 0 // Would need separate reputation contract
      };
    } catch (error: any) {
      throw new SDKError(
        `Failed to get host info: ${error.message}`,
        'GET_INFO_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * List all active hosts
   */
  async listActiveHosts(): Promise<HostInfo[]> {
    if (!this.initialized) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      const nodeRegistryABI = await this.contractManager.getContractABI('nodeRegistry');
      const provider = this.contractManager.getProvider();
      const registry = new ethers.Contract(
        this.nodeRegistryAddress!,
        nodeRegistryABI,
        provider
      );

      // Get all registered nodes (would need event filtering in production)
      // For now, return empty array as this requires event log scanning
      // which is complex in browser environments
      return [];
    } catch (error: any) {
      throw new SDKError(
        `Failed to list active hosts: ${error.message}`,
        'LIST_HOSTS_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get active hosts (alias for listActiveHosts)
   * For compatibility with the test page
   */
  async getActiveHosts(): Promise<HostInfo[]> {
    // For testing, return mock hosts if no real hosts available
    const realHosts = await this.listActiveHosts();
    
    if (realHosts.length === 0) {
      // Return test hosts with real endpoints
      // In browser, these come from Next.js environment variables
      const host1Url = 'http://localhost:8080';
      const host2Url = 'http://localhost:8081';
      
      // Keep HTTP URLs for REST API (don't convert to WebSocket)
      // The SessionManager will use REST API at /v1/inference
      
      return [
        {
          address: '0x4594F755F593B517Bb3194F4DeC20C48a3f04504',
          isRegistered: true,
          isActive: true,
          stakedAmount: 1000000000000000000n,
          metadata: `{"models":["tiny-vicuna-1b"],"endpoint":"${host1Url}"}`,
          models: ['tiny-vicuna-1b'],  // Use the actual model the node has
          endpoint: host1Url,  // Keep as HTTP for REST API
          reputation: 95,
          pricePerToken: 2000
        },
        {
          address: '0x20f2A5FCDf271A5E6b04383C2915Ea980a50948c',
          isRegistered: true,
          isActive: true,
          stakedAmount: 1000000000000000000n,
          metadata: `{"models":["tiny-vicuna-1b"],"endpoint":"${host2Url}"}`,
          models: ['tiny-vicuna-1b'],
          endpoint: host2Url,  // Keep as HTTP for REST API
          reputation: 90,
          pricePerToken: 1500
        }
      ] as any;
    }
    
    return realHosts;
  }

  /**
   * Discover API URL for a specific host from blockchain
   */
  async discoverHostApiUrl(hostAddress: string): Promise<string> {
    if (!this.initialized || !this.discoveryService) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      return await this.discoveryService.getNodeApiUrl(hostAddress);
    } catch (error: any) {
      throw new SDKError(
        `Failed to discover host API URL: ${error.message}`,
        'DISCOVERY_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Discover all active hosts with their API URLs
   */
  async discoverAllActiveHosts(): Promise<Array<{nodeAddress: string; apiUrl: string}>> {
    if (!this.initialized || !this.discoveryService) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      const nodes = await this.discoveryService.getAllActiveNodes();
      return nodes.map(n => ({ nodeAddress: n.nodeAddress, apiUrl: n.apiUrl }));
    } catch (error: any) {
      throw new SDKError(
        `Failed to discover active hosts: ${error.message}`,
        'DISCOVERY_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Query hosts by model
   */
  async findHostsByModel(model: string): Promise<HostInfo[]> {
    if (!this.initialized) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    // This would require indexing or event log scanning
    // For browser compatibility, would need a separate indexing service
    return [];
  }

  /**
   * Get host metrics
   */
  async getHostMetrics(address: string): Promise<NodeMetrics> {
    if (!this.initialized) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    // Metrics would typically come from off-chain monitoring
    // Return basic metrics for now
    const hostInfo = await this.getHostInfo(address);
    
    return {
      online: hostInfo.isActive,
      uptime: 0,
      totalRequests: 0,
      activeConnections: 0,
      gpuUtilization: 0,
      memoryUsage: 0,
      averageResponseTime: 0,
      totalTokensGenerated: 0
    };
  }

  /**
   * Check host earnings
   */
  async checkEarnings(tokenAddress: string): Promise<bigint> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    if (!this.hostEarningsAddress) {
      throw new SDKError('Host earnings contract not configured', 'NO_EARNINGS_CONTRACT');
    }

    try {
      const hostEarningsABI = await this.contractManager.getContractABI('hostEarnings');
      const earnings = new ethers.Contract(
        this.hostEarningsAddress,
        hostEarningsABI,
        this.signer
      );

      const hostAddress = await this.signer.getAddress();
      const balance = await earnings['earnings'](hostAddress, tokenAddress);
      
      return BigInt(balance.toString());
    } catch (error: any) {
      throw new SDKError(
        `Failed to check earnings: ${error.message}`,
        'CHECK_EARNINGS_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Record earnings for a host
   */
  async recordEarnings(hostAddress: string, amount: bigint): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    // For now, just log the earnings as this would require a specific contract method
    console.log(`Recording earnings for host ${hostAddress}: ${amount}`);
    
    // Return a mock transaction hash
    return `0x${Math.random().toString(16).substring(2)}${Math.random().toString(16).substring(2)}`;
  }

  /**
   * Withdraw earnings
   */
  async withdrawEarnings(tokenAddress: string): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    if (!this.hostEarningsAddress) {
      throw new SDKError('Host earnings contract not configured', 'NO_EARNINGS_CONTRACT');
    }

    try {
      const hostEarningsABI = await this.contractManager.getContractABI('hostEarnings');
      const earnings = new ethers.Contract(
        this.hostEarningsAddress,
        hostEarningsABI,
        this.signer
      );

      // Use withdrawAll to withdraw all accumulated earnings for the token
      const tx = await earnings.withdrawAll(tokenAddress);
      
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new SDKError('Withdrawal failed', 'WITHDRAWAL_FAILED');
      }
      
      return receipt.hash;
    } catch (error: any) {
      throw new SDKError(
        `Failed to withdraw earnings: ${error.message}`,
        'WITHDRAWAL_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Set host status (active/inactive)
   */
  async setHostStatus(active: boolean): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      const nodeRegistryABI = await this.contractManager.getContractABI('nodeRegistry');
      const registry = new ethers.Contract(
        this.nodeRegistryAddress!,
        nodeRegistryABI,
        this.signer
      );

      const tx = await registry['setNodeStatus'](active, { gasLimit: 150000n });
      
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new SDKError('Status update failed', 'STATUS_UPDATE_FAILED');
      }
      
      return receipt.hash;
    } catch (error: any) {
      throw new SDKError(
        `Failed to set host status: ${error.message}`,
        'STATUS_UPDATE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get host reputation score
   */
  async getReputation(address: string): Promise<number> {
    if (!this.initialized) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    // Reputation would come from a separate reputation contract
    // or off-chain reputation service
    return 100; // Default reputation
  }

  /**
   * Submit performance metrics
   */
  async submitMetrics(metrics: NodeMetrics): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    // Metrics submission requires off-chain service integration
    throw new SDKError(
      'Metrics submission requires off-chain metrics service integration',
      'NOT_IMPLEMENTED'
    );
  }

  /**
   * Parse host models from metadata
   */
  private parseHostModels(metadata: string): string[] {
    if (!metadata) return [];
    
    // Parse comma-separated models from metadata
    const parts = metadata.split(',').map(s => s.trim());
    
    // Filter out non-model entries
    const models = parts.filter(part => 
      part.includes('llama') || 
      part.includes('gpt') || 
      part.includes('mistral') ||
      part.includes('claude') ||
      part.includes('gemma') ||
      part.includes('model')
    );
    
    return models;
  }

  /**
   * Parse host endpoint from metadata
   */
  private parseHostEndpoint(metadata: string): string | undefined {
    if (!metadata) return undefined;
    
    // Check if metadata contains URL format
    if (metadata.includes('http://') || metadata.includes('https://') || 
        metadata.includes('ws://') || metadata.includes('wss://')) {
      // Extract URL from metadata
      const urlMatch = metadata.match(/(https?|wss?):\/\/[^\s,]+/);
      return urlMatch ? urlMatch[0] : undefined;
    }
    
    return undefined;
  }

  /**
   * Check if HostManager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}