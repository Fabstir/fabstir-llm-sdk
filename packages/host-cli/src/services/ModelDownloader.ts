// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * ModelDownloader
 * Downloads model files from HuggingFace with progress bar and SHA256 verification
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { homedir } from 'os';
import { fetchModelHash } from './ModelRegistryClient.js';

// Default download directory
const DEFAULT_MODELS_DIR = path.join(homedir(), 'fabstir-node', 'models');

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
  speed: number; // bytes per second
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
  hashVerified?: boolean;
}

/**
 * Formats bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Creates a progress bar string
 */
function createProgressBar(percent: number, width: number = 40): string {
  const filled = Math.round(width * percent / 100);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Downloads a file from URL with progress callback
 * @param hfToken Optional HuggingFace token for authenticated downloads
 */
async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (progress: DownloadProgress) => void,
  hfToken?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {} as Record<string, string>,
    };

    // Add HuggingFace token if provided
    if (hfToken) {
      (options.headers as Record<string, string>)['Authorization'] = `Bearer ${hfToken}`;
    }

    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(options, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, destPath, onProgress, hfToken).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;
      let startTime = Date.now();

      // Ensure directory exists
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const fileStream = fs.createWriteStream(destPath);

      response.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;

        if (onProgress && totalSize > 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = downloadedSize / elapsed;

          onProgress({
            downloaded: downloadedSize,
            total: totalSize,
            percent: (downloadedSize / totalSize) * 100,
            speed,
          });
        }
      });

      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {}); // Delete partial file
        reject(err);
      });
    });

    request.on('error', (err) => {
      reject(err);
    });

    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Connection timeout'));
    });
  });
}

/**
 * Computes SHA256 hash of a file using streaming
 */
async function computeFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve('0x' + hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Verifies a downloaded file against the on-chain hash
 */
export async function verifyModelFile(
  filePath: string,
  modelId: string,
  rpcUrl: string
): Promise<{ verified: boolean; expectedHash?: string; actualHash?: string; error?: string }> {
  try {
    // Get expected hash from contract
    const expectedHash = await fetchModelHash(rpcUrl, modelId);

    if (!expectedHash || expectedHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      return {
        verified: true,
        error: 'No hash stored on-chain (skipped verification)',
      };
    }

    // Compute actual hash
    const actualHash = await computeFileHash(filePath);

    // Compare
    const verified = actualHash.toLowerCase() === expectedHash.toLowerCase();

    return {
      verified,
      expectedHash,
      actualHash,
      error: verified ? undefined : 'Hash mismatch',
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    return {
      verified: false,
      error: `Verification failed: ${errMsg}`,
    };
  }
}

/**
 * Downloads a model file from HuggingFace
 */
export async function downloadModel(
  downloadUrl: string,
  fileName: string,
  modelId: string,
  rpcUrl: string,
  options: {
    outputDir?: string;
    onProgress?: (progress: DownloadProgress) => void;
    onStatus?: (status: string) => void;
    skipVerification?: boolean;
    hfToken?: string;
  } = {}
): Promise<DownloadResult> {
  const outputDir = options.outputDir || DEFAULT_MODELS_DIR;
  const destPath = path.join(outputDir, fileName);
  const hfToken = options.hfToken || process.env.HF_TOKEN || process.env.HUGGING_FACE_TOKEN;

  try {
    // Check if file already exists
    if (fs.existsSync(destPath)) {
      options.onStatus?.(`File already exists: ${destPath}`);

      // Verify existing file
      if (!options.skipVerification) {
        options.onStatus?.('Verifying existing file...');
        const verification = await verifyModelFile(destPath, modelId, rpcUrl);

        if (verification.verified) {
          options.onStatus?.('Existing file verified');
          return {
            success: true,
            filePath: destPath,
            hashVerified: true,
          };
        } else {
          options.onStatus?.('Existing file failed verification, re-downloading...');
          fs.unlinkSync(destPath);
        }
      } else {
        return {
          success: true,
          filePath: destPath,
          hashVerified: false,
        };
      }
    }

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Download file
    options.onStatus?.(`Downloading to ${destPath}...`);
    await downloadFile(downloadUrl, destPath, options.onProgress, hfToken);

    // Verify downloaded file
    if (!options.skipVerification) {
      options.onStatus?.('Verifying SHA256 hash...');
      const verification = await verifyModelFile(destPath, modelId, rpcUrl);

      if (!verification.verified && verification.error !== 'No hash stored on-chain (skipped verification)') {
        // Delete corrupted file
        fs.unlinkSync(destPath);
        return {
          success: false,
          error: verification.error || 'Hash verification failed',
          hashVerified: false,
        };
      }

      return {
        success: true,
        filePath: destPath,
        hashVerified: verification.verified,
      };
    }

    return {
      success: true,
      filePath: destPath,
      hashVerified: false,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';

    // Clean up partial download
    if (fs.existsSync(destPath)) {
      try {
        fs.unlinkSync(destPath);
      } catch {}
    }

    return {
      success: false,
      error: errMsg,
    };
  }
}

/**
 * Gets the default models directory
 */
export function getModelsDirectory(): string {
  return DEFAULT_MODELS_DIR;
}

/**
 * Utility exports for CLI display
 */
export { formatBytes, createProgressBar };
