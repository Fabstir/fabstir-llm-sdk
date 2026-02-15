/**
 * @fileoverview Image generation types for SDK integration
 *
 * Types for host-side image generation functionality.
 * Supports diffusion model image generation with safety and billing.
 */

// ============= Image Size Constants =============

export const ALLOWED_IMAGE_SIZES = [
  '256x256',
  '512x512',
  '768x768',
  '1024x1024',
  '1024x768',
  '768x1024',
] as const;

export type ImageSize = (typeof ALLOWED_IMAGE_SIZES)[number];

export const MAX_PROMPT_LENGTH = 2000;

// ============= Safety & Error Types =============

export type SafetyLevel = 'strict' | 'moderate' | 'permissive';

export type ImageGenerationErrorCode =
  | 'RATE_LIMIT_EXCEEDED'
  | 'VALIDATION_FAILED'
  | 'PROMPT_BLOCKED'
  | 'DIFFUSION_SERVICE_UNAVAILABLE'
  | 'IMAGE_GENERATION_FAILED'
  | 'ENCRYPTION_FAILED';

// ============= Options =============

export interface ImageGenerationOptions {
  model?: string;
  size?: ImageSize;
  steps?: number;
  seed?: number;
  negativePrompt?: string;
  guidanceScale?: number;
  safetyLevel?: SafetyLevel;
  chainId?: number;
}

// ============= Result Types =============

export interface SafetyInfo {
  promptSafe: boolean;
  outputSafe: boolean;
  safetyLevel: SafetyLevel;
}

export interface BillingInfo {
  generationUnits: number;
  modelMultiplier: number;
  megapixels: number;
  steps: number;
}

export interface ImageGenerationResult {
  image: string;
  model: string;
  size: string;
  steps: number;
  seed: number;
  processingTimeMs: number;
  safety: SafetyInfo;
  billing: BillingInfo;
  provider: string;
  chainId: number;
  chainName: string;
  nativeToken: string;
}

// ============= Host Capability Types =============

export interface ImageGenerationCapabilities {
  supportsImageGeneration: boolean;
  supportsEncryptedWebSocket: boolean;
  supportsHttp: boolean;
  hasSafetyClassifier: boolean;
  hasOutputClassifier: boolean;
  hasBilling: boolean;
  hasContentHashes: boolean;
}

// ============= Type Guards =============

export function isValidImageSize(size: string): size is ImageSize {
  return (ALLOWED_IMAGE_SIZES as readonly string[]).includes(size);
}
