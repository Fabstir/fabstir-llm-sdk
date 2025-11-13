/**
 * Base Wallet Provider for UI5
 *
 * Supports multiple wallet connection methods:
 * 1. Base Account Kit (with API keys configured) - Gasless transactions via sub-accounts
 * 2. MetaMask/Browser Wallet (fallback) - Standard wallet connection
 *
 * Provides a unified interface for wallet connection and signer access.
 */

import { ethers, type Signer } from 'ethers';

export interface WalletConfig {
  // Base Account Kit configuration (optional - for gasless transactions)
  baseAccountKit?: {
    apiKey: string;
    projectId: string;
  };
  // Network configuration
  chainId: number;
  rpcUrl: string;
}

export interface SubAccountConfig {
  tokenAddress: string;
  tokenDecimals: number;
  maxAllowance: string;  // e.g., "1000000" for 1M USDC
  periodDays: number;     // e.g., 365 for 1 year
}

/**
 * Unified wallet provider supporting Base Account Kit and MetaMask
 */
export class BaseWalletProvider {
  private signer: Signer | null = null;
  private address: string | null = null;
  private provider: ethers.BrowserProvider | null = null;
  private useBaseAccountKit: boolean = false;
  private config: WalletConfig;

  constructor(config: WalletConfig) {
    this.config = config;
    this.useBaseAccountKit = !!(
      config.baseAccountKit?.apiKey &&
      config.baseAccountKit?.projectId
    );
  }

  /**
   * Connect wallet (MetaMask or Base Account Kit)
   */
  async connect(): Promise<string> {
    try {
      if (this.useBaseAccountKit) {
        return await this.connectBaseAccountKit();
      } else {
        return await this.connectMetaMask();
      }
    } catch (error) {
      console.error('[BaseWallet] Connection failed:', error);
      throw new Error('Failed to connect wallet');
    }
  }

  /**
   * Connect using MetaMask or browser wallet
   */
  private async connectMetaMask(): Promise<string> {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask not installed. Please install MetaMask to continue.');
    }

    console.log('[BaseWallet] Connecting via MetaMask...');

    // Create ethers provider from window.ethereum
    this.provider = new ethers.BrowserProvider(window.ethereum);

    // Request account access
    await this.provider.send('eth_requestAccounts', []);

    // Get signer and address
    this.signer = await this.provider.getSigner();
    this.address = await this.signer.getAddress();

    // Verify we're on the correct network
    const network = await this.provider.getNetwork();
    if (Number(network.chainId) !== this.config.chainId) {
      console.warn(
        `[BaseWallet] Wrong network. Expected ${this.config.chainId}, got ${network.chainId}`
      );
      // Try to switch network
      try {
        await this.switchNetwork();
      } catch (switchError) {
        throw new Error(
          `Please switch to chain ID ${this.config.chainId} in MetaMask`
        );
      }
    }

    console.log('[BaseWallet] MetaMask connected:', this.address);
    return this.address;
  }

  /**
   * Switch to the correct network in MetaMask
   */
  private async switchNetwork(): Promise<void> {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${this.config.chainId.toString(16)}` }],
      });
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: `0x${this.config.chainId.toString(16)}`,
              rpcUrls: [this.config.rpcUrl],
              chainName: 'Base Sepolia',
              nativeCurrency: {
                name: 'ETH',
                symbol: 'ETH',
                decimals: 18,
              },
              blockExplorerUrls: ['https://sepolia.basescan.org'],
            },
          ],
        });
      } else {
        throw switchError;
      }
    }
  }

  /**
   * Connect using Base Account Kit (placeholder for future implementation)
   * Requires @base-org/account package and API configuration
   */
  private async connectBaseAccountKit(): Promise<string> {
    // TODO: Implement Base Account Kit connection when API keys are configured
    // For now, fallback to MetaMask
    console.log(
      '[BaseWallet] Base Account Kit configured but not yet implemented. Using MetaMask fallback.'
    );
    this.useBaseAccountKit = false;
    return await this.connectMetaMask();

    /*
    // Future implementation:
    import { createBaseAccountSDK } from '@base-org/account';
    import { base } from '@base-org/account/chains';

    const accountSDK = createBaseAccountSDK({
      apiKey: this.config.baseAccountKit!.apiKey,
      projectId: this.config.baseAccountKit!.projectId,
      chain: base.sepolia,
    });

    await accountSDK.connect();
    this.address = await accountSDK.getAddress();
    const provider = await accountSDK.getProvider();
    this.signer = await provider.getSigner();

    return this.address;
    */
  }

  /**
   * Create or get sub-account with spend permissions (Base Account Kit only)
   * For MetaMask connections, this is a no-op and returns the primary address
   */
  async ensureSubAccount(config: SubAccountConfig): Promise<{
    address: string;
    isExisting: boolean;
  }> {
    if (!this.address) {
      throw new Error('Wallet not connected. Call connect() first.');
    }

    if (!this.useBaseAccountKit) {
      // MetaMask doesn't support sub-accounts
      console.log(
        '[BaseWallet] Sub-accounts not supported with MetaMask. Using primary address.'
      );
      return { address: this.address, isExisting: true };
    }

    // TODO: Implement sub-account creation when Base Account Kit is active
    console.warn('[BaseWallet] Sub-account creation not yet implemented');
    return { address: this.address, isExisting: true };
  }

  /**
   * Get ethers signer for SDK integration
   */
  async getSigner(): Promise<Signer> {
    if (!this.signer) {
      throw new Error('Wallet not connected');
    }
    return this.signer;
  }

  /**
   * Get current wallet address
   */
  getAddress(): string | null {
    return this.address;
  }

  /**
   * Get connection mode
   */
  getMode(): 'base-account-kit' | 'metamask' {
    return this.useBaseAccountKit ? 'base-account-kit' : 'metamask';
  }

  /**
   * Disconnect wallet
   */
  async disconnect(): Promise<void> {
    this.signer = null;
    this.address = null;
    this.provider = null;
    console.log('[BaseWallet] Disconnected');
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this.address !== null;
  }
}

// Singleton instance
let baseWalletInstance: BaseWalletProvider | null = null;

/**
 * Get singleton Base Wallet instance
 */
export function getBaseWallet(): BaseWalletProvider {
  if (!baseWalletInstance) {
    const config: WalletConfig = {
      chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 84532),
      rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA || 'https://sepolia.base.org',
      // Base Account Kit config (optional - only used if API keys are set)
      baseAccountKit:
        process.env.NEXT_PUBLIC_BASE_ACCOUNT_KIT_API_KEY &&
        process.env.NEXT_PUBLIC_BASE_ACCOUNT_KIT_PROJECT_ID
          ? {
              apiKey: process.env.NEXT_PUBLIC_BASE_ACCOUNT_KIT_API_KEY,
              projectId: process.env.NEXT_PUBLIC_BASE_ACCOUNT_KIT_PROJECT_ID,
            }
          : undefined,
    };

    baseWalletInstance = new BaseWalletProvider(config);
  }

  return baseWalletInstance;
}

// Type augmentation for window.ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}
