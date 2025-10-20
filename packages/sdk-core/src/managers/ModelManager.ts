// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * ModelManager - Handles model registry operations and validation
 */

import { Contract, Provider, Signer, isAddress, keccak256, toUtf8Bytes } from 'ethers';
import {
  ModelInfo,
  ModelSpec,
  ModelValidation
} from '../types/models';
import { DEFAULT_MODEL_CONFIG } from '../constants/models';
import {
  ModelNotApprovedError,
  InvalidModelIdError,
  ModelHashMismatchError,
  ModelRegistryError,
  ModelValidationError
} from '../errors/model-errors';
import ModelRegistryABI from '../contracts/abis/ModelRegistry-CLIENT-ABI.json';

export class ModelManager {
  private modelRegistry: Contract;
  private modelCache: Map<string, { info: ModelInfo; timestamp: number }>;
  private cacheTimeout: number;
  private initialized: boolean = false;

  constructor(
    provider: Provider,
    registryAddress: string,
    signer?: Signer
  ) {
    if (!registryAddress || !isAddress(registryAddress)) {
      throw new ModelRegistryError(
        'Invalid model registry address',
        registryAddress
      );
    }

    this.modelRegistry = new Contract(
      registryAddress,
      ModelRegistryABI,
      signer || provider
    );
    this.modelCache = new Map();
    this.cacheTimeout = DEFAULT_MODEL_CONFIG.cacheTimeout || 300000; // 5 minutes default
  }

  /**
   * Initialize the model manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Verify contract is accessible by checking if it has code
      const code = await this.modelRegistry.runner?.provider?.getCode(await this.modelRegistry.getAddress());
      if (!code || code === '0x') {
        throw new Error(
          `ModelRegistry contract not deployed at ${await this.modelRegistry.getAddress()}. Cannot proceed without contract deployment`
        );
      }

      // Try to call a view function to verify the contract interface
      await this.modelRegistry.APPROVAL_THRESHOLD();
      this.initialized = true;
    } catch (error) {
      // No fallback - throw error if initialization fails
      throw new Error(
        `ModelManager initialization failed: ${error.message}. Ensure ModelRegistry contract is deployed and accessible`
      );
    }
  }

  /**
   * Calculate model ID from repo and filename
   * CRITICAL: This must match the node's calculation exactly
   */
  async getModelId(huggingfaceRepo: string, fileName: string): Promise<string> {
    if (!huggingfaceRepo || !fileName) {
      throw new ModelValidationError(
        'Repository and filename are required for model ID calculation'
      );
    }

    // Trim whitespace to avoid calculation errors
    const repo = huggingfaceRepo.trim();
    const file = fileName.trim();

    const input = `${repo}/${file}`;
    const hash = keccak256(toUtf8Bytes(input));
    return hash;
  }

  /**
   * Check if a model is approved on-chain
   */
  async isModelApproved(modelId: string): Promise<boolean> {
    this.ensureInitialized();

    if (!this.isValidModelId(modelId)) {
      throw new InvalidModelIdError(modelId);
    }

    try {
      const approved = await this.modelRegistry.isModelApproved(modelId);
      return approved;
    } catch (error) {
      if (error instanceof InvalidModelIdError) {
        throw error;
      }
      throw new ModelRegistryError(
        `Failed to check model approval: ${error.message}`,
        this.modelRegistry.address
      );
    }
  }

  /**
   * Get detailed model information from registry
   */
  async getModelDetails(modelId: string): Promise<ModelInfo | null> {
    this.ensureInitialized();

    // Check cache first
    const cached = this.modelCache.get(modelId);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.info;
    }

    try {
      const model = await this.modelRegistry.getModel(modelId);

      // Check if model exists (huggingfaceRepo will be empty for non-existent models)
      if (!model.huggingfaceRepo || model.huggingfaceRepo === '') {
        return null;
      }

      const info: ModelInfo = {
        modelId,
        huggingfaceRepo: model.huggingfaceRepo,
        fileName: model.fileName,
        sha256Hash: model.sha256Hash,
        approvalTier: Number(model.approvalTier),
        active: model.active,
        timestamp: Number(model.timestamp)
      };

      // Update cache
      this.modelCache.set(modelId, {
        info,
        timestamp: Date.now()
      });

      return info;
    } catch (error) {
      throw new ModelRegistryError(
        `Failed to fetch model details: ${error.message}`,
        this.modelRegistry.address
      );
    }
  }

  /**
   * Get all approved models using direct contract reads
   */
  async getAllApprovedModels(): Promise<ModelInfo[]> {
    this.ensureInitialized();

    try {
      console.log('Fetching all models using direct contract reads...');

      // Get all model IDs directly from the contract
      const modelIds = await this.modelRegistry.getAllModels();

      console.log(`Found ${modelIds.length} model IDs from contract`);

      if (modelIds.length === 0) {
        return [];
      }

      // Fetch details for each model in parallel
      const modelPromises = modelIds.map(async (modelId) => {
        try {
          // Get model details
          const model = await this.modelRegistry.models(modelId);

          // Check if approved
          const isApproved = await this.modelRegistry.isModelApproved(modelId);

          // Return formatted model info
          return {
            modelId,
            huggingfaceRepo: model.huggingfaceRepo,
            fileName: model.fileName,
            sha256Hash: model.sha256Hash,
            approvalTier: Number(model.approvalTier),
            active: model.active,
            timestamp: Number(model.timestamp),
            approved: isApproved
          } as ModelInfo;
        } catch (error) {
          console.warn(`Error fetching model ${modelId}:`, error);
          return null;
        }
      });

      const models = await Promise.all(modelPromises);

      // Filter out nulls and inactive models
      const activeModels = models.filter(
        (model): model is ModelInfo => model !== null && model.active
      );

      console.log(`Fetched ${activeModels.length} active approved models`);
      return activeModels;
    } catch (error) {
      console.error('Error fetching approved models:', error);

      // No fallback approaches - if getAllModels fails, throw error
      throw new Error(
        `Failed to list models: ${error.message}. Ensure ModelRegistry contract is properly deployed and accessible`
      );
    }
  }

  /**
   * Verify model file integrity (for UI validation)
   */
  async verifyModelHash(fileContent: ArrayBuffer, expectedHash: string): Promise<boolean> {
    if (!fileContent || fileContent.byteLength === 0) {
      throw new ModelValidationError('File content is required for hash verification');
    }

    if (!expectedHash || !/^[a-fA-F0-9]{64}$/.test(expectedHash)) {
      throw new ModelValidationError('Invalid SHA-256 hash format');
    }

    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', fileContent);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const matches = hashHex === expectedHash.toLowerCase();

      if (!matches) {
        throw new ModelHashMismatchError(
          expectedHash.toLowerCase(),
          hashHex,
          'uploaded file'
        );
      }

      return matches;
    } catch (error) {
      if (error instanceof ModelHashMismatchError) {
        throw error;
      }
      throw new ModelValidationError(
        `Hash verification failed: ${error.message}`
      );
    }
  }

  /**
   * Validate a model completely
   */
  async validateModel(modelSpec: ModelSpec, fileContent?: ArrayBuffer): Promise<ModelValidation> {
    this.ensureInitialized();

    const errors: string[] = [];

    if (!modelSpec.repo || !modelSpec.file) {
      throw new ModelValidationError(
        'Model repository and filename are required',
        { modelSpec }
      );
    }

    const modelId = await this.getModelId(modelSpec.repo, modelSpec.file);

    // Check if model is approved
    const isApproved = await this.isModelApproved(modelId);
    if (!isApproved) {
      errors.push(`Model ${modelSpec.file} is not approved in registry`);
      // Throw specific error for unapproved models
      throw new ModelNotApprovedError(modelId, modelSpec.repo, modelSpec.file);
    }

    // Verify hash if file content provided
    let hashMatch = true;
    if (fileContent && modelSpec.sha256) {
      hashMatch = await this.verifyModelHash(fileContent, modelSpec.sha256);
      if (!hashMatch) {
        errors.push('Model file hash does not match expected value');
      }
    }

    return {
      isValid: isApproved && hashMatch && errors.length === 0,
      modelId,
      isApproved,
      hashMatch,
      errors
    };
  }

  /**
   * Get model by repository and filename
   */
  async getModelBySpec(repo: string, fileName: string): Promise<ModelInfo | null> {
    const modelId = await this.getModelId(repo, fileName);
    return this.getModelDetails(modelId);
  }

  /**
   * Clear model cache
   */
  clearCache(): void {
    this.modelCache.clear();
  }

  /**
   * Set cache timeout
   */
  setCacheTimeout(timeout: number): void {
    this.cacheTimeout = timeout;
  }

  /**
   * Get approval tier name
   */
  getApprovalTierName(tier: number): string {
    const tierNames = ['Experimental', 'Community', 'Verified', 'Enterprise'];
    return tierNames[tier] || 'Unknown';
  }

  /**
   * Calculate model ID for display (UI helper)
   */
  calculateModelIdSync(repo: string, filename: string): string {
    const input = `${repo}/${filename}`;
    return keccak256(toUtf8Bytes(input));
  }

  /**
   * Ensure manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new ModelRegistryError(
        'ModelManager not initialized. Call initialize() first.',
        this.modelRegistry?.address
      );
    }
  }

  /**
   * Get contract address
   */
  getContractAddress(): string {
    return this.modelRegistry.address;
  }

  /**
   * Check if a model ID is valid format
   */
  isValidModelId(modelId: string): boolean {
    // Model ID should be a 66-character hex string (0x + 64 hex chars)
    return /^0x[a-fA-F0-9]{64}$/.test(modelId);
  }
}