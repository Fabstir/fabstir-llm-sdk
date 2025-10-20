// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Secrets Management
 * Handles private keys without native dependencies (no keytar)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import inquirer from 'inquirer';

/**
 * Get private key from various sources
 * Priority order:
 * 1. Environment variable (for CI/CD and Docker)
 * 2. File on disk (for local development)
 * 3. Interactive prompt (fallback)
 */
export async function getPrivateKey(): Promise<string> {
  // 1. Check environment variable (best for CI/CD)
  if (process.env.FABSTIR_HOST_PRIVATE_KEY) {
    return process.env.FABSTIR_HOST_PRIVATE_KEY;
  }

  // For testing, use test private key
  if (process.env.NODE_ENV === 'test' && process.env.TEST_HOST_1_PRIVATE_KEY) {
    return process.env.TEST_HOST_1_PRIVATE_KEY;
  }

  // 2. Check file on disk
  const keyFilePath = getKeyFilePath();
  if (fs.existsSync(keyFilePath)) {
    const key = fs.readFileSync(keyFilePath, 'utf-8').trim();
    if (key) {
      return key;
    }
  }

  // 3. Interactive prompt as last resort
  const answer = await inquirer.prompt([{
    type: 'password',
    name: 'privateKey',
    message: 'Enter your private key:',
    mask: '*',
    validate: (input: string) => {
      if (!input) return 'Private key is required';
      if (!isValidPrivateKey(input)) return 'Invalid private key format';
      return true;
    }
  }]);

  return answer.privateKey;
}

/**
 * Save private key to file (for development convenience)
 */
export async function savePrivateKey(privateKey: string): Promise<void> {
  const keyFilePath = getKeyFilePath();
  const dir = path.dirname(keyFilePath);

  // Create directory if it doesn't exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write key with restricted permissions
  fs.writeFileSync(keyFilePath, privateKey, {
    encoding: 'utf-8',
    mode: 0o600 // Read/write for owner only
  });
}

/**
 * Delete stored private key
 */
export async function deletePrivateKey(): Promise<void> {
  const keyFilePath = getKeyFilePath();
  if (fs.existsSync(keyFilePath)) {
    fs.unlinkSync(keyFilePath);
  }
}

/**
 * Check if private key is available
 */
export function hasPrivateKey(): boolean {
  if (process.env.FABSTIR_HOST_PRIVATE_KEY) {
    return true;
  }

  if (process.env.NODE_ENV === 'test' && process.env.TEST_HOST_1_PRIVATE_KEY) {
    return true;
  }

  const keyFilePath = getKeyFilePath();
  return fs.existsSync(keyFilePath);
}

/**
 * Get the path where private key is stored
 */
function getKeyFilePath(): string {
  return path.join(os.homedir(), '.fabstir', 'host-key');
}

/**
 * Validate private key format
 */
function isValidPrivateKey(key: string): boolean {
  // Check if it's a valid hex string (with or without 0x prefix)
  const cleanKey = key.startsWith('0x') ? key.slice(2) : key;
  return /^[a-fA-F0-9]{64}$/.test(cleanKey);
}