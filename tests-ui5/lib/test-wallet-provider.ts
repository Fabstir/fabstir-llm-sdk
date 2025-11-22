import { ethers } from 'ethers';

export interface TestWalletConfig {
  privateKey: string;
  rpcUrl: string;
  chainId: number;
}

/**
 * Test wallet provider that auto-approves all transactions
 * Uses TEST_USER_1_PRIVATE_KEY from .env.test for deterministic testing
 */
export class TestWalletProvider {
  private wallet: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;
  public readonly chainId: number;

  constructor(config: TestWalletConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
    this.chainId = config.chainId;
  }

  /**
   * Get signer for SDK authentication
   */
  getSigner(): ethers.Wallet {
    return this.wallet;
  }

  /**
   * Get address for UI display
   */
  getAddress(): string {
    return this.wallet.address;
  }

  /**
   * Simulate wallet connection (instant, no popup)
   */
  async connect(): Promise<string> {
    return this.wallet.address;
  }

  /**
   * Get balance (native or ERC-20 token)
   */
  async getBalance(tokenAddress?: string): Promise<bigint> {
    if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
      // Native token (ETH)
      return await this.provider.getBalance(this.wallet.address);
    } else {
      // ERC-20 token (USDC, FAB, etc.)
      const contract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        this.provider
      );
      return await contract.balanceOf(this.wallet.address);
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(txHash: string, confirmations = 3): Promise<void> {
    const tx = await this.provider.getTransaction(txHash);
    if (tx) {
      await tx.wait(confirmations);
    }
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  /**
   * Get provider for direct contract interactions
   */
  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }
}
