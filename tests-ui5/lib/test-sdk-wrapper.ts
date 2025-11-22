import { TestWalletProvider } from './test-wallet-provider';
import type { Signer } from 'ethers';

/**
 * Test SDK wrapper that initializes UI5SDK with test wallet
 *
 * Note: This doesn't directly instantiate FabstirSDKCore.
 * Instead, it provides utilities to inject test wallet into the browser,
 * allowing UI5's existing SDK initialization to work in test mode.
 */
export interface TestSDKConfig {
  testWallet: TestWalletProvider;
  rpcUrl: string;
  chainId: number;
  contractAddresses: {
    jobMarketplace: string;
    nodeRegistry: string;
    proofSystem: string;
    hostEarnings: string;
    modelRegistry: string;
    usdcToken: string;
    fabToken: string;
  };
}

export class TestSDKWrapper {
  private testWallet: TestWalletProvider;
  private config: TestSDKConfig;

  constructor(config: TestSDKConfig) {
    this.testWallet = config.testWallet;
    this.config = config;
  }

  /**
   * Get test wallet for injection into browser
   */
  getTestWallet(): TestWalletProvider {
    return this.testWallet;
  }

  /**
   * Get wallet data for browser injection
   */
  getWalletDataForInjection() {
    return {
      address: this.testWallet.getAddress(),
      chainId: this.testWallet.chainId,
      signer: this.testWallet.getSigner(),
      autoApprove: true,
    };
  }

  /**
   * Get contract addresses for verification
   */
  getContractAddresses() {
    return this.config.contractAddresses;
  }
}

/**
 * Create test SDK instance from environment variables
 */
export function createTestSDK(testWallet: TestWalletProvider): TestSDKWrapper {
  if (!process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA) {
    throw new Error('Missing NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA environment variable');
  }
  if (!process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE) {
    throw new Error('Missing contract addresses in environment variables');
  }

  return new TestSDKWrapper({
    testWallet,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA,
    chainId: 84532,
    contractAddresses: {
      jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE,
      nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY!,
      proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM!,
      hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS!,
      modelRegistry: process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY!,
      usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
      fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN!,
    },
  });
}
