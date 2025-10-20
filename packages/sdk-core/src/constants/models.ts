// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Model constants and approved models list
 */

import { ModelSpec } from '../types/models';

/**
 * Currently approved models in the ModelRegistry
 * These are the only models that can be registered and used
 */
export const APPROVED_MODELS: Record<string, ModelSpec> = {
  TINY_VICUNA: {
    repo: "CohereForAI/TinyVicuna-1B-32k-GGUF",
    file: "tiny-vicuna-1b.q4_k_m.gguf",
    sha256: "329d002bc20d4e7baae25df802c9678b5a4340b3ce91f23e6a0644975e95935f"
  },
  TINY_LLAMA: {
    repo: "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF",
    file: "tinyllama-1b.Q4_K_M.gguf",
    sha256: "45b71fe98efe5f530b825dce6f5049d738e9c16869f10be4370ab81a9912d4a6"
  }
};

/**
 * Model approval tiers
 */
export enum ModelApprovalTier {
  EXPERIMENTAL = 0,    // Testing phase
  COMMUNITY = 1,       // Community validated
  VERIFIED = 2,        // Team verified
  ENTERPRISE = 3       // Enterprise grade
}

/**
 * Default model configuration
 */
export const DEFAULT_MODEL_CONFIG = {
  defaultModel: APPROVED_MODELS.TINY_VICUNA,
  cacheTimeout: 300000,  // 5 minutes cache for model info
  maxRetries: 3,         // Max retries for model validation
  validationTimeout: 30000 // 30 seconds for hash validation
};

/**
 * Model registry contract configuration
 */
export const MODEL_REGISTRY_CONFIG = {
  // Approval threshold for governance proposals
  approvalThreshold: 100000, // 100k FAB tokens
  // Proposal duration in seconds
  proposalDuration: 604800,  // 7 days
  // Minimum stake for hosts
  minHostStake: '1000',      // 1000 FAB tokens
};

/**
 * Get model display name
 */
export function getModelDisplayName(modelSpec: ModelSpec): string {
  const modelName = modelSpec.file.replace('.gguf', '').replace('.q4_k_m', '');
  return modelName.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

/**
 * Check if a model is in the approved list
 */
export function isModelInApprovedList(repo: string, file: string): boolean {
  return Object.values(APPROVED_MODELS).some(model =>
    model.repo === repo && model.file === file
  );
}

/**
 * Get approved model by name
 */
export function getApprovedModel(name: keyof typeof APPROVED_MODELS): ModelSpec | undefined {
  return APPROVED_MODELS[name];
}