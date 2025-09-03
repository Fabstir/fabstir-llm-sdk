import { FabstirSDK, FabstirConfig } from '../../../src/index';
import { ethers } from 'ethers';

/**
 * Creates a real SDK configuration for Base Sepolia network
 * Loads all configuration from environment variables
 */
export function createRealSDKConfig(): FabstirConfig {
  // Ensure environment variables are loaded
  if (!process.env.RPC_URL_BASE_SEPOLIA) {
    throw new Error('RPC_URL_BASE_SEPOLIA not set in environment');
  }

  const config: FabstirConfig = {
    mode: 'production',
    network: 'base-sepolia',
    rpcUrl: process.env.RPC_URL_BASE_SEPOLIA,
    debug: process.env.DEBUG === 'true',
    
    // Real contract addresses from .env.test
    contractAddresses: {
      jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE!,
      paymentEscrow: process.env.CONTRACT_PAYMENT_ESCROW!,
      nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!,
    },
    
    // P2P configuration for real network
    p2pConfig: {
      bootstrapNodes: [
        '/ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRQVMgktfPx1KeLhHhtMdBBJwPDjyTX3aPbQCCszqfMUV'
      ],
      listenAddresses: [],
      protocols: ['/fabstir/1.0.0'],
      dhtProtocol: '/fabstir/kad/1.0.0',
      streamProtocol: '/fabstir/stream/1.0.0',
      discoveryInterval: 30000,
      connectionTimeout: 10000,
    },
    
    
    // Node discovery settings
    nodeDiscovery: {
      method: 'dht',
      maxNodes: 10,
      minReliability: 80,
      refreshInterval: 60000,
    },
    
    // Error recovery options
    retryOptions: {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
    },
    
    // Performance tracking
    enablePerformanceTracking: true,
    enableJobRecovery: true,
    nodeBlacklistDuration: 300000, // 5 minutes
    reliabilityThreshold: 0.8,
  };
  
  return config;
}

/**
 * Initializes the SDK with real Base Sepolia connection
 * Creates provider, connects wallet, and initializes contracts
 * @param useProductionMode - Use production mode (requires P2P) or mock mode
 */
export async function initializeSDK(useProductionMode = false): Promise<FabstirSDK> {
  const config = createRealSDKConfig();
  
  // Use mock mode for faster tests without P2P
  if (!useProductionMode) {
    config.mode = 'mock';
  }
  
  const sdk = new FabstirSDK(config);
  
  // Create provider for Base Sepolia
  let provider: ethers.providers.Provider;
  
  if (process.env.TEST_USER_1_PRIVATE_KEY) {
    // Create provider with signer for production mode
    const jsonRpcProvider = new ethers.providers.JsonRpcProvider(
      config.rpcUrl,
      { chainId: 84532, name: 'base-sepolia' }
    );
    const wallet = new ethers.Wallet(
      process.env.TEST_USER_1_PRIVATE_KEY,
      jsonRpcProvider
    );
    provider = wallet.provider!;
  } else {
    // Create provider without signer (read-only)
    provider = new ethers.providers.JsonRpcProvider(
      config.rpcUrl,
      { chainId: 84532, name: 'base-sepolia' }
    );
  }
  
  // Connect SDK to provider
  await sdk.connect(provider);
  
  return sdk;
}

// Export additional config utilities
export const S5_PORTAL = 'https://s5.cx';
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const CONTRACT_ADDRESSES = {
  jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE!,
  nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!,  
  paymentEscrow: process.env.CONTRACT_PAYMENT_ESCROW!,
  fabToken: process.env.CONTRACT_FAB_TOKEN!,
  usdcToken: process.env.CONTRACT_USDC_TOKEN!,
};