// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

export interface TestConfig {
  wallet: {
    address: string;
    encryptedKey?: string;
  };
  network: {
    name: string;
    chainId: number;
    rpcUrl: string;
  };
  host: {
    port: number;
    publicUrl: string;
    models: string[];
    pricePerToken: string;
  };
  contracts: {
    jobMarketplace: string;
    nodeRegistry: string;
    proofSystem: string;
    hostEarnings: string;
    fabToken: string;
    usdcToken: string;
  };
}

/**
 * Create test configuration
 */
export function createTestConfig(overrides?: Partial<TestConfig>): TestConfig {
  const baseConfig: TestConfig = {
    wallet: {
      address: process.env.TEST_HOST_1_ADDRESS || '0x0000000000000000000000000000000000000000'
    },
    network: {
      name: 'base-sepolia',
      chainId: 84532,
      rpcUrl: process.env.RPC_URL_BASE_SEPOLIA || 'https://sepolia.base.org'
    },
    host: {
      port: 8080,
      publicUrl: 'http://localhost:8080',
      models: ['gpt-3.5-turbo', 'gpt-4'],
      pricePerToken: '0.0001'
    },
    contracts: {
      jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE || '',
      nodeRegistry: process.env.CONTRACT_NODE_REGISTRY || '',
      proofSystem: process.env.CONTRACT_PROOF_SYSTEM || '',
      hostEarnings: process.env.CONTRACT_HOST_EARNINGS || '',
      fabToken: process.env.CONTRACT_FAB_TOKEN || '',
      usdcToken: process.env.CONTRACT_USDC_TOKEN || ''
    }
  };

  return { ...baseConfig, ...overrides };
}

/**
 * Create temporary config directory for testing
 */
export async function createTempConfigDir(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fabstir-test-'));
  return tmpDir;
}

/**
 * Clean up temporary config directory
 */
export async function cleanupTempConfigDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Failed to cleanup temp dir ${dir}:`, error);
  }
}

/**
 * Write config to file
 */
export async function writeTestConfig(dir: string, config: TestConfig): Promise<string> {
  const configPath = path.join(dir, 'config.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

/**
 * Create mock environment for testing
 */
export function createTestEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    FABSTIR_CONFIG_PATH: '',
    NODE_ENV: 'test'
  };
}