// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Environment configuration
 *
 * In production, these values should be loaded from environment variables.
 * For now, using the current contract addresses from .env.test as defaults.
 *
 * To override in your application:
 * 1. Set environment variables before importing the SDK
 * 2. Or use a bundler that injects these at build time
 */

export interface EnvironmentConfig {
  contracts: {
    jobMarketplace: string;
    nodeRegistry: string;
    proofSystem: string;
    hostEarnings: string;
    modelRegistry: string;
    usdcToken: string;
    fabToken: string;
  };
  entryPoint: string;
  chainId: number;
  rpcUrl: string;
}

/**
 * Get environment configuration for Base Sepolia
 */
export function getBaseSepolia(): EnvironmentConfig {
  // Check if running in Node.js environment with process.env
  const hasProcessEnv = typeof process !== 'undefined' && process.env;

  const config = {
    contracts: {
      // Contract addresses from environment variables - NO FALLBACKS
      jobMarketplace: (hasProcessEnv && process.env.CONTRACT_JOB_MARKETPLACE) ||
        (hasProcessEnv && process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE) ||
        (() => { throw new Error('CONTRACT_JOB_MARKETPLACE environment variable not set'); })(),
      nodeRegistry: (hasProcessEnv && process.env.CONTRACT_NODE_REGISTRY) ||
        (hasProcessEnv && process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY) ||
        (() => { throw new Error('CONTRACT_NODE_REGISTRY environment variable not set'); })(),
      proofSystem: (hasProcessEnv && process.env.CONTRACT_PROOF_SYSTEM) ||
        (hasProcessEnv && process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM) ||
        (() => { throw new Error('CONTRACT_PROOF_SYSTEM environment variable not set'); })(),
      hostEarnings: (hasProcessEnv && process.env.CONTRACT_HOST_EARNINGS) ||
        (hasProcessEnv && process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS) ||
        (() => { throw new Error('CONTRACT_HOST_EARNINGS environment variable not set'); })(),
      modelRegistry: (hasProcessEnv && process.env.CONTRACT_MODEL_REGISTRY) ||
        (hasProcessEnv && process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY) ||
        (() => { throw new Error('CONTRACT_MODEL_REGISTRY environment variable not set'); })(),
      usdcToken: (hasProcessEnv && process.env.CONTRACT_USDC_TOKEN) ||
        (hasProcessEnv && process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN) ||
        (() => { throw new Error('CONTRACT_USDC_TOKEN environment variable not set'); })(),
      fabToken: (hasProcessEnv && process.env.CONTRACT_FAB_TOKEN) ||
        (hasProcessEnv && process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN) ||
        (() => { throw new Error('CONTRACT_FAB_TOKEN environment variable not set'); })(),
    },
    // EntryPoint v0.6 - must be provided via environment variable
    entryPoint: (hasProcessEnv && process.env.ENTRY_POINT_ADDRESS) ||
      (hasProcessEnv && process.env.NEXT_PUBLIC_ENTRY_POINT_ADDRESS) ||
      (() => { throw new Error('ENTRY_POINT_ADDRESS environment variable not set'); })(),
    chainId: 84532,
    rpcUrl: (hasProcessEnv && process.env.RPC_URL_BASE_SEPOLIA) ||
      (hasProcessEnv && process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA) ||
      (() => { throw new Error('RPC_URL_BASE_SEPOLIA environment variable not set'); })()
  };

  return config;
}

/**
 * Get environment configuration for opBNB Testnet
 * All contracts must be configured via environment variables
 */
export function getOpBNBTestnet(): EnvironmentConfig {
  // Check if running in Node.js environment with process.env
  const hasProcessEnv = typeof process !== 'undefined' && process.env;

  return {
    contracts: {
      // All contracts must be configured via environment variables - NO FALLBACKS
      jobMarketplace: (hasProcessEnv && process.env.OPBNB_CONTRACT_JOB_MARKETPLACE) ||
        (hasProcessEnv && process.env.NEXT_PUBLIC_OPBNB_CONTRACT_JOB_MARKETPLACE) ||
        (() => { throw new Error('OPBNB_CONTRACT_JOB_MARKETPLACE environment variable not set'); })(),
      nodeRegistry: (hasProcessEnv && process.env.OPBNB_CONTRACT_NODE_REGISTRY) ||
        (hasProcessEnv && process.env.NEXT_PUBLIC_OPBNB_CONTRACT_NODE_REGISTRY) ||
        (() => { throw new Error('OPBNB_CONTRACT_NODE_REGISTRY environment variable not set'); })(),
      proofSystem: (hasProcessEnv && process.env.OPBNB_CONTRACT_PROOF_SYSTEM) ||
        (hasProcessEnv && process.env.NEXT_PUBLIC_OPBNB_CONTRACT_PROOF_SYSTEM) ||
        (() => { throw new Error('OPBNB_CONTRACT_PROOF_SYSTEM environment variable not set'); })(),
      hostEarnings: (hasProcessEnv && process.env.OPBNB_CONTRACT_HOST_EARNINGS) ||
        (hasProcessEnv && process.env.NEXT_PUBLIC_OPBNB_CONTRACT_HOST_EARNINGS) ||
        (() => { throw new Error('OPBNB_CONTRACT_HOST_EARNINGS environment variable not set'); })(),
      modelRegistry: (hasProcessEnv && process.env.OPBNB_CONTRACT_MODEL_REGISTRY) ||
        (hasProcessEnv && process.env.NEXT_PUBLIC_OPBNB_CONTRACT_MODEL_REGISTRY) ||
        (() => { throw new Error('OPBNB_CONTRACT_MODEL_REGISTRY environment variable not set'); })(),
      usdcToken: (hasProcessEnv && process.env.OPBNB_CONTRACT_USDC_TOKEN) ||
        (hasProcessEnv && process.env.NEXT_PUBLIC_OPBNB_CONTRACT_USDC_TOKEN) ||
        (() => { throw new Error('OPBNB_CONTRACT_USDC_TOKEN environment variable not set'); })(),
      fabToken: (hasProcessEnv && process.env.OPBNB_CONTRACT_FAB_TOKEN) ||
        (hasProcessEnv && process.env.NEXT_PUBLIC_OPBNB_CONTRACT_FAB_TOKEN) ||
        (() => { throw new Error('OPBNB_CONTRACT_FAB_TOKEN environment variable not set'); })(),
    },
    // EntryPoint must be configured via environment variable
    entryPoint: (hasProcessEnv && process.env.OPBNB_ENTRY_POINT_ADDRESS) ||
      (hasProcessEnv && process.env.NEXT_PUBLIC_OPBNB_ENTRY_POINT_ADDRESS) ||
      (() => { throw new Error('OPBNB_ENTRY_POINT_ADDRESS environment variable not set'); })(),
    chainId: 5611,
    rpcUrl: (hasProcessEnv && process.env.RPC_URL_OPBNB_TESTNET) ||
      (hasProcessEnv && process.env.NEXT_PUBLIC_RPC_URL_OPBNB_TESTNET) ||
      'https://opbnb-testnet-rpc.bnbchain.org'
  };
}

/**
 * Validate that contract addresses are set
 */
export function validateConfiguration(config: EnvironmentConfig): boolean {
  const required = [
    'jobMarketplace',
    'nodeRegistry',
    'proofSystem',
    'hostEarnings',
    'modelRegistry',
    'usdcToken',
    'fabToken'
  ];

  const contracts = config.contracts as any;
  const missing = required.filter(key => !contracts[key] || contracts[key] === '');

  if (missing.length > 0) {
    console.warn(`Missing contract addresses: ${missing.join(', ')}`);
    return false;
  }

  return true;
}