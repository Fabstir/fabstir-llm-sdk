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

  return {
    contracts: {
      // Latest contract addresses from .env.test (2025-09-02 deployment)
      jobMarketplace: (hasProcessEnv && process.env.CONTRACT_JOB_MARKETPLACE) ||
        '0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944',
      nodeRegistry: (hasProcessEnv && process.env.CONTRACT_NODE_REGISTRY) ||
        '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
      proofSystem: (hasProcessEnv && process.env.CONTRACT_PROOF_SYSTEM) ||
        '0x2ACcc60893872A499700908889B38C5420CBcFD1',
      hostEarnings: (hasProcessEnv && process.env.CONTRACT_HOST_EARNINGS) ||
        '0x908962e8c6CE72610021586f85ebDE09aAc97776',
      modelRegistry: (hasProcessEnv && process.env.CONTRACT_MODEL_REGISTRY) ||
        '0x92b2De840bB2171203011A6dBA928d855cA8183E',
      usdcToken: (hasProcessEnv && process.env.CONTRACT_USDC_TOKEN) ||
        '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      fabToken: (hasProcessEnv && process.env.CONTRACT_FAB_TOKEN) ||
        '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
    },
    // EntryPoint v0.6 for Base Sepolia (standard across all chains)
    entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    chainId: 84532,
    rpcUrl: (hasProcessEnv && process.env.RPC_URL_BASE_SEPOLIA) ||
      'https://sepolia.base.org'
  };
}

/**
 * Get environment configuration for opBNB Testnet
 * Note: Placeholder values until contracts are deployed
 */
export function getOpBNBTestnet(): EnvironmentConfig {
  return {
    contracts: {
      // To be deployed - using placeholder addresses for now
      jobMarketplace: '0x0000000000000000000000000000000000000001',
      nodeRegistry: '0x0000000000000000000000000000000000000002',
      proofSystem: '0x0000000000000000000000000000000000000003',
      hostEarnings: '0x0000000000000000000000000000000000000004',
      modelRegistry: '0x0000000000000000000000000000000000000005',
      usdcToken: '0x0000000000000000000000000000000000000006',
      fabToken: '0x0000000000000000000000000000000000000007',
    },
    // Standard EntryPoint v0.6 (same across chains)
    entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    chainId: 5611,
    rpcUrl: 'https://opbnb-testnet-rpc.bnbchain.org'
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