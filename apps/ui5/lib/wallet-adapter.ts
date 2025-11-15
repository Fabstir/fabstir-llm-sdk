/**
 * Wallet Adapter Pattern for UI5
 *
 * Provides a unified interface for multiple wallet providers:
 * 1. MetaMask/Browser Wallets (EIP-1193)
 * 2. Base Account Kit (Gasless transactions)
 * 3. Particle Network
 * 4. Test Wallet (ethers.Wallet for automated testing)
 *
 * All adapters implement the same WalletAdapter interface, making the
 * application code wallet-agnostic.
 */

import { ethers, type Signer, type Provider } from 'ethers';

/**
 * Unified wallet adapter interface
 * All wallet providers must implement this interface
 */
export interface WalletAdapter {
  /** Connect wallet and return address */
  connect(): Promise<string>;

  /** Disconnect wallet */
  disconnect(): Promise<void>;

  /** Get ethers Signer for transactions */
  getSigner(): Promise<Signer>;

  /** Get ethers Provider for read operations */
  getProvider(): Provider;

  /** Get connected wallet address */
  getAddress(): string | null;

  /** Check if wallet is connected */
  isConnected(): boolean;

  /** Get wallet type identifier */
  getType(): string;
}

/**
 * Configuration for wallet adapters
 */
export interface WalletConfig {
  chainId: number;
  rpcUrl: string;
}

// =============================================================================
// METAMASK ADAPTER (Browser Wallet via EIP-1193)
// =============================================================================

export class MetaMaskAdapter implements WalletAdapter {
  private signer: Signer | null = null;
  private address: string | null = null;
  private provider: ethers.BrowserProvider | null = null;
  private config: WalletConfig;

  constructor(config: WalletConfig) {
    this.config = config;
  }

  async connect(): Promise<string> {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask not installed');
    }

    console.log('[MetaMaskAdapter] Connecting...');

    this.provider = new ethers.BrowserProvider(window.ethereum);
    await this.provider.send('eth_requestAccounts', []);

    this.signer = await this.provider.getSigner();
    this.address = await this.signer.getAddress();

    // Verify network
    const network = await this.provider.getNetwork();
    if (Number(network.chainId) !== this.config.chainId) {
      await this.switchNetwork();
    }

    console.log('[MetaMaskAdapter] Connected:', this.address);
    return this.address;
  }

  async disconnect(): Promise<void> {
    this.signer = null;
    this.address = null;
    this.provider = null;
    console.log('[MetaMaskAdapter] Disconnected');
  }

  async getSigner(): Promise<Signer> {
    if (!this.signer) {
      throw new Error('Wallet not connected');
    }
    return this.signer;
  }

  getProvider(): Provider {
    if (!this.provider) {
      throw new Error('Wallet not connected');
    }
    return this.provider;
  }

  getAddress(): string | null {
    return this.address;
  }

  isConnected(): boolean {
    return this.address !== null;
  }

  getType(): string {
    return 'metamask';
  }

  private async switchNetwork(): Promise<void> {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${this.config.chainId.toString(16)}` }],
      });
    } catch (error: any) {
      if (error.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: `0x${this.config.chainId.toString(16)}`,
              rpcUrls: [this.config.rpcUrl],
              chainName: 'Base Sepolia',
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              blockExplorerUrls: ['https://sepolia.basescan.org'],
            },
          ],
        });
      } else {
        throw error;
      }
    }
  }
}

// =============================================================================
// TEST WALLET ADAPTER (ethers.Wallet for automated testing)
// =============================================================================

export class TestWalletAdapter implements WalletAdapter {
  private wallet: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;
  private config: WalletConfig;

  constructor(config: WalletConfig, privateKey: string) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    console.log('[TestWalletAdapter] Initialized with address:', this.wallet.address);
  }

  async connect(): Promise<string> {
    // Test wallet is always "connected" since we have the private key
    console.log('[TestWalletAdapter] Connected:', this.wallet.address);
    return this.wallet.address;
  }

  async disconnect(): Promise<void> {
    console.log('[TestWalletAdapter] Disconnected (note: test wallet cannot truly disconnect)');
    // Note: Can't actually disconnect a private key wallet
    // This is just for interface compatibility
  }

  async getSigner(): Promise<Signer> {
    return this.wallet;
  }

  getProvider(): Provider {
    return this.provider;
  }

  getAddress(): string | null {
    return this.wallet.address;
  }

  isConnected(): boolean {
    return true; // Test wallet is always connected
  }

  getType(): string {
    return 'test-wallet';
  }
}

// =============================================================================
// BASE ACCOUNT KIT ADAPTER (Gasless transactions)
// =============================================================================

export interface BaseAccountKitConfig extends WalletConfig {
  apiKey: string;
  projectId: string;
}

export class BaseAccountKitAdapter implements WalletAdapter {
  private signer: Signer | null = null;
  private address: string | null = null;
  private provider: any = null; // Base Account Kit provider
  private config: BaseAccountKitConfig;

  constructor(config: BaseAccountKitConfig) {
    this.config = config;
  }

  async connect(): Promise<string> {
    // TODO: Implement Base Account Kit connection
    // This requires @base-org/account package
    throw new Error('Base Account Kit not yet implemented');

    /*
    // Future implementation:
    import { createBaseAccountSDK } from '@base-org/account';
    import { base } from '@base-org/account/chains';

    const accountSDK = createBaseAccountSDK({
      apiKey: this.config.apiKey,
      projectId: this.config.projectId,
      chain: base.sepolia,
    });

    await accountSDK.connect();
    this.address = await accountSDK.getAddress();
    this.provider = await accountSDK.getProvider();
    this.signer = await this.provider.getSigner();

    console.log('[BaseAccountKitAdapter] Connected:', this.address);
    return this.address;
    */
  }

  async disconnect(): Promise<void> {
    this.signer = null;
    this.address = null;
    this.provider = null;
    console.log('[BaseAccountKitAdapter] Disconnected');
  }

  async getSigner(): Promise<Signer> {
    if (!this.signer) {
      throw new Error('Wallet not connected');
    }
    return this.signer;
  }

  getProvider(): Provider {
    if (!this.provider) {
      throw new Error('Wallet not connected');
    }
    return this.provider;
  }

  getAddress(): string | null {
    return this.address;
  }

  isConnected(): boolean {
    return this.address !== null;
  }

  getType(): string {
    return 'base-account-kit';
  }
}

// =============================================================================
// PARTICLE NETWORK ADAPTER
// =============================================================================

export interface ParticleNetworkConfig extends WalletConfig {
  projectId: string;
  clientKey: string;
  appId: string;
}

export class ParticleNetworkAdapter implements WalletAdapter {
  private signer: Signer | null = null;
  private address: string | null = null;
  private provider: any = null;
  private config: ParticleNetworkConfig;

  constructor(config: ParticleNetworkConfig) {
    this.config = config;
  }

  async connect(): Promise<string> {
    // TODO: Implement Particle Network connection
    // This requires @particle-network/auth package
    throw new Error('Particle Network not yet implemented');

    /*
    // Future implementation:
    import { ParticleNetwork } from '@particle-network/auth';

    const particle = new ParticleNetwork({
      projectId: this.config.projectId,
      clientKey: this.config.clientKey,
      appId: this.config.appId,
      chainId: this.config.chainId,
    });

    const userInfo = await particle.auth.login();
    this.address = await particle.evm.getAddress();
    this.provider = new ethers.BrowserProvider(particle.ethereum);
    this.signer = await this.provider.getSigner();

    console.log('[ParticleNetworkAdapter] Connected:', this.address);
    return this.address;
    */
  }

  async disconnect(): Promise<void> {
    this.signer = null;
    this.address = null;
    this.provider = null;
    console.log('[ParticleNetworkAdapter] Disconnected');
  }

  async getSigner(): Promise<Signer> {
    if (!this.signer) {
      throw new Error('Wallet not connected');
    }
    return this.signer;
  }

  getProvider(): Provider {
    if (!this.provider) {
      throw new Error('Wallet not connected');
    }
    return this.provider;
  }

  getAddress(): string | null {
    return this.address;
  }

  isConnected(): boolean {
    return this.address !== null;
  }

  getType(): string {
    return 'particle-network';
  }
}

// =============================================================================
// WALLET MANAGER (Factory + Singleton)
// =============================================================================

export type WalletType = 'metamask' | 'base-account-kit' | 'particle-network' | 'test-wallet';

export class WalletManager {
  private currentAdapter: WalletAdapter | null = null;

  /**
   * Create wallet adapter based on type
   */
  createAdapter(
    type: WalletType,
    config: WalletConfig,
    options?: {
      privateKey?: string; // For test-wallet
      baseAccountKit?: { apiKey: string; projectId: string }; // For base-account-kit
      particleNetwork?: { projectId: string; clientKey: string; appId: string }; // For particle-network
    }
  ): WalletAdapter {
    switch (type) {
      case 'metamask':
        return new MetaMaskAdapter(config);

      case 'test-wallet':
        if (!options?.privateKey) {
          throw new Error('privateKey required for test-wallet');
        }
        return new TestWalletAdapter(config, options.privateKey);

      case 'base-account-kit':
        if (!options?.baseAccountKit) {
          throw new Error('baseAccountKit config required');
        }
        return new BaseAccountKitAdapter({
          ...config,
          apiKey: options.baseAccountKit.apiKey,
          projectId: options.baseAccountKit.projectId,
        });

      case 'particle-network':
        if (!options?.particleNetwork) {
          throw new Error('particleNetwork config required');
        }
        return new ParticleNetworkAdapter({
          ...config,
          projectId: options.particleNetwork.projectId,
          clientKey: options.particleNetwork.clientKey,
          appId: options.particleNetwork.appId,
        });

      default:
        throw new Error(`Unknown wallet type: ${type}`);
    }
  }

  /**
   * Connect using specific wallet type
   */
  async connect(
    type: WalletType,
    config: WalletConfig,
    options?: {
      privateKey?: string;
      baseAccountKit?: { apiKey: string; projectId: string };
      particleNetwork?: { projectId: string; clientKey: string; appId: string };
    }
  ): Promise<string> {
    const adapter = this.createAdapter(type, config, options);
    const address = await adapter.connect();
    this.currentAdapter = adapter;
    return address;
  }

  /**
   * Get current wallet adapter
   */
  getAdapter(): WalletAdapter | null {
    return this.currentAdapter;
  }

  /**
   * Disconnect current wallet
   */
  async disconnect(): Promise<void> {
    if (this.currentAdapter) {
      await this.currentAdapter.disconnect();
      this.currentAdapter = null;
    }
  }
}

// Singleton instance
let walletManagerInstance: WalletManager | null = null;

/**
 * Get singleton wallet manager
 */
export function getWalletManager(): WalletManager {
  if (!walletManagerInstance) {
    walletManagerInstance = new WalletManager();
  }
  return walletManagerInstance;
}

// Type augmentation
declare global {
  interface Window {
    ethereum?: any;
  }
}
