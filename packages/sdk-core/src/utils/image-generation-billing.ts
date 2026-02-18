/**
 * @fileoverview Billing helpers for image generation
 *
 * Pure functions for estimating image generation cost.
 * Formula: generationUnits = (width * height / 1_048_576) * (steps / 20) * modelMultiplier
 */

/**
 * Parse a size string like '1024x768' into width and height.
 */
export function parseSize(sizeStr: string): { width: number; height: number } {
  const parts = sizeStr.split('x');
  if (parts.length !== 2) {
    throw new Error(`Invalid size format: "${sizeStr}". Expected "WIDTHxHEIGHT".`);
  }
  const width = parseInt(parts[0], 10);
  const height = parseInt(parts[1], 10);
  if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid size dimensions in "${sizeStr}". Both width and height must be positive integers.`);
  }
  return { width, height };
}

/**
 * Estimate generation units for billing.
 *
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param steps - Number of diffusion steps
 * @param modelMultiplier - Model cost multiplier (default 1.0)
 * @returns Generation units (billing metric)
 */
export function estimateGenerationUnits(
  width: number,
  height: number,
  steps: number,
  modelMultiplier: number = 1.0
): number {
  return (width * height / 1_048_576) * (steps / 20) * modelMultiplier;
}
