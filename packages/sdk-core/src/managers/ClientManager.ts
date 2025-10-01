/**
 * ClientManager - Handles client-side model operations and host selection
 */

import { ethers } from 'ethers';
import {
  HostInfo,
  ModelSpec,
  ModelRequirements,
  ModelAvailability,
  JobInfo
} from '../types/models';
import {
  ModelNotApprovedError,
  InvalidModelIdError,
  NoHostsForModelError,
  ModelValidationError
} from '../errors/model-errors';
import { SDKError } from '../errors';
import { ModelManager } from './ModelManager';
import { HostManager } from './HostManager';
import { ContractManager } from '../contracts/ContractManager';

export class ClientManager {
  private modelManager: ModelManager;
  private hostManager: HostManager;
  private contractManager: ContractManager;
  private jobMarketplace?: ethers.Contract;
  private signer?: ethers.Signer;
  private initialized = false;

  constructor(
    modelManager: ModelManager,
    hostManager: HostManager,
    contractManager: ContractManager
  ) {
    this.modelManager = modelManager;
    this.hostManager = hostManager;
    this.contractManager = contractManager;
  }

  /**
   * Initialize the client manager
   */
  async initialize(signer?: ethers.Signer): Promise<void> {
    if (signer) {
      this.signer = signer;
      await this.contractManager.setSigner(signer);
    }

    // Get job marketplace contract
    const jobMarketplaceAddress = await this.contractManager.getContractAddress('jobMarketplace');
    const jobMarketplaceABI = await this.contractManager.getContractABI('jobMarketplace');

    if (jobMarketplaceAddress && jobMarketplaceABI && this.signer) {
      this.jobMarketplace = new ethers.Contract(
        jobMarketplaceAddress,
        jobMarketplaceABI,
        this.signer
      );
    }

    this.initialized = true;
  }

  /**
   * Select best host for a specific model
   */
  async selectHostForModel(
    modelSpec: ModelSpec,
    requirements?: {
      minVRAM?: number;
      location?: string;
      maxCostPerToken?: number;
    }
  ): Promise<HostInfo | null> {
    const modelId = await this.modelManager.getModelId(modelSpec.repo, modelSpec.file);

    // Check model is approved
    const isApproved = await this.modelManager.isModelApproved(modelId);
    if (!isApproved) {
      throw new ModelNotApprovedError(modelId, modelSpec.repo, modelSpec.file);
    }

    // Find all hosts with this model
    const hosts = await this.hostManager.findHostsForModel(modelId);

    // Filter by requirements
    const suitableHosts = hosts.filter(host => {
      if (!host.isActive) return false;

      if (requirements?.minVRAM && host.metadata.hardware.vram < requirements.minVRAM) {
        return false;
      }

      if (requirements?.location && host.metadata.location !== requirements.location) {
        return false;
      }

      if (requirements?.maxCostPerToken &&
          host.metadata.costPerToken > requirements.maxCostPerToken) {
        return false;
      }

      return true;
    });

    if (suitableHosts.length === 0) {
      return null;
    }

    // Sort by cost (lowest first) and then by stake (highest first)
    suitableHosts.sort((a, b) => {
      const costDiff = a.metadata.costPerToken - b.metadata.costPerToken;
      if (costDiff !== 0) return costDiff;

      // Compare stakes if costs are equal
      const stakeA = BigInt(a.stake);
      const stakeB = BigInt(b.stake);
      return stakeB > stakeA ? 1 : -1;
    });

    return suitableHosts[0];
  }

  /**
   * Get model availability across the network
   */
  async getModelAvailability(modelId: string): Promise<ModelAvailability> {
    // Validate model ID
    if (!this.modelManager.isValidModelId(modelId)) {
      throw new InvalidModelIdError(modelId);
    }

    // Get all hosts supporting this model
    const hosts = await this.hostManager.findHostsForModel(modelId);

    // Filter active hosts
    const activeHosts = hosts.filter(h => h.isActive);

    // Calculate statistics
    const locations = [...new Set(hosts.map(h => h.metadata.location))];
    const vramValues = hosts.map(h => h.metadata.hardware.vram);
    const prices = activeHosts.map(h => h.metadata.costPerToken);

    return {
      totalHosts: hosts.length,
      activeHosts: activeHosts.length,
      averagePrice: prices.length > 0
        ? prices.reduce((a, b) => a + b, 0) / prices.length
        : 0,
      locations,
      minVRAM: vramValues.length > 0 ? Math.min(...vramValues) : 0,
      maxVRAM: vramValues.length > 0 ? Math.max(...vramValues) : 0
    };
  }

  /**
   * Estimate job cost for a model
   */
  async estimateJobCost(
    modelId: string,
    maxTokens: number
  ): Promise<{
    minCost: number;
    maxCost: number;
    averageCost: number;
    recommendedHost?: HostInfo;
  }> {
    // Get model availability
    const availability = await this.getModelAvailability(modelId);

    if (availability.activeHosts === 0) {
      throw new NoHostsForModelError(modelId);
    }

    // Get all active hosts
    const hosts = await this.hostManager.findHostsForModel(modelId);
    const activeHosts = hosts.filter(h => h.isActive);

    // Calculate costs
    const costs = activeHosts.map(h => h.metadata.costPerToken * maxTokens);
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const averageCost = costs.reduce((a, b) => a + b, 0) / costs.length;

    // Find recommended host (best price/performance ratio)
    const recommendedHost = activeHosts.sort((a, b) => {
      // Score based on cost and hardware
      const scoreA = a.metadata.costPerToken / a.metadata.hardware.vram;
      const scoreB = b.metadata.costPerToken / b.metadata.hardware.vram;
      return scoreA - scoreB;
    })[0];

    return {
      minCost,
      maxCost,
      averageCost,
      recommendedHost
    };
  }

  /**
   * Create inference job with model validation
   */
  async createInferenceJob(
    modelSpec: ModelSpec,
    prompt: string,
    maxTokens: number,
    options?: {
      hostAddress?: string;
      paymentAmount?: string;
      paymentType?: 'ETH' | 'USDC';
    }
  ): Promise<JobInfo> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('ClientManager not initialized', 'CLIENT_NOT_INITIALIZED');
    }

    // Get model ID
    const modelId = await this.modelManager.getModelId(modelSpec.repo, modelSpec.file);

    // Validate model is approved
    const isApproved = await this.modelManager.isModelApproved(modelId);
    if (!isApproved) {
      throw new ModelNotApprovedError(modelId, modelSpec.repo, modelSpec.file);
    }

    // Select host if not specified
    let hostAddress = options?.hostAddress;
    if (!hostAddress) {
      const host = await this.selectHostForModel(modelSpec);
      if (!host) {
        const modelId = await this.modelManager.getModelId(modelSpec.repo, modelSpec.file);
        throw new NoHostsForModelError(modelId, `${modelSpec.repo}/${modelSpec.file}`);
      }
      hostAddress = host.address;
    }

    // Verify host supports the model
    const hostSupportsModel = await this.hostManager.hostSupportsModel(hostAddress, modelId);
    if (!hostSupportsModel) {
      throw new ModelValidationError(
        `Host ${hostAddress} does not support model ${modelSpec.file}`,
        { hostAddress, modelId, modelSpec }
      );
    }

    // Create job on blockchain if marketplace is available
    let jobId = Math.floor(Math.random() * 1000000); // Default random ID

    if (this.jobMarketplace) {
      try {
        // Prepare job data
        const jobData = {
          prompt,
          model: modelId,
          maxTokens,
          temperature: 0.7,
          hostAddress
        };

        // Create job based on payment type
        let tx;
        if (options?.paymentType === 'USDC') {
          // USDC payment flow (requires approval first)
          tx = await this.jobMarketplace['createJobWithUSDC'](
            hostAddress,
            JSON.stringify(jobData),
            ethers.parseUnits(options.paymentAmount || '10', 6), // USDC has 6 decimals
            { gasLimit: 500000n }
          );
        } else {
          // ETH payment flow
          tx = await this.jobMarketplace['createJob'](
            hostAddress,
            JSON.stringify(jobData),
            {
              value: ethers.parseEther(options?.paymentAmount || '0.001'),
              gasLimit: 500000n
            }
          );
        }

        const receipt = await tx.wait(3); // Wait for 3 confirmations

        // Extract job ID from events
        const event = receipt.events?.find((e: any) => e.event === 'JobCreated');
        if (event) {
          jobId = event.args.jobId.toNumber();
        }
      } catch (error: any) {
        console.error('Failed to create on-chain job:', error);
        // Continue with off-chain job
      }
    }

    return {
      jobId,
      modelId,
      hostAddress,
      status: 'pending',
      prompt,
      maxTokens
    };
  }

  /**
   * Find hosts by model requirements
   */
  async findHostsByRequirements(requirements: ModelRequirements): Promise<HostInfo[]> {
    // Get model ID
    let modelId: string;
    if (requirements.model.startsWith('0x')) {
      modelId = requirements.model;
    } else {
      // Assume it's a model spec key from APPROVED_MODELS
      const { APPROVED_MODELS } = await import('../constants/models');
      const modelSpec = APPROVED_MODELS[requirements.model];
      if (!modelSpec) {
        throw new ModelValidationError(
          `Unknown model: ${requirements.model}`,
          { model: requirements.model }
        );
      }
      modelId = await this.modelManager.getModelId(modelSpec.repo, modelSpec.file);
    }

    // Get all hosts for this model
    const hosts = await this.hostManager.findHostsForModel(modelId);

    // Apply filters
    return hosts.filter(host => {
      if (!host.isActive) return false;

      if (requirements.minVRAM && host.metadata.hardware.vram < requirements.minVRAM) {
        return false;
      }

      if (requirements.location && host.metadata.location !== requirements.location) {
        return false;
      }

      if (requirements.maxCostPerToken &&
          host.metadata.costPerToken > requirements.maxCostPerToken) {
        return false;
      }

      if (requirements.minStake) {
        const minStake = BigInt(requirements.minStake);
        if (BigInt(host.stake) < minStake) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Get recommended models for a use case
   */
  async getRecommendedModels(useCase: 'chat' | 'code' | 'general'): Promise<ModelSpec[]> {
    const { APPROVED_MODELS } = await import('../constants/models');

    // For MVP, return all approved models
    // In future, this can be enhanced with use-case specific recommendations
    const models = Object.values(APPROVED_MODELS);

    // Basic filtering based on use case
    switch (useCase) {
      case 'chat':
        // Prefer chat-optimized models
        return models.filter(m =>
          m.file.toLowerCase().includes('chat') ||
          m.file.toLowerCase().includes('vicuna')
        );
      case 'code':
        // Prefer code-optimized models (none in current approved list)
        return models;
      case 'general':
      default:
        return models;
    }
  }

  /**
   * Check if client manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get model manager instance
   */
  getModelManager(): ModelManager {
    return this.modelManager;
  }

  /**
   * Get host manager instance
   */
  getHostManager(): HostManager {
    return this.hostManager;
  }

  /**
   * Discover nodes that support a specific chain
   */
  async discoverNodes(chainId: number): Promise<any[]> {
    // For now, use a discovery endpoint (could be configurable)
    const discoveryUrl = process.env.NODE_DISCOVERY_URL || 'http://localhost:8080';

    try {
      const response = await fetch(`${discoveryUrl}/v1/models?chain_id=${chainId}`);
      if (!response.ok) {
        throw new SDKError(`Failed to discover nodes: ${response.statusText}`, 'NODE_DISCOVERY_ERROR');
      }

      const data = await response.json();
      const nodes = data.nodes || [];

      // Filter nodes by chain support if chain info is available
      if (chainId) {
        return nodes.filter((node: any) => {
          // If node has no chain info, assume it supports the requested chain
          if (!node.chains || node.chains.length === 0) {
            return true;
          }
          // Otherwise check if it explicitly supports the chain
          return node.chains.includes(chainId);
        });
      }

      return nodes;
    } catch (error: any) {
      throw new SDKError(`Node discovery failed: ${error.message}`, 'NODE_DISCOVERY_ERROR', { chainId, error });
    }
  }

  /**
   * Get list of chains a node supports
   */
  async getNodeChains(nodeUrl: string): Promise<number[]> {
    try {
      const response = await fetch(`${nodeUrl}/v1/chains`);
      if (!response.ok) {
        throw new SDKError(`Failed to get node chains: ${response.statusText}`, 'NODE_CHAINS_ERROR');
      }

      const data = await response.json();
      const chains = data.chains || [];

      // Extract chain IDs from the response
      return chains.map((chain: any) => chain.chain_id || chain);
    } catch (error: any) {
      throw new SDKError(`Failed to get node chains: ${error.message}`, 'NODE_CHAINS_ERROR', { nodeUrl, error });
    }
  }

  /**
   * Check node health with chain validation
   */
  async checkNodeHealth(nodeUrl: string, chainId?: number): Promise<boolean> {
    try {
      const response = await fetch(`${nodeUrl}/v1/health`);
      if (!response.ok) {
        return false;
      }

      const data = await response.json();

      // Check basic health
      if (!data.healthy) {
        return false;
      }

      // If chainId is specified, validate the node supports it
      if (chainId && data.chain_id && data.chain_id !== chainId) {
        return false;
      }

      return true;
    } catch (error) {
      // Network errors or other issues mean node is not healthy
      return false;
    }
  }
}