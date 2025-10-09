/**
 * Host Manager with Model Governance Support
 *
 * Manages host/node operations with model validation and registration
 */

import { ethers, Contract, Provider, Signer, isAddress } from 'ethers';
import {
  HostInfo,
  HostMetadata,
  ModelSpec
} from '../types/models';
import {
  ModelNotApprovedError,
  InvalidModelIdError,
  ModelRegistryError,
  ModelValidationError
} from '../errors/model-errors';
import { PricingValidationError } from '../errors/pricing-errors';
import { SDKError } from '../errors';
import { ContractManager } from '../contracts/ContractManager';
import { ModelManager } from './ModelManager';
import { HostDiscoveryService } from '../services/HostDiscoveryService';
// Import the correct NodeRegistry ABI directly
import NodeRegistryABI from '../contracts/abis/NodeRegistryWithModels-CLIENT-ABI.json';

/**
 * Pricing constants for host registration
 * Exported for use in host-cli and other consumers
 */
export const MIN_PRICE_PER_TOKEN = 100n;
export const MAX_PRICE_PER_TOKEN = 100000n;
export const DEFAULT_PRICE_PER_TOKEN = '100'; // String for BigInt conversion
export const DEFAULT_PRICE_PER_TOKEN_NUMBER = 100; // Numeric form for parseInt()

/**
 * Host registration parameters with model validation and pricing
 */
export interface HostRegistrationWithModels {
  metadata: HostMetadata;
  apiUrl: string;
  supportedModels: ModelSpec[];
  minPricePerToken: string;    // Minimum price per token (100-100,000 range, will be parsed to bigint)
}

export class HostManager {
  private contractManager: ContractManager;
  private modelManager: ModelManager;
  private nodeRegistry?: Contract;
  private signer?: Signer;
  private initialized = false;
  private nodeRegistryAddress?: string;
  private discoveryService?: HostDiscoveryService;
  private fabTokenAddress?: string;
  private hostEarningsAddress?: string;

  constructor(
    signer: Signer,
    nodeRegistryAddress: string,
    modelManager: ModelManager,
    fabTokenAddress?: string,
    hostEarningsAddress?: string,
    contractManager?: any
  ) {
    if (!isAddress(nodeRegistryAddress)) {
      throw new ModelRegistryError(
        'Invalid node registry address',
        nodeRegistryAddress
      );
    }

    this.signer = signer;
    this.nodeRegistryAddress = nodeRegistryAddress;
    this.modelManager = modelManager;
    this.fabTokenAddress = fabTokenAddress;
    this.hostEarningsAddress = hostEarningsAddress;
    this.contractManager = contractManager;

    // Initialize contract with full NodeRegistryWithModels ABI
    console.log('Initializing NodeRegistry contract with full ABI');
    console.log('Contract address:', nodeRegistryAddress);
    console.log('NodeRegistryABI type:', typeof NodeRegistryABI);
    console.log('NodeRegistryABI is array?', Array.isArray(NodeRegistryABI));
    console.log('NodeRegistryABI length:', NodeRegistryABI?.length || 0);
    if (Array.isArray(NodeRegistryABI) && NodeRegistryABI.length > 0) {
      console.log('First ABI entry:', JSON.stringify(NodeRegistryABI[0]).substring(0, 200));
      console.log('Second ABI entry:', JSON.stringify(NodeRegistryABI[1]).substring(0, 200));
      // Count function entries
      const funcs = NodeRegistryABI.filter((item: any) => item.type === 'function');
      console.log('Number of function entries in ABI:', funcs.length);
    } else {
      console.error('NodeRegistryABI is NOT a valid array:', NodeRegistryABI);
    }

    this.nodeRegistry = new Contract(
      nodeRegistryAddress,
      NodeRegistryABI,
      signer
    );

    // Verify the contract interface is loaded
    if (this.nodeRegistry.interface) {
      console.log('Contract interface initialized successfully');
      console.log('Interface fragments length:', this.nodeRegistry.interface.fragments?.length || 0);

      // In ethers v6, use fragments to count functions
      const functionFragments = this.nodeRegistry.interface.fragments.filter((f: any) => f.type === 'function');
      console.log(`Loaded ${functionFragments.length} contract functions via fragments`);

      // Test if registerNode function exists
      try {
        const registerNodeFunc = this.nodeRegistry.interface.getFunction('registerNode');
        console.log('Has registerNode?', !!registerNodeFunc);
      } catch (e) {
        console.error('registerNode not found:', e.message);
      }
    } else {
      console.error('Failed to initialize contract interface');
    }
  }

  /**
   * Initialize the enhanced host manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.modelManager.initialize();

    // Initialize discovery service
    const provider = this.signer?.provider;
    if (provider && this.nodeRegistryAddress) {
      this.discoveryService = new HostDiscoveryService(
        this.nodeRegistryAddress,
        provider
      );
      // HostDiscoveryService doesn't need initialization - it's ready to use
    }

    this.initialized = true;
  }

  /**
   * Register a host with validated models
   */
  async registerHostWithModels(request: HostRegistrationWithModels): Promise<string> {
    if (!this.initialized || !this.signer || !this.nodeRegistry) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      // Validate all models are approved
      const modelIds: string[] = [];

      for (const model of request.supportedModels) {
        const modelId = await this.modelManager.getModelId(model.repo, model.file);
        const isApproved = await this.modelManager.isModelApproved(modelId);

        if (!isApproved) {
          throw new ModelNotApprovedError(modelId, model.repo, model.file);
        }

        modelIds.push(modelId);
      }

      // Validate metadata structure
      if (!request.metadata.hardware || !request.metadata.hardware.gpu) {
        throw new ModelValidationError(
          'Invalid metadata: hardware configuration required',
          { metadata: request.metadata }
        );
      }

      // Validate pricing parameter early (before checking registration)
      // Ensure minPricePerToken has a value (default to '100' if undefined)
      const priceStr = request.minPricePerToken || DEFAULT_PRICE_PER_TOKEN;
      const minPrice = BigInt(priceStr);
      if (minPrice < MIN_PRICE_PER_TOKEN || minPrice > MAX_PRICE_PER_TOKEN) {
        throw new PricingValidationError(
          `minPricePerToken must be between ${MIN_PRICE_PER_TOKEN} and ${MAX_PRICE_PER_TOKEN}, got ${minPrice}`,
          minPrice
        );
      }

      // Format metadata as JSON (new requirement)
      const metadataJson = JSON.stringify({
        hardware: {
          gpu: request.metadata.hardware.gpu,
          vram: request.metadata.hardware.vram || 8,
          ram: request.metadata.hardware.ram || 16
        },
        capabilities: request.metadata.capabilities || { streaming: true },
        location: request.metadata.location || 'us-east-1',
        maxConcurrent: request.metadata.maxConcurrent || 5,
        costPerToken: request.metadata.costPerToken || 0.0001
      });

      // Check if node is already registered
      const signerAddress = await this.signer.getAddress();
      console.log('Checking registration for address:', signerAddress);

      const nodeInfo = await this.nodeRegistry['nodes'](signerAddress);
      console.log('Node info from contract:', {
        operator: nodeInfo[0],
        stakedAmount: nodeInfo[1]?.toString(),
        active: nodeInfo[2],
        hasOperator: nodeInfo[0] !== ethers.ZeroAddress
      });

      const isAlreadyRegistered = nodeInfo[0] !== ethers.ZeroAddress; // operator address at index 0

      if (isAlreadyRegistered) {
        console.log('Node is already registered with operator:', nodeInfo[0]);
        throw new ModelRegistryError(
          'Node is already registered. Use updateNodeInfo to modify metadata or addStake to increase stake.',
          this.nodeRegistry?.address
        );
      }
      console.log('Node is not registered, proceeding with registration');

      // Get FAB token contract address
      console.log('FAB token address from constructor:', this.fabTokenAddress);
      if (!this.fabTokenAddress) {
        throw new ModelRegistryError(
          'FAB token address not configured',
          this.nodeRegistry?.address
        );
      }

      // Check stake amount (FAB tokens, not ETH)
      const stakeAmount = ethers.parseEther(
        request.metadata.stakeAmount || '1000'
      );

      // Step 1: Create FAB token contract interface
      console.log('Creating FAB token contract with address:', this.fabTokenAddress);
      console.log('NodeRegistry address for operations:', this.nodeRegistryAddress);

      const fabToken = new Contract(
        this.fabTokenAddress,
        [
          'function approve(address spender, uint256 amount) returns (bool)',
          'function allowance(address owner, address spender) view returns (uint256)',
          'function balanceOf(address account) view returns (uint256)'
        ],
        this.signer
      );

      // Check FAB token balance
      const fabBalance = await fabToken.balanceOf(signerAddress);
      console.log(`FAB token balance: ${ethers.formatEther(fabBalance)} FAB`);

      if (fabBalance < stakeAmount) {
        throw new ModelRegistryError(
          `Insufficient FAB balance. Required: ${ethers.formatEther(stakeAmount)}, Available: ${ethers.formatEther(fabBalance)}`,
          this.fabTokenAddress
        );
      }

      // Step 2: Approve FAB tokens for the NodeRegistry contract
      console.log(`Approving ${ethers.formatEther(stakeAmount)} FAB tokens for NodeRegistry...`);
      const approveTx = await fabToken.approve(this.nodeRegistryAddress, stakeAmount);
      await approveTx.wait(3); // Wait for 3 confirmations as per CLAUDE.local.md
      console.log('FAB token approval successful');

      // Verify approval
      const allowance = await fabToken.allowance(signerAddress, this.nodeRegistryAddress);
      console.log(`Allowance after approval: ${ethers.formatEther(allowance)} FAB`);

      // Step 3: Register node with models (no ETH value needed, pricing already validated)
      console.log('Registering node with models...');
      console.log('Minimum price per token:', minPrice);

      // Debug: Check if method exists
      if (!this.nodeRegistry || !this.nodeRegistry['registerNode']) {
        console.error('ERROR: registerNode method not found on contract!');
        console.error('Contract address:', this.nodeRegistry?.address || this.nodeRegistry?.target);
        console.error('Available methods:', Object.keys(this.nodeRegistry || {}).filter(k => typeof this.nodeRegistry[k] === 'function'));
        throw new Error('registerNode method not found on NodeRegistry contract');
      }

      console.log('REGISTRATION DEBUG - About to call registerNode with:');
      console.log('  metadataJson:', metadataJson);
      console.log('  apiUrl:', request.apiUrl);
      console.log('  modelIds:', modelIds);
      console.log('  minPrice:', minPrice);
      console.log('  Contract address:', this.nodeRegistry.target || this.nodeRegistry.address);
      console.log('  Contract interface exists?', !!this.nodeRegistry.interface);

      // Try to encode the transaction data manually to see what's being sent
      try {
        const encodedData = this.nodeRegistry.interface.encodeFunctionData('registerNode', [
          metadataJson,
          request.apiUrl,
          modelIds,
          minPrice
        ]);
        console.log('  Encoded transaction data:', encodedData);
        console.log('  Encoded data length:', encodedData.length);
      } catch (encodeError) {
        console.error('  ERROR encoding transaction data:', encodeError);
      }

      const tx = await this.nodeRegistry['registerNode'](
        metadataJson,
        request.apiUrl,
        modelIds,
        minPrice,  // NEW: 4th parameter for pricing
        {
          gasLimit: 500000n
        }
      );

      console.log('REGISTRATION DEBUG - Transaction created:');
      console.log('  Transaction hash:', tx.hash);
      console.log('  Transaction to:', tx.to);
      console.log('  Transaction data:', tx.data);

      const receipt = await tx.wait(3); // Wait for 3 confirmations
      console.log('Node registration successful');

      // NodeRegistryWithModels automatically handles staking during registerNode()
      // No separate stake() call needed

      if (!receipt || receipt.status !== 1) {
        throw new ModelRegistryError(
          'Host registration transaction failed',
          this.nodeRegistry?.address
        );
      }

      return receipt.hash;
    } catch (error: any) {
      if (error instanceof ModelNotApprovedError ||
          error instanceof ModelValidationError ||
          error instanceof ModelRegistryError ||
          error instanceof PricingValidationError) {
        throw error;
      }
      throw new ModelRegistryError(
        `Failed to register host: ${error.message}`,
        this.nodeRegistry?.address
      );
    }
  }

  /**
   * Get all hosts supporting a specific model
   */
  async findHostsForModel(modelId: string): Promise<HostInfo[]> {
    if (!this.initialized || !this.nodeRegistry) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      // Validate model ID format
      if (!this.modelManager.isValidModelId(modelId)) {
        throw new InvalidModelIdError(modelId);
      }

      // Get nodes supporting this model
      const nodeAddresses = await this.nodeRegistry['getNodesForModel'](modelId);
      const hosts: HostInfo[] = [];

      for (const address of nodeAddresses) {
        const info = await this.nodeRegistry['getNodeFullInfo'](address);

        // Parse the returned data
        const metadata = JSON.parse(info[3]); // metadata is at index 3

        hosts.push({
          address,
          apiUrl: info[4],           // apiUrl at index 4
          metadata: metadata,
          supportedModels: info[5],   // model IDs array at index 5
          isActive: info[1],          // isActive at index 1
          stake: info[2]              // stake at index 2
        });
      }

      return hosts;
    } catch (error: any) {
      console.error('Error finding hosts for model:', error);
      return [];
    }
  }

  /**
   * Update host's supported models
   */
  async updateHostModels(newModels: ModelSpec[]): Promise<string> {
    if (!this.initialized || !this.signer || !this.nodeRegistry) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      const hostAddress = await this.signer.getAddress();
      const modelIds: string[] = [];

      // Validate and collect model IDs
      for (const model of newModels) {
        const modelId = await this.modelManager.getModelId(model.repo, model.file);
        const isApproved = await this.modelManager.isModelApproved(modelId);

        if (!isApproved) {
          throw new ModelNotApprovedError(modelId, model.repo, model.file);
        }

        modelIds.push(modelId);
      }

      // Update models on-chain
      const tx = await this.nodeRegistry['updateNodeModels'](modelIds, {
        gasLimit: 300000n
      });

      const receipt = await tx.wait(3); // Wait for 3 confirmations
      if (!receipt || receipt.status !== 1) {
        throw new ModelRegistryError(
          'Model update transaction failed',
          this.nodeRegistry?.address
        );
      }

      return receipt.hash;
    } catch (error: any) {
      if (error instanceof ModelNotApprovedError ||
          error instanceof ModelRegistryError) {
        throw error;
      }
      throw new ModelRegistryError(
        `Failed to update host models: ${error.message}`,
        this.nodeRegistry?.address
      );
    }
  }

  /**
   * Get host's supported models
   */
  async getHostModels(hostAddress: string): Promise<string[]> {
    if (!this.initialized || !this.nodeRegistry) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      const info = await this.nodeRegistry['getNodeFullInfo'](hostAddress);
      return info[5]; // Model IDs are at index 5
    } catch (error: any) {
      console.error('Error fetching host models:', error);
      return [];
    }
  }

  /**
   * Get host registration status with models
   */
  async getHostStatus(hostAddress: string): Promise<{
    isRegistered: boolean;
    isActive: boolean;
    supportedModels: string[];
    stake: bigint;
    metadata?: HostMetadata;
    apiUrl?: string;
    minPricePerToken?: bigint;
  }> {
    if (!this.initialized || !this.nodeRegistry) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      const info = await this.nodeRegistry['getNodeFullInfo'](hostAddress);

      // Check if registered (operator address will be non-zero)
      const isRegistered = info[0] !== ethers.ZeroAddress;

      if (!isRegistered) {
        return {
          isRegistered: false,
          isActive: false,
          supportedModels: [],
          stake: 0n
        };
      }

      // Parse metadata if available
      let metadata: HostMetadata | undefined;
      try {
        if (info[3]) {
          metadata = JSON.parse(info[3]);
        }
      } catch (e) {
        console.warn('Failed to parse metadata:', e);
      }

      return {
        isRegistered: true,
        isActive: info[2],  // Fixed: was info[1]
        supportedModels: info[5],
        stake: info[1],      // Fixed: was info[2]
        metadata,
        apiUrl: info[4],
        minPricePerToken: info[6] || 0n  // NEW: 7th field from contract
      };
    } catch (error: any) {
      console.error('Error fetching host status:', error);
      return {
        isRegistered: false,
        isActive: false,
        supportedModels: [],
        stake: 0n  // Fixed: was BigNumber.from(0)
      };
    }
  }

  /**
   * Get active hosts from blockchain
   */
  async getActiveHosts(): Promise<HostInfo[]> {
    try {
      if (!this.nodeRegistryAddress) {
        throw new SDKError('NodeRegistry address not configured', 'CONFIG_ERROR');
      }

      // Ensure discoveryService is initialized
      if (!this.discoveryService) {
        const provider = this.signer?.provider;
        if (!provider) {
          throw new SDKError('No provider available', 'PROVIDER_ERROR');
        }
        this.discoveryService = new HostDiscoveryService(
          this.nodeRegistryAddress,
          provider
        );
      }

      // Get real hosts with full metadata from blockchain
      const activeNodes = await this.discoveryService.getAllActiveNodes();

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
        pricePerToken: (node as any).pricePerToken || Number(MIN_PRICE_PER_TOKEN)
      } as HostInfo));
    } catch (error: any) {
      console.error('Failed to get active hosts:', error);
      // Return empty array - let UI handle empty state properly
      return [];
    }
  }

  /**
   * Discover all active hosts (simplified version for compatibility)
   */
  async discoverAllActiveHosts(): Promise<Array<{nodeAddress: string; apiUrl: string}>> {
    if (!this.initialized || !this.discoveryService) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      const nodes = await this.discoveryService.getAllActiveNodes();
      return nodes.map(n => ({
        nodeAddress: n.nodeAddress,
        apiUrl: n.apiUrl
      }));
    } catch (error: any) {
      throw new SDKError(
        `Failed to discover active hosts: ${error.message}`,
        'DISCOVERY_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Discover all active hosts with model information
   */
  async discoverAllActiveHostsWithModels(): Promise<HostInfo[]> {
    if (!this.initialized || !this.nodeRegistry) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      // Get all active nodes
      const activeNodes = await this.nodeRegistry['getAllActiveNodes']();
      const hosts: HostInfo[] = [];

      for (const address of activeNodes) {
        const info = await this.nodeRegistry['getNodeFullInfo'](address);

        // Parse metadata
        let metadata: HostMetadata;
        try {
          metadata = JSON.parse(info[3]);
        } catch (e) {
          console.warn(`Failed to parse metadata for ${address}:`, e);
          continue;
        }

        hosts.push({
          address,
          apiUrl: info[4],
          metadata,
          supportedModels: info[5],
          isActive: info[1],
          stake: info[2]
        });
      }

      return hosts;
    } catch (error: any) {
      console.error('Error discovering hosts:', error);
      return [];
    }
  }

  /**
   * Check if host supports a specific model
   */
  async hostSupportsModel(hostAddress: string, modelId: string): Promise<boolean> {
    const models = await this.getHostModels(hostAddress);
    return models.includes(modelId);
  }

  /**
   * Get the underlying discovery service
   */
  getDiscoveryService(): HostDiscoveryService | undefined {
    return this.discoveryService;
  }

  /**
   * Get the model manager instance
   */
  getModelManager(): ModelManager {
    return this.modelManager;
  }

  /**
   * Update host's supported models
   */
  async updateSupportedModels(modelIds: string[]): Promise<string> {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.signer || !this.nodeRegistry) {
      throw new ModelRegistryError('Not initialized', this.nodeRegistryAddress);
    }

    try {
      // Convert string model IDs to bytes32 format if needed
      const modelIdsBytes32 = modelIds.map(id => {
        // If it's already a hex string starting with 0x, use it
        if (id.startsWith('0x')) {
          return id;
        }
        // Otherwise, convert the number to bytes32
        return ethers.zeroPadValue(ethers.toBeHex(BigInt(id)), 32);
      });

      console.log('Updating supported models with IDs:', modelIdsBytes32);
      console.log('Contract address:', this.nodeRegistry.target || this.nodeRegistry.address);

      // Ensure the contract interface has the function
      if (!this.nodeRegistry.updateSupportedModels) {
        console.error('updateSupportedModels function not found on contract');
        console.log('Available functions:', Object.keys(this.nodeRegistry.functions || {}));
        throw new Error('Contract method updateSupportedModels not found');
      }

      // Call updateSupportedModels on the NodeRegistry contract
      console.log('Calling updateSupportedModels...');
      const tx = await this.nodeRegistry.updateSupportedModels(
        modelIdsBytes32,
        { gasLimit: 500000n }
      );

      const receipt = await tx.wait(3); // Wait for 3 confirmations

      if (!receipt || receipt.status !== 1) {
        throw new ModelRegistryError(
          'Failed to update supported models',
          this.nodeRegistry.address
        );
      }

      console.log('Successfully updated supported models');
      return receipt.hash;
    } catch (error: any) {
      throw new ModelRegistryError(
        `Failed to update supported models: ${error.message}`,
        this.nodeRegistry?.address,
        error
      );
    }
  }

  /**
   * Get host information (IHostManager interface compatibility)
   */
  async getHostInfo(address: string): Promise<HostInfo> {
    const status = await this.getHostStatus(address);

    return {
      address,
      isRegistered: status.isRegistered,
      isActive: status.isActive,
      apiUrl: status.apiUrl || '',
      metadata: status.metadata || {
        hardware: { gpu: '', vram: 0, ram: 0 },
        capabilities: { streaming: false },
        location: '',
        maxConcurrent: 0,
        costPerToken: 0
      },
      supportedModels: status.supportedModels || [],
      stake: status.stake,
      minPricePerToken: status.minPricePerToken || 0n  // NEW: Include pricing from contract
    };
  }

  /**
   * Update the API URL for the host
   */
  async updateApiUrl(apiUrl: string): Promise<string> {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.signer || !this.nodeRegistry) {
      throw new ModelRegistryError('Not initialized', this.nodeRegistryAddress);
    }

    try {
      console.log('Updating API URL to:', apiUrl);

      // Call updateApiUrl on the NodeRegistry contract
      const tx = await this.nodeRegistry.updateApiUrl(
        apiUrl,
        { gasLimit: 300000n }
      );

      const receipt = await tx.wait(3); // Wait for 3 confirmations

      if (!receipt || receipt.status !== 1) {
        throw new ModelRegistryError(
          'Failed to update API URL',
          this.nodeRegistry.address
        );
      }

      console.log('Successfully updated API URL');
      return receipt.hash;
    } catch (error: any) {
      throw new ModelRegistryError(
        `Failed to update API URL: ${error.message}`,
        this.nodeRegistry?.address,
        error
      );
    }
  }

  /**
   * Update host minimum pricing
   * @param newMinPrice - New minimum price per token (100-100,000)
   * @returns Transaction hash
   */
  async updatePricing(newMinPrice: string): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.signer || !this.nodeRegistry) {
      throw new ModelRegistryError('Not initialized', this.nodeRegistryAddress);
    }

    try {
      const price = BigInt(newMinPrice);

      // Validate price range
      if (price < MIN_PRICE_PER_TOKEN || price > MAX_PRICE_PER_TOKEN) {
        throw new PricingValidationError(
          `minPricePerToken must be between ${MIN_PRICE_PER_TOKEN} and ${MAX_PRICE_PER_TOKEN}, got ${price}`,
          price
        );
      }

      console.log('Updating pricing to:', price);

      const tx = await this.nodeRegistry.updatePricing(
        price,
        { gasLimit: 200000n }
      );

      const receipt = await tx.wait(3); // Wait for 3 confirmations

      if (!receipt || receipt.status !== 1) {
        throw new ModelRegistryError(
          'Failed to update pricing',
          this.nodeRegistry.address
        );
      }

      console.log('Successfully updated pricing');
      return receipt.hash;
    } catch (error: any) {
      if (error instanceof PricingValidationError) {
        throw error;
      }
      console.error('Error updating pricing:', error);
      throw new ModelRegistryError(
        `Failed to update pricing: ${error.message}`,
        this.nodeRegistry?.address
      );
    }
  }

  /**
   * Get host minimum pricing
   * @param hostAddress - Host address to query pricing for
   * @returns Minimum price per token as bigint (0 if not registered)
   */
  async getPricing(hostAddress: string): Promise<bigint> {
    if (!this.initialized || !this.nodeRegistry) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      const pricing = await this.nodeRegistry.getNodePricing(hostAddress);
      return pricing;
    } catch (error: any) {
      console.error('Error fetching pricing:', error);
      // Return 0 for unregistered hosts or errors
      return 0n;
    }
  }

  /**
   * Get host accumulated earnings for a specific token
   * @param hostAddress - Host address to check earnings for
   * @param tokenAddress - Token address (use ethers.ZeroAddress for native ETH/BNB)
   * @returns Accumulated earnings as bigint (in token's smallest unit)
   */
  async getHostEarnings(hostAddress: string, tokenAddress: string): Promise<bigint> {
    if (!this.initialized) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    if (!this.hostEarningsAddress) {
      throw new SDKError('Host earnings contract not configured', 'NO_EARNINGS_CONTRACT');
    }

    try {
      const hostEarningsABI = await this.contractManager.getContractABI('hostEarnings');
      const provider = this.signer?.provider || await this.contractManager.getProvider();

      const earnings = new ethers.Contract(
        this.hostEarningsAddress,
        hostEarningsABI,
        provider
      );

      const balance = await earnings.getBalance(hostAddress, tokenAddress);
      return balance;
    } catch (error: any) {
      throw new SDKError(
        `Failed to get host earnings: ${error.message}`,
        'GET_EARNINGS_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Withdraw earnings from HostEarnings contract
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
   * Unregister the host from the NodeRegistry contract
   * This will return any staked FAB tokens back to the host
   */
  async unregisterHost(): Promise<string> {
    if (!this.initialized || !this.signer || !this.nodeRegistry) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      // Call the unregisterNode function on the NodeRegistry contract
      const tx = await this.nodeRegistry.unregisterNode();

      const receipt = await tx.wait(3); // Wait for 3 confirmations
      if (!receipt || receipt.status !== 1) {
        throw new SDKError('Unregistration failed', 'UNREGISTRATION_FAILED');
      }

      return receipt.hash;
    } catch (error: any) {
      throw new SDKError(
        `Failed to unregister host: ${error.message}`,
        'UNREGISTRATION_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Update the metadata for the host
   */
  async updateMetadata(metadata: string): Promise<string> {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.signer || !this.nodeRegistry) {
      throw new ModelRegistryError('Not initialized', this.nodeRegistryAddress);
    }

    try {
      console.log('Updating metadata...');

      // Call updateMetadata on the NodeRegistry contract
      const tx = await this.nodeRegistry.updateMetadata(
        metadata,
        { gasLimit: 300000n }
      );

      const receipt = await tx.wait(3); // Wait for 3 confirmations

      if (!receipt || receipt.status !== 1) {
        throw new ModelRegistryError(
          'Failed to update metadata',
          this.nodeRegistry.address
        );
      }

      console.log('Successfully updated metadata');
      return receipt.hash;
    } catch (error: any) {
      throw new ModelRegistryError(
        `Failed to update metadata: ${error.message}`,
        this.nodeRegistry?.address,
        error
      );
    }
  }

  /**
   * Add additional stake to the host registration
   */
  async addStake(amount: string | bigint): Promise<string> {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.signer || !this.nodeRegistry) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      // Convert amount to wei if it's a string (FAB amount)
      // If it's already a bigint, assume it's already in wei
      let stakeAmountWei: bigint;
      if (typeof amount === 'string') {
        // Convert FAB to wei (18 decimals)
        stakeAmountWei = ethers.parseEther(amount);
        console.log('Adding stake:', amount, 'FAB (', stakeAmountWei.toString(), 'wei)');
      } else {
        stakeAmountWei = amount;
        console.log('Adding stake:', ethers.formatEther(stakeAmountWei), 'FAB');
      }

      // Call stake on the NodeRegistry contract
      const tx = await this.nodeRegistry.stake(
        stakeAmountWei,
        { gasLimit: 200000n }
      );

      const receipt = await tx.wait(3); // Wait for 3 confirmations

      if (!receipt || receipt.status !== 1) {
        throw new SDKError('Failed to add stake', 'STAKE_FAILED');
      }

      console.log('Successfully added stake');
      return receipt.hash;
    } catch (error: any) {
      throw new SDKError(
        `Failed to add stake: ${error.message}`,
        'STAKE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Remove stake from host
   */
  async removeStake(amount: string): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.signer || !this.nodeRegistry) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      const stakeAmount = ethers.parseUnits(amount, 18);

      // Remove stake
      const tx = await this.nodeRegistry.removeStake(stakeAmount, { gasLimit: 200000n });

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
   * Withdraw stake (alias for removeStake, used by host-cli)
   */
  async withdrawStake(amount: string): Promise<string> {
    return this.removeStake(amount);
  }

  /**
   * Set host status (active/inactive)
   */
  async setHostStatus(active: boolean): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.signer || !this.nodeRegistry) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      const tx = await this.nodeRegistry.setNodeStatus(active, { gasLimit: 150000n });

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
      await this.initialize();
    }

    // Reputation would come from a separate reputation contract
    // or off-chain reputation service
    return 100; // Default reputation
  }

  /**
   * Query hosts by model
   */
  async findHostsByModel(model: string): Promise<HostInfo[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    // This would require indexing or event log scanning
    // For browser compatibility, would need a separate indexing service
    return [];
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
}