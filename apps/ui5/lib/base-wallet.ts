/**
 * Base Wallet Provider for UI5
 *
 * Now uses flexible wallet adapter pattern to support:
 * 1. MetaMask/Browser Wallet (production)
 * 2. Test Wallet (automated testing with private key)
 * 3. Base Account Kit (gasless transactions) - Coming soon
 * 4. Particle Network (social login) - Coming soon
 *
 * Provides a unified interface for wallet connection and signer access.
 */

import { ethers, type Signer } from 'ethers';
import {
  getWalletManager,
  type WalletAdapter,
  type WalletType,
  type WalletConfig as AdapterWalletConfig,
} from './wallet-adapter';

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
 * Detect which wallet type to use based on environment
 */
function detectWalletType(): WalletType {
  // Check for test mode first
  if (typeof window !== 'undefined') {
    const testWallet = (window as any).__TEST_WALLET__;
    if (testWallet && testWallet.privateKey) {
      console.debug('[BaseWallet] 🧪 Test wallet detected');
      return 'test-wallet';
    }
  }

  // Check for Base Account Kit API keys
  const hasBaseAccountKit = !!(
    process.env.NEXT_PUBLIC_BASE_ACCOUNT_KIT_API_KEY &&
    process.env.NEXT_PUBLIC_BASE_ACCOUNT_KIT_PROJECT_ID
  );
  if (hasBaseAccountKit) {
    console.debug('[BaseWallet] Base Account Kit configured');
    return 'base-account-kit';
  }

  // Default to MetaMask
  if (typeof window !== 'undefined' && window.ethereum) {
    console.debug('[BaseWallet] MetaMask detected');
    return 'metamask';
  }

  throw new Error('No wallet available. Please install MetaMask or configure Base Account Kit.');
}

/**
 * Unified wallet provider using flexible adapter pattern
 */
export class BaseWalletProvider {
  private adapter: WalletAdapter | null = null;
  private config: WalletConfig;

  constructor(config: WalletConfig) {
    this.config = config;
  }

  /**
   * Connect wallet (auto-detects wallet type)
   */
  async connect(): Promise<string> {
    try {
      const walletType = detectWalletType();
      console.debug(`[BaseWallet] Connecting via ${walletType}...`);

      const manager = getWalletManager();

      // Prepare wallet config
      const adapterConfig: AdapterWalletConfig = {
        chainId: this.config.chainId,
        rpcUrl: this.config.rpcUrl,
      };

      // Prepare wallet-specific options
      const options: any = {};

      if (walletType === 'test-wallet') {
        // Get test wallet private key from window
        const testWallet = (window as any).__TEST_WALLET__;
        options.privateKey = testWallet.privateKey;
      } else if (walletType === 'base-account-kit' && this.config.baseAccountKit) {
        options.baseAccountKit = this.config.baseAccountKit;
      }

      // Connect via wallet manager
      const address = await manager.connect(walletType, adapterConfig, options);
      this.adapter = manager.getAdapter();

      console.debug(`[BaseWallet] Connected via ${walletType}:`, address);
      return address;
    } catch (error) {
      console.error('[BaseWallet] Connection failed:', error);
      throw new Error('Failed to connect wallet');
    }
  }

  /**
   * Create or get sub-account with spend permissions (Base Account Kit only)
   * For MetaMask/Test Wallet connections, this is a no-op and returns the primary address
   */
  async ensureSubAccount(config: SubAccountConfig): Promise<{
    address: string;
    isExisting: boolean;
  }> {
    if (!this.adapter) {
      throw new Error('Wallet not connected. Call connect() first.');
    }

    const walletType = this.adapter.getType();

    if (walletType !== 'base-account-kit') {
      // MetaMask and Test Wallet don't support sub-accounts
      const address = this.adapter.getAddress();
      console.debug(
        `[BaseWallet] Sub-accounts not supported with ${walletType}. Using primary address.`
      );
      return { address: address!, isExisting: true };
    }

    // TODO: Implement sub-account creation when Base Account Kit is active
    console.warn('[BaseWallet] Sub-account creation not yet implemented');
    const address = this.adapter.getAddress();
    return { address: address!, isExisting: true };
  }

  /**
   * Get ethers signer for SDK integration
   */
  async getSigner(): Promise<Signer> {
    if (!this.adapter) {
      throw new Error('Wallet not connected');
    }
    return await this.adapter.getSigner();
  }

  /**
   * Get current wallet address
   */
  getAddress(): string | null {
    if (!this.adapter) {
      return null;
    }
    return this.adapter.getAddress();
  }

  /**
   * Get connection mode
   */
  getMode(): 'base-account-kit' | 'metamask' {
    if (!this.adapter) {
      return 'metamask'; // Default
    }
    const type = this.adapter.getType();
    return type === 'base-account-kit' ? 'base-account-kit' : 'metamask';
  }

  /**
   * Disconnect wallet
   */
  async disconnect(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
    }

    const manager = getWalletManager();
    await manager.disconnect();

    this.adapter = null;
    console.debug('[BaseWallet] Disconnected');
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this.adapter !== null && this.adapter.isConnected();
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
