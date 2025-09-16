/**
 * SDK Configuration
 * Creates configuration for FabstirSDKCore from environment variables
 * Matches the structure from chat-context-demo.tsx
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
}

/**
 * Create SDK configuration from environment variables
 */
export function createSDKConfig(network: 'base-mainnet' | 'base-sepolia'): SDKConfig {
  // Validate required environment variables
  const requiredVars = [
    'CONTRACT_JOB_MARKETPLACE',
    'CONTRACT_NODE_REGISTRY',
    'CONTRACT_PROOF_SYSTEM',
    'CONTRACT_HOST_EARNINGS',
    'CONTRACT_FAB_TOKEN',
    'CONTRACT_USDC_TOKEN'
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  }

  // Model Registry is optional but we should check for it
  const modelRegistry = process.env.CONTRACT_MODEL_REGISTRY || process.env.CONTRACT_JOB_MARKETPLACE;

  // Get RPC URL based on network
  const rpcUrl = network === 'base-mainnet'
    ? process.env.RPC_URL_BASE_MAINNET
    : process.env.RPC_URL_BASE_SEPOLIA;

  if (!rpcUrl) {
    throw new Error(`Missing RPC URL for network: ${network}`);
  }

  // Get chain ID based on network
  const chainId = network === 'base-mainnet' ? 8453 : 84532; // Base mainnet: 8453, Base Sepolia: 84532

  // Get S5 configuration
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
      modelRegistry: modelRegistry!
    },
    s5Config: {
      portalUrl: s5PortalUrl,
      seedPhrase: process.env.S5_SEED_PHRASE
    },
    mode: 'production'
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