import { ethers } from 'ethers';
import { FabstirSDK } from '../../src/index.js';

/**
 * Creates a mock provider that works with the new SDK architecture
 */
export function createMockProvider() {
  // Create a mock provider with all necessary methods
  const provider = {
    getNetwork: async () => ({ 
      chainId: 84532,
      name: 'base-sepolia' 
    }),
    getSigner: function() {
      return createMockSigner();
    },
    // Add other provider methods that might be needed
    getBlockNumber: async () => 12345,
    getBalance: async () => ethers.parseEther("10"),
    call: async () => "0x",
    estimateGas: async () => BigInt(21000),
    getTransactionCount: async () => 0,
    getFeeData: async () => ({
      gasPrice: ethers.parseUnits("20", "gwei"),
      maxFeePerGas: ethers.parseUnits("25", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("2", "gwei")
    }),
    resolveName: async () => null,
    lookupAddress: async () => null
  };
  
  return provider as any;
}

/**
 * Creates a mock signer that works with the new SDK
 */
export function createMockSigner() {
  const mockAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1";
  
  const signer = {
    getAddress: async () => mockAddress,
    address: mockAddress,
    provider: createMockProvider(),
    signMessage: async (message: string) => "0xmocksignature",
    signTransaction: async (tx: any) => "0xmocksignedtx",
    sendTransaction: async (tx: any) => ({
      hash: "0xmockhash",
      wait: async () => ({
        status: 1,
        blockNumber: 12345,
        blockHash: "0xblockhash",
        transactionHash: "0xmockhash"
      })
    }),
    connect: function(provider: any) {
      this.provider = provider;
      return this;
    },
    getBalance: async () => ethers.parseEther("10"),
    getTransactionCount: async () => 0,
    estimateGas: async () => BigInt(21000),
    call: async () => "0x",
    resolveName: async () => null,
    getChainId: async () => 84532
  };
  
  // Prevent circular reference in provider.getSigner()
  Object.defineProperty(signer, 'provider', {
    value: {
      getNetwork: async () => ({ chainId: 84532, name: 'base-sepolia' }),
      getSigner: () => signer,
      getBlockNumber: async () => 12345,
      getBalance: async () => ethers.parseEther("10"),
      call: async () => "0x",
      estimateGas: async () => BigInt(21000),
      getTransactionCount: async () => 0,
      getFeeData: async () => ({
        gasPrice: ethers.parseUnits("20", "gwei"),
        maxFeePerGas: ethers.parseUnits("25", "gwei"),
        maxPriorityFeePerGas: ethers.parseUnits("2", "gwei")
      })
    },
    writable: true
  });
  
  return signer as any;
}

/**
 * Sets up a test SDK with proper configuration
 */
export async function setupTestSDK(config: any = {}) {
  const sdk = new FabstirSDK({
    mode: 'mock',
    debug: false,
    ...config
  });
  
  // For tests that need a provider/signer
  if (!config.skipConnect && config.mode !== 'mock') {
    const provider = createMockProvider();
    await sdk.connect(provider);
  }
  
  return sdk;
}

/**
 * Creates a mock transaction response
 */
export function createMockTransaction() {
  return {
    hash: "0x" + "a".repeat(64),
    wait: async () => ({
      status: 1,
      blockNumber: 12345,
      blockHash: "0x" + "b".repeat(64),
      transactionHash: "0x" + "a".repeat(64),
      logs: [],
      gasUsed: BigInt(21000),
      effectiveGasPrice: ethers.parseUnits("20", "gwei")
    }),
    from: "0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1",
    to: "0x1234567890123456789012345678901234567890",
    value: BigInt(0),
    nonce: 0,
    gasLimit: BigInt(21000),
    gasPrice: ethers.parseUnits("20", "gwei"),
    data: "0x",
    chainId: 84532
  };
}

/**
 * Mock job response for testing
 */
export function createMockJobResponse() {
  return {
    jobId: Math.floor(Math.random() * 1000000),
    status: 'POSTED',
    modelId: 'gpt-4',
    prompt: 'test prompt',
    maxTokens: 100,
    timestamp: Date.now()
  };
}