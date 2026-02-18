/**
 * @fileoverview HTTP-based image generation utility
 *
 * Standalone function for generating images via host HTTP endpoint.
 * Used by SessionManager.generateImageHttp().
 */

import type { ImageGenerationOptions, ImageGenerationResult } from '../types/image-generation.types';
import { isValidImageSize, MAX_PROMPT_LENGTH } from '../types/image-generation.types';
import { ImageGenerationError } from '../errors/image-generation-errors';

/**
 * Generate an image via HTTP POST to host's /v1/images/generate endpoint.
 *
 * @param hostUrl - Base URL of the host
 * @param prompt - Text prompt for image generation
 * @param options - Optional generation parameters
 * @returns Parsed ImageGenerationResult
 */
export async function generateImageHttp(
  hostUrl: string,
  prompt: string,
  options?: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  // Client-side validation
  if (!prompt || prompt.length === 0) {
    throw new ImageGenerationError('Prompt cannot be empty', 'VALIDATION_FAILED');
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new ImageGenerationError(
      `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`,
      'VALIDATION_FAILED',
    );
  }
  if (options?.size && !isValidImageSize(options.size)) {
    throw new ImageGenerationError(
      `Invalid image size: ${options.size}`,
      'VALIDATION_FAILED',
    );
  }
  if (options?.steps !== undefined && (options.steps < 1 || options.steps > 100)) {
    throw new ImageGenerationError(
      'Steps must be between 1 and 100',
      'VALIDATION_FAILED',
    );
  }

  const body: Record<string, unknown> = {
    prompt,
    size: options?.size ?? '1024x1024',
  };
  if (options?.model) body.model = options.model;
  if (options?.steps !== undefined) body.steps = options.steps;
  if (options?.seed !== undefined) body.seed = options.seed;
  if (options?.negativePrompt) body.negativePrompt = options.negativePrompt;
  if (options?.guidanceScale !== undefined) body.guidanceScale = options.guidanceScale;
  if (options?.safetyLevel) body.safetyLevel = options.safetyLevel;

  const response = await fetch(`${hostUrl}/v1/images/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 400) {
      if (text.toLowerCase().includes('blocked')) {
        throw new ImageGenerationError(text, 'PROMPT_BLOCKED');
      }
      throw new ImageGenerationError(text, 'VALIDATION_FAILED');
    }
    if (response.status === 503) {
      throw new ImageGenerationError(text, 'DIFFUSION_SERVICE_UNAVAILABLE');
    }
    throw new ImageGenerationError(text, 'IMAGE_GENERATION_FAILED');
  }

  return (await response.json()) as ImageGenerationResult;
}
