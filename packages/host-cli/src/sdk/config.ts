// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * SDK Configuration
 * Creates configuration for FabstirSDKCore
 * All contract addresses MUST be provided via environment variables
 */

export interface SDKConfig {
  chainId: number;
  rpcUrl: string;
  contractAddresses: {
    jobMarketplace: string;
    nodeRegistry: string;
    proofSystem: string;
    hostEarnings: string;
    fabToken: string;
    usdcToken: string;
    modelRegistry: string;
  };
  s5Config?: {
    portalUrl?: string;
    seedPhrase?: string;
  };
  mode?: 'production' | 'development';
  // Host-only mode: Skip S5/Storage/Session initialization
  hostOnly?: boolean;
}

/**
 * Required environment variables for Base Sepolia
 */
const REQUIRED_ENV_VARS = [
  'CONTRACT_JOB_MARKETPLACE',
  'CONTRACT_NODE_REGISTRY',
  'CONTRACT_PROOF_SYSTEM',
  'CONTRACT_HOST_EARNINGS',
  'CONTRACT_FAB_TOKEN',
  'CONTRACT_USDC_TOKEN',
  'CONTRACT_MODEL_REGISTRY',
];

/**
 * Create SDK configuration from environment variables
 * All contract addresses MUST be set - no fallbacks allowed
 */
export function createSDKConfig(network: 'base-mainnet' | 'base-sepolia'): SDKConfig {
  // Get chain ID based on network
  const chainId = network === 'base-mainnet' ? 8453 : 84532;

  // Validate all required environment variables are set
  const missing: string[] = [];
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n` +
      missing.map(v => `  - ${v}`).join('\n') +
      `\n\nPlease set these in your environment or .env file.\n` +
      `See .env.test for current contract addresses.`
    );
  }

  // Get RPC URL
  const rpcUrlVar = network === 'base-mainnet' ? 'RPC_URL_BASE_MAINNET' : 'RPC_URL_BASE_SEPOLIA';
  const rpcUrl = process.env[rpcUrlVar];
  if (!rpcUrl) {
    throw new Error(`Missing required environment variable: ${rpcUrlVar}`);
  }

  const s5PortalUrl = process.env.S5_PORTAL_URL || 'https://s5.cx';

  return {
    chainId,
    rpcUrl,
    contractAddresses: {
      jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE!,
      nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!,
      proofSystem: process.env.CONTRACT_PROOF_SYSTEM!,
      hostEarnings: process.env.CONTRACT_HOST_EARNINGS!,
      fabToken: process.env.CONTRACT_FAB_TOKEN!,
      usdcToken: process.env.CONTRACT_USDC_TOKEN!,
      modelRegistry: process.env.CONTRACT_MODEL_REGISTRY!,
    },
    s5Config: {
      portalUrl: s5PortalUrl,
      seedPhrase: process.env.S5_SEED_PHRASE
    },
    mode: 'production',
    // Host-only mode: Skip S5/Storage/Session initialization (not needed for host operations)
    hostOnly: true
  };
}

/**
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate all contract addresses in config
 */
export function validateConfig(config: SDKConfig): void {
  const addresses = config.contractAddresses;

  if (!isValidAddress(addresses.jobMarketplace)) {
    throw new Error(`Invalid JobMarketplace address: ${addresses.jobMarketplace}`);
  }

  if (!isValidAddress(addresses.nodeRegistry)) {
    throw new Error(`Invalid NodeRegistry address: ${addresses.nodeRegistry}`);
  }

  if (!isValidAddress(addresses.fabToken)) {
    throw new Error(`Invalid FAB token address: ${addresses.fabToken}`);
  }

  if (!isValidAddress(addresses.usdcToken)) {
    throw new Error(`Invalid USDC token address: ${addresses.usdcToken}`);
  }
}
