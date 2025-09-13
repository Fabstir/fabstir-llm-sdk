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
import NodeRegistryWithModelsABI from '../contracts/abis/NodeRegistryWithModels-CLIENT-ABI.json';

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

  constructor(
    signer: Signer,
    nodeRegistryAddress: string,
    modelManager: ModelManager
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

    // Initialize contract
    this.nodeRegistry = new Contract(
      nodeRegistryAddress,
      NodeRegistryWithModelsABI,
      signer
    );
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

      // Check stake amount
      const stakeAmount = ethers.parseEther(
        request.metadata.stakeAmount || '1000'
      );

      // Call new registration method with models
      const tx = await this.nodeRegistry['registerNode'](
        metadataJson,
        request.apiUrl,
        modelIds,
        {
          value: stakeAmount,
          gasLimit: 500000n
        }
      );

      const receipt = await tx.wait();
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
    stake: BigNumber;
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
          stake: BigNumber.from(0)
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
}