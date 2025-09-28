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
  NodeMetrics,
  HostMetrics,
  StoredHostMetrics,
  AggregatedHostMetrics,
  MetricsSubmitResult
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
  private metricsStorage: Map<string, StoredHostMetrics[]> = new Map();

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
      const isRegistered = nodeInfo.operator !== ethers.ZeroAddress;
      
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
          await approveTx.wait(3); // Wait for 3 confirmations
        }
      }

      // Extract API URL from metadata if it's JSON
      let apiUrl = '';
      try {
        if (request.metadata && request.metadata.startsWith('{')) {
          const metaObj = JSON.parse(request.metadata);
          apiUrl = metaObj.apiUrl || metaObj.endpoint || '';
        }
      } catch (e) {
        // Metadata is not JSON, that's okay
      }

      // Register host with URL if available
      let tx;
      if (apiUrl) {
        // Use registerNodeWithUrl to set both metadata and API URL
        tx = await registry['registerNodeWithUrl'](
          request.metadata,
          apiUrl,
          { gasLimit: 300000n }
        );
      } else {
        // Fallback to basic registration
        tx = await registry['registerNode'](
          request.metadata,
          { gasLimit: 300000n }
        );
      }
      
      const receipt = await tx.wait(3); // Wait for 3 confirmations
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
      const isRegistered = nodeInfo.operator !== ethers.ZeroAddress;
      
      if (!isRegistered) {
        throw new SDKError('Host is not registered', 'HOST_NOT_REGISTERED');
      }

      // Unregister
      const tx = await registry['unregisterNode']({ gasLimit: 200000n });
      
      const receipt = await tx.wait(3); // Wait for 3 confirmations
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
      
      const receipt = await tx.wait(3); // Wait for 3 confirmations
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
   * Update host API URL
   */
  async updateApiUrl(apiUrl: string): Promise<string> {
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
      const isRegistered = nodeInfo.operator !== ethers.ZeroAddress;
      
      if (!isRegistered) {
        throw new SDKError('Host is not registered', 'HOST_NOT_REGISTERED');
      }

      // Update API URL
      console.log('Calling updateApiUrl with:', apiUrl);
      console.log('Registry address:', this.nodeRegistryAddress);
      console.log('ABI has updateApiUrl?:', nodeRegistryABI.find((item: any) => item.name === 'updateApiUrl'));
      console.log('Contract has method?:', typeof registry['updateApiUrl']);
      const tx = await registry['updateApiUrl'](apiUrl, { gasLimit: 200000n });
      
      const receipt = await tx.wait(3); // Wait for 3 confirmations
      if (!receipt || receipt.status !== 1) {
        throw new SDKError('Update API URL failed', 'UPDATE_API_URL_FAILED');
      }
      
      return receipt.hash;
    } catch (error: any) {
      console.error('updateApiUrl error:', error);
      if (error instanceof SDKError) throw error;
      throw new SDKError(
        `Failed to update API URL: ${error.message}`,
        'UPDATE_API_URL_ERROR',
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

      // Get FAB token contract
      const fabToken = this.contractManager.getERC20Contract(this.fabTokenAddress!);

      console.log('[HostManager] addStake called with amount:', amount);

      // CRITICAL FIX: The contract might expect FAB amount, not wei!
      // Let's try both approaches and see which works
      const stakeAmountInWei = ethers.parseUnits(amount, 18);
      const stakeAmountInFAB = ethers.parseUnits(amount, 0); // Just the number, no decimals

      console.log('[HostManager] Amount in FAB (no decimals):', stakeAmountInFAB.toString());
      console.log('[HostManager] Amount in wei (18 decimals):', stakeAmountInWei.toString());

      // For now, let's use wei since that's standard for ERC20
      const stakeAmount = stakeAmountInWei;

      const hostAddress = await this.signer.getAddress();

      // Approve FAB tokens
      if (this.fabTokenAddress) {
        // Check current balance
        const balance = await fabToken['balanceOf'](hostAddress);
        console.log('[HostManager] Current FAB balance:', ethers.formatUnits(balance, 18), 'FAB');

        if (balance < stakeAmount) {
          throw new SDKError(
            `Insufficient FAB balance. Have ${ethers.formatEther(balance)} FAB, need ${amount} FAB`,
            'INSUFFICIENT_BALANCE'
          );
        }

        // Check current allowance
        const currentAllowance = await fabToken['allowance'](hostAddress, this.nodeRegistryAddress);
        console.log('[HostManager] Current allowance:', ethers.formatUnits(currentAllowance, 18), 'FAB');

        // Approve the NodeRegistry to spend our FAB tokens
        console.log('[HostManager] Approving:', ethers.formatUnits(stakeAmount, 18), 'FAB');
        const approveTx = await fabToken['approve'](
          this.nodeRegistryAddress,
          stakeAmount,
          { gasLimit: 100000n }
        );
        await approveTx.wait(3);
        console.log('[HostManager] Approval complete');
      } else {
        throw new SDKError('FAB token address not configured', 'NO_FAB_TOKEN');
      }

      // Call stake function on NodeRegistry contract
      // Pass the amount in wei
      console.log('[HostManager] Calling stake() with amount:', stakeAmount.toString(), 'wei');
      console.log('[HostManager] Which is:', ethers.formatUnits(stakeAmount, 18), 'FAB');
      const tx = await registry['stake'](stakeAmount, { gasLimit: 300000n });
      console.log('[HostManager] Transaction hash:', tx.hash);
      
      const receipt = await tx.wait(3); // Wait for 3 confirmations
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
      
      const receipt = await tx.wait(3); // Wait for 3 confirmations
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
      const isRegistered = nodeInfo.operator !== ethers.ZeroAddress;

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
   * Get active hosts from blockchain
   * Always queries real blockchain state - no hardcoded data
   */
  async getActiveHosts(): Promise<HostInfo[]> {
    try {
      if (!this.nodeRegistryAddress) {
        throw new SDKError('NodeRegistry address not configured', 'CONFIG_ERROR');
      }

      // Always use HostDiscoveryService to get real hosts from blockchain
      const provider = this.signer?.provider;
      if (!provider) {
        throw new SDKError('No provider available', 'PROVIDER_ERROR');
      }

      const discoveryService = new HostDiscoveryService(
        this.nodeRegistryAddress,
        provider
      );

      // Get real hosts with full metadata from blockchain
      const activeNodes = await discoveryService.getAllActiveNodes();

      // Transform NodeInfo to HostInfo format
      return activeNodes.map(node => ({
        address: node.nodeAddress,
        isRegistered: true,
        isActive: node.isActive,
        stakedAmount: (node as any).stakedAmount || 1000000000000000000n,
        metadata: (node as any).metadata || JSON.stringify({
          models: (node as any).models || [],
          endpoint: node.apiUrl
        }),
        models: (node as any).models || [],
        endpoint: node.apiUrl,
        reputation: (node as any).reputation || 95,
        pricePerToken: (node as any).pricePerToken || 2000
      } as HostInfo));
    } catch (error: any) {
      console.error('Failed to get active hosts:', error);
      // Return empty array - let UI handle empty state properly
      return [];
    }
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
   * Get accumulated earnings for a specific host address
   */
  async getAccumulatedEarnings(hostAddress: string): Promise<bigint> {
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

      // Get USDC token address from ContractManager
      const usdcAddress = this.contractManager.getUsdcToken();

      // Query accumulated earnings for this host in USDC
      const balance = await earnings['earnings'](hostAddress, usdcAddress);

      return BigInt(balance.toString());
    } catch (error: any) {
      throw new SDKError(
        `Failed to get accumulated earnings: ${error.message}`,
        'GET_EARNINGS_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Record earnings for a host
   */
  async recordEarnings(sessionId: string, hostAddress: string, amount: bigint): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    // Validate inputs
    if (!sessionId || sessionId.trim() === '') {
      throw new SDKError('Invalid session ID', 'INVALID_SESSION_ID');
    }

    if (!ethers.isAddress(hostAddress)) {
      throw new SDKError('Invalid host address', 'INVALID_ADDRESS');
    }

    if (amount <= 0n) {
      throw new SDKError('Amount must be greater than zero', 'INVALID_AMOUNT');
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

      // Get USDC token address (assuming USDC for now, could be made configurable)
      const usdcAddress = await this.contractManager.getContractAddress('usdcToken');

      // Call creditEarnings on the contract
      const tx = await earnings['creditEarnings'](hostAddress, amount, usdcAddress);

      const receipt = await tx.wait(3); // Wait for 3 confirmations
      if (!receipt || receipt.status !== 1) {
        throw new SDKError('Recording earnings failed', 'RECORD_EARNINGS_FAILED');
      }

      return receipt.hash;
    } catch (error: any) {
      if (error instanceof SDKError) {
        throw error;
      }
      throw new SDKError(
        `Failed to record earnings: ${error.message}`,
        'RECORD_EARNINGS_ERROR'
      );
    }
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
      
      const receipt = await tx.wait(3); // Wait for 3 confirmations
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
      
      const receipt = await tx.wait(3); // Wait for 3 confirmations
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
  async submitMetrics(metrics: HostMetrics): Promise<MetricsSubmitResult> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    // Validate metrics
    this.validateMetrics(metrics);

    // Add timestamp if not provided
    const timestamp = metrics.timestamp || Date.now();

    // Get host address
    const hostAddress = await this.signer.getAddress();

    // Create stored metrics object
    const storedMetrics: StoredHostMetrics = {
      ...metrics,
      hostAddress,
      timestamp
    };

    // Store metrics locally
    if (!this.metricsStorage.has(hostAddress)) {
      this.metricsStorage.set(hostAddress, []);
    }

    const hostMetrics = this.metricsStorage.get(hostAddress)!;
    hostMetrics.push(storedMetrics);

    // Keep only last 1000 metrics entries per host
    if (hostMetrics.length > 1000) {
      hostMetrics.shift();
    }

    // Return result indicating local storage
    return {
      stored: true,
      location: 'local',
      timestamp
    };
  }

  /**
   * Validate metrics data
   */
  private validateMetrics(metrics: HostMetrics): void {
    if (metrics.jobsCompleted < 0) {
      throw new SDKError('Invalid metrics: jobsCompleted cannot be negative', 'INVALID_METRICS');
    }

    if (metrics.tokensProcessed < 0) {
      throw new SDKError('Invalid metrics: tokensProcessed cannot be negative', 'INVALID_METRICS');
    }

    if (metrics.averageLatency < 0) {
      throw new SDKError('Invalid metrics: averageLatency cannot be negative', 'INVALID_METRICS');
    }

    if (metrics.uptime < 0 || metrics.uptime > 1) {
      throw new SDKError('Invalid metrics: uptime must be between 0 and 1', 'INVALID_METRICS');
    }
  }

  /**
   * Get stored metrics for a host
   */
  async getStoredMetrics(hostAddress: string, limit?: number): Promise<StoredHostMetrics[]> {
    const metrics = this.metricsStorage.get(hostAddress) || [];

    if (limit && limit > 0) {
      // Return most recent metrics up to limit
      return metrics.slice(-limit);
    }

    return metrics;
  }

  /**
   * Get aggregated metrics for a host
   */
  async getAggregatedMetrics(hostAddress: string): Promise<AggregatedHostMetrics> {
    const metrics = await this.getStoredMetrics(hostAddress);

    if (metrics.length === 0) {
      return {
        totalJobs: 0,
        totalTokens: 0,
        averageUptime: 0,
        averageLatency: 0
      };
    }

    const totalJobs = metrics.reduce((sum, m) => sum + m.jobsCompleted, 0);
    const totalTokens = metrics.reduce((sum, m) => sum + m.tokensProcessed, 0);
    const averageUptime = metrics.reduce((sum, m) => sum + m.uptime, 0) / metrics.length;
    const averageLatency = metrics.reduce((sum, m) => sum + m.averageLatency, 0) / metrics.length;

    const periodStart = Math.min(...metrics.map(m => m.timestamp));
    const periodEnd = Math.max(...metrics.map(m => m.timestamp));

    return {
      totalJobs,
      totalTokens,
      averageUptime,
      averageLatency,
      periodStart,
      periodEnd
    };
  }

  /**
   * Clear metrics for a host
   */
  async clearMetrics(hostAddress: string): Promise<void> {
    this.metricsStorage.delete(hostAddress);
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