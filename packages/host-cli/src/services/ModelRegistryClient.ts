// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * ModelRegistryClient
 * Queries the ModelRegistry contract for approved models
 */

import { ethers } from 'ethers';

function getModelRegistryAddress(): string {
  const address = process.env.CONTRACT_MODEL_REGISTRY;
  if (!address) {
    throw new Error('CONTRACT_MODEL_REGISTRY environment variable is not set');
  }
  return address;
}

function getNodeRegistryAddress(): string {
  const address = process.env.CONTRACT_NODE_REGISTRY;
  if (!address) {
    throw new Error('CONTRACT_NODE_REGISTRY environment variable is not set');
  }
  return address;
}

// Minimal ABI for model queries
const MODEL_REGISTRY_ABI = [
  'function getAllModels() view returns (bytes32[])',
  'function getModel(bytes32 modelId) view returns (tuple(string huggingfaceRepo, string fileName, bytes32 sha256Hash, uint256 approvalTier, bool active, uint256 timestamp))',
  'function getModelHash(bytes32 modelId) view returns (bytes32)',
  'function getModelId(string repo, string fileName) pure returns (bytes32)',
  'function isModelApproved(bytes32 modelId) view returns (bool)',
];

export interface ModelInfo {
  modelId: string;
  huggingfaceRepo: string;
  fileName: string;
  sha256Hash: string;
  active: boolean;
  // Derived fields
  displayName: string;
  modelString: string;
  downloadUrl: string;
  repoUrl: string;
}

/**
 * Derives a display name from HuggingFace repo
 * e.g., "CohereForAI/TinyVicuna-1B-32k-GGUF" -> "TinyVicuna-1B-32k"
 */
function deriveDisplayName(repo: string): string {
  // Get the model name part (after the slash)
  const parts = repo.split('/');
  const modelPart = parts.length > 1 ? parts[1] : parts[0];

  // Remove common suffixes like -GGUF, -GGML, etc.
  return modelPart
    .replace(/-GGUF$/i, '')
    .replace(/-GGML$/i, '')
    .replace(/-AWQ$/i, '')
    .replace(/-GPTQ$/i, '');
}

/**
 * Constructs HuggingFace download URL
 */
function constructDownloadUrl(repo: string, fileName: string): string {
  return `https://huggingface.co/${repo}/resolve/main/${fileName}`;
}

/**
 * Constructs HuggingFace repository URL
 */
function constructRepoUrl(repo: string): string {
  return `https://huggingface.co/${repo}`;
}

/**
 * Fetches all approved models from the ModelRegistry contract
 */
export async function fetchAllModels(rpcUrl: string): Promise<ModelInfo[]> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(getModelRegistryAddress(), MODEL_REGISTRY_ABI, provider);

  // Get all model IDs
  const modelIds: string[] = await contract.getAllModels();

  const models: ModelInfo[] = [];

  for (const modelId of modelIds) {
    try {
      const model = await contract.getModel(modelId);

      // Only include active models
      if (!model.active) continue;

      const huggingfaceRepo = model.huggingfaceRepo;
      const fileName = model.fileName;

      models.push({
        modelId,
        huggingfaceRepo,
        fileName,
        sha256Hash: model.sha256Hash,
        active: model.active,
        displayName: deriveDisplayName(huggingfaceRepo),
        modelString: `${huggingfaceRepo}:${fileName}`,
        downloadUrl: constructDownloadUrl(huggingfaceRepo, fileName),
        repoUrl: constructRepoUrl(huggingfaceRepo),
      });
    } catch (err) {
      // Skip models that fail to fetch
      console.error(`Failed to fetch model ${modelId}:`, err);
    }
  }

  return models;
}

/**
 * Fetches a single model by ID
 */
export async function fetchModelById(rpcUrl: string, modelId: string): Promise<ModelInfo | null> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(getModelRegistryAddress(), MODEL_REGISTRY_ABI, provider);

  try {
    const model = await contract.getModel(modelId);

    if (!model.active) return null;

    const huggingfaceRepo = model.huggingfaceRepo;
    const fileName = model.fileName;

    return {
      modelId,
      huggingfaceRepo,
      fileName,
      sha256Hash: model.sha256Hash,
      active: model.active,
      displayName: deriveDisplayName(huggingfaceRepo),
      modelString: `${huggingfaceRepo}:${fileName}`,
      downloadUrl: constructDownloadUrl(huggingfaceRepo, fileName),
      repoUrl: constructRepoUrl(huggingfaceRepo),
    };
  } catch {
    return null;
  }
}

/**
 * Fetches the SHA256 hash for a model (for file verification)
 */
export async function fetchModelHash(rpcUrl: string, modelId: string): Promise<string | null> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(getModelRegistryAddress(), MODEL_REGISTRY_ABI, provider);

  try {
    return await contract.getModelHash(modelId);
  } catch {
    return null;
  }
}

/**
 * Checks if a model is approved
 */
export async function isModelApproved(rpcUrl: string, modelId: string): Promise<boolean> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(getModelRegistryAddress(), MODEL_REGISTRY_ABI, provider);

  try {
    return await contract.isModelApproved(modelId);
  } catch {
    return false;
  }
}

/**
 * Computes the model ID from repo and fileName
 */
export async function computeModelId(rpcUrl: string, repo: string, fileName: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(getModelRegistryAddress(), MODEL_REGISTRY_ABI, provider);

  return await contract.getModelId(repo, fileName);
}

/**
 * Validates a model string and checks if it's approved
 * @param modelString Format: "repo:fileName"
 * @returns Object with validation result and model info if valid
 */
export async function validateModelString(
  rpcUrl: string,
  modelString: string
): Promise<{ valid: boolean; modelId?: string; error?: string }> {
  // Parse model string
  const colonIndex = modelString.indexOf(':');
  if (colonIndex === -1) {
    return { valid: false, error: 'Invalid format. Expected "repo:fileName"' };
  }

  const repo = modelString.substring(0, colonIndex);
  const fileName = modelString.substring(colonIndex + 1);

  if (!repo || !fileName) {
    return { valid: false, error: 'Both repo and fileName are required' };
  }

  try {
    // Compute model ID
    const modelId = await computeModelId(rpcUrl, repo, fileName);

    // Check if approved
    const approved = await isModelApproved(rpcUrl, modelId);

    if (!approved) {
      return { valid: false, modelId, error: 'Model is not approved' };
    }

    return { valid: true, modelId };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    return { valid: false, error: `Validation failed: ${errMsg}` };
  }
}

// Minimal ABI for NodeRegistry model queries
const NODE_REGISTRY_MODELS_ABI = [
  'function getNodeModels(address nodeAddress) view returns (bytes32[])',
];

/**
 * Fetches only the models registered to a specific host from NodeRegistry,
 * then resolves each model ID to full ModelInfo via ModelRegistry.
 */
export async function fetchHostRegisteredModels(
  hostAddress: string,
  rpcUrl: string
): Promise<ModelInfo[]> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const nodeRegistry = new ethers.Contract(
    getNodeRegistryAddress(),
    NODE_REGISTRY_MODELS_ABI,
    provider
  );

  const modelIds: string[] = await nodeRegistry.getNodeModels(hostAddress);

  const models: ModelInfo[] = [];
  for (const modelId of modelIds) {
    const model = await fetchModelById(rpcUrl, modelId);
    if (model) {
      models.push(model);
    }
  }

  return models;
}
