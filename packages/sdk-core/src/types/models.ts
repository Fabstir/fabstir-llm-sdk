/**
 * Model-related type definitions for the Fabstir SDK
 */

// BigNumber import removed - using bigint instead

/**
 * Represents an approved model specification
 */
export interface ModelSpec {
  repo: string;           // HuggingFace repository
  file: string;          // Model filename
  sha256?: string;       // Expected SHA-256 hash
}

/**
 * Complete model information from the registry
 */
export interface ModelInfo {
  modelId: string;                // Keccak256 hash of repo/file
  huggingfaceRepo: string;       // HuggingFace repository
  fileName: string;              // Model filename
  sha256Hash: string;            // SHA-256 hash of model file
  approvalTier: number;          // 0=Experimental, 1=Community, 2=Verified, 3=Enterprise
  active: boolean;               // Is model currently active
  timestamp: number;             // When model was added
}

/**
 * Host metadata in JSON format
 */
export interface HostMetadata {
  hardware: {
    gpu: string;                 // GPU model (e.g., "RTX 4090")
    vram: number;               // VRAM in GB
    ram: number;                // System RAM in GB
  };
  capabilities: string[];       // ["inference", "streaming", "batch"]
  location: string;            // Geographic location
  maxConcurrent: number;       // Max concurrent requests
  costPerToken: number;        // Cost per token in wei
  stakeAmount?: string;        // Stake amount in wei
}

/**
 * Host information including model support and pricing
 */
export interface HostInfo {
  address: string;                  // Ethereum address
  apiUrl: string;                  // API endpoint
  metadata: HostMetadata;          // Host metadata
  supportedModels: string[];       // Array of model IDs
  isActive: boolean;               // Is host active
  stake: bigint;                   // Staked amount
  minPricePerTokenNative: bigint;  // Minimum price per token in native token (ETH/BNB)
  minPricePerTokenStable: bigint;  // Minimum price per token in stablecoin (USDC)
  advertisedPrice?: bigint;        // Optional recommended price for UI display (deprecated)
}

/**
 * Model availability across the network
 */
export interface ModelAvailability {
  totalHosts: number;         // Total hosts supporting model
  activeHosts: number;        // Active hosts available
  averagePrice: number;       // Average cost per token
  locations: string[];        // Available locations
  minVRAM: number;           // Minimum VRAM available
  maxVRAM: number;           // Maximum VRAM available
}

/**
 * Job information for model inference
 */
export interface JobInfo {
  jobId: number;             // Blockchain job ID
  modelId: string;           // Model being used
  hostAddress: string;       // Selected host
  status: 'pending' | 'running' | 'completed' | 'failed';
  prompt: string;            // Input prompt
  maxTokens: number;         // Max tokens to generate
  result?: string;           // Inference result
  proofHash?: string;        // EZKL proof hash
}

/**
 * Model validation result
 */
export interface ModelValidation {
  isValid: boolean;          // Overall validation status
  modelId: string;           // Calculated model ID
  isApproved: boolean;       // Is model approved in registry
  hashMatch: boolean;        // Does file hash match expected
  errors: string[];          // Validation errors
}

/**
 * Model registry errors
 */
export enum ModelRegistryError {
  MODEL_NOT_APPROVED = 'MODEL_NOT_APPROVED',
  INVALID_MODEL_ID = 'INVALID_MODEL_ID',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  HASH_MISMATCH = 'HASH_MISMATCH',
  NO_HOSTS_AVAILABLE = 'NO_HOSTS_AVAILABLE',
  INSUFFICIENT_STAKE = 'INSUFFICIENT_STAKE',
  REGISTRATION_FAILED = 'REGISTRATION_FAILED',
  VALIDATION_FAILED = 'VALIDATION_FAILED'
}

/**
 * Model selection requirements
 */
export interface ModelRequirements {
  model: string;             // Model ID or name
  minVRAM?: number;         // Minimum VRAM required
  maxCostPerToken?: number; // Maximum acceptable cost
  location?: string;        // Preferred location
  minStake?: string;       // Minimum host stake
}