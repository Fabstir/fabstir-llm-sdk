/**
 * Registration validation utilities
 * Pre-flight checks before registration
 *
 * Sub-phase 4.2: Registration Validation
 */

import * as net from 'net';
import { getProcessManager } from '../process/manager';

/**
 * Validation result structure
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate public URL format (Sub-phase 4.2)
 */
export function validatePublicUrl(url: string): ValidationResult {
  try {
    const parsed = new URL(url);

    // Check protocol
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'URL must use http or https' };
    }

    // Check port is specified (parsed.port is empty if default port used)
    // We need to check if port is in the original URL or if it's a default port
    const hasExplicitPort = parsed.port !== '';
    const hasDefaultPort = (parsed.protocol === 'http:' && url.includes(':80')) ||
                           (parsed.protocol === 'https:' && url.includes(':443'));

    if (!hasExplicitPort && !hasDefaultPort) {
      return { valid: false, error: 'URL must include explicit port number' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Check if fabstir-llm-node binary is available (Sub-phase 4.2)
 */
export async function checkBinaryAvailable(): Promise<boolean> {
  try {
    const manager = getProcessManager();
    const path = await (manager as any).getExecutablePath();
    return path !== null;
  } catch {
    return false;
  }
}

/**
 * Check if port is available (Sub-phase 4.2)
 */
export async function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port);
  });
}

/**
 * Validate model format (Sub-phase 4.2)
 * Expected format: "repo/name:file.gguf"
 */
export function validateModels(models: string[]): ValidationResult {
  // Check if array is not empty
  if (!models || models.length === 0) {
    return { valid: false, error: 'At least one model is required' };
  }

  // Validate each model
  for (const model of models) {
    // Check if empty
    if (!model || model.trim() === '') {
      return { valid: false, error: 'Model name cannot be empty' };
    }

    // Check for colon separator
    const parts = model.split(':');
    if (parts.length !== 2) {
      return { valid: false, error: `Invalid model format: ${model}. Expected "repo:file" format` };
    }

    const [repo, file] = parts;

    // Validate repo and file are not empty
    if (!repo || !file) {
      return { valid: false, error: `Invalid model format: ${model}. Both repo and file must be specified` };
    }

    // Validate characters (alphanumeric, hyphens, underscores, slashes, dots)
    const validPattern = /^[a-zA-Z0-9\-_\/\.]+$/;
    if (!validPattern.test(repo) || !validPattern.test(file)) {
      return { valid: false, error: `Invalid model format: ${model}. Contains invalid characters` };
    }
  }

  return { valid: true };
}
