/**
 * Enhanced Host Manager with Model Governance Support
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
import { SDKError } from '../errors';
import { ContractManager } from '../contracts/ContractManager';
import { ModelManager } from './ModelManager';
import { HostDiscoveryService } from '../services/HostDiscoveryService';
import { NodeRegistryWithModelsABI } from '../contracts/abis';

export interface HostRegistrationWithModels {
  metadata: HostMetadata;
  apiUrl: string;
  supportedModels: ModelSpec[];
}

export class HostManagerEnhanced {
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

    this.nodeRegistry = new Contract(
      nodeRegistryAddress,
      NodeRegistryWithModelsABI,
      signer
    );

    // Verify the contract interface is loaded
    if (this.nodeRegistry.interface) {
      console.log('Contract interface initialized successfully');
      const functions = Object.keys(this.nodeRegistry.interface.functions || {});
      console.log(`Loaded ${functions.length} contract functions`);
      console.log('Has updateSupportedModels?', functions.includes('updateSupportedModels(bytes32[])'));
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
      const signerAddress = await this.signer.getAddress();
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
      await approveTx.wait();
      console.log('FAB token approval successful');

      // Verify approval
      const allowance = await fabToken.allowance(signerAddress, this.nodeRegistryAddress);
      console.log(`Allowance after approval: ${ethers.formatEther(allowance)} FAB`);

      // Step 3: Register node with models (no ETH value needed)
      console.log('Registering node with models...');
      const tx = await this.nodeRegistry['registerNode'](
        metadataJson,
        request.apiUrl,
        modelIds,
        {
          gasLimit: 500000n
        }
      );

      await tx.wait();
      console.log('Node registration successful');

      // Step 4: Stake FAB tokens (separate transaction after registration)
      console.log(`Staking ${ethers.formatEther(stakeAmount)} FAB tokens...`);

      // The stake function requires the node to be registered first
      // It will transfer FAB tokens from the signer to the contract
      const stakeTx = await this.nodeRegistry['stake'](stakeAmount, {
        gasLimit: 500000n  // Increased gas limit for stake operation
      });

      const receipt = await stakeTx.wait();

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
          error instanceof ModelRegistryError) {
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

      const receipt = await tx.wait();
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
  }> {
    if (!this.initialized || !this.nodeRegistry) {
      throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
    }

    try {
      const info = await this.nodeRegistry['getNodeFullInfo'](hostAddress);

      // Check if registered (operator address will be non-zero)
      const isRegistered = info[0] !== '0x0000000000000000000000000000000000000000';

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
        isActive: info[1],
        supportedModels: info[5],
        stake: info[2],
        metadata,
        apiUrl: info[4]
      };
    } catch (error: any) {
      console.error('Error fetching host status:', error);
      return {
        isRegistered: false,
        isActive: false,
        supportedModels: [],
        stake: BigNumber.from(0)
      };
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

      const receipt = await tx.wait();

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
      stake: status.stake
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

      const receipt = await tx.wait();

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
}