/**
 * FabstirSDKCore - Browser-compatible SDK for Fabstir LLM Marketplace
 * 
 * This is the main entry point for browser applications.
 * All functionality is browser-safe with zero Node.js dependencies.
 */

import { ethers } from 'ethers';
import { 
  IAuthManager,
  IPaymentManager,
  IStorageManager,
  ISessionManager,
  IHostManager,
  ITreasuryManager
} from './interfaces';
import { AuthManager } from './managers/AuthManager';
import { PaymentManager } from './managers/PaymentManager';
import { StorageManager } from './managers/StorageManager';
import { SessionManager } from './managers/SessionManager';
import { HostManager } from './managers/HostManager';
import { TreasuryManager } from './managers/TreasuryManager';
import { ContractManager } from './contracts/ContractManager';
import { UnifiedBridgeClient } from './services/UnifiedBridgeClient';
import { SDKConfig, SDKError } from './types';

export interface FabstirSDKCoreConfig {
  // Network configuration
  rpcUrl?: string;
  chainId?: number;
  
  // Contract addresses (optional - can use env vars)
  contractAddresses?: {
    jobMarketplace?: string;
    nodeRegistry?: string;
    proofSystem?: string;
    hostEarnings?: string;
    fabToken?: string;
    usdcToken?: string;
  };
  
  // S5 Storage configuration
  s5Config?: {
    portalUrl?: string;
    seedPhrase?: string;
  };
  
  // Bridge configuration for server features
  bridgeConfig?: {
    url?: string;
    autoConnect?: boolean;
  };
  
  // Smart wallet configuration
  smartWallet?: {
    factoryAddress?: string;
    entryPointAddress?: string;
  };
  
  // Development mode
  mode?: 'production' | 'development';
}

export class FabstirSDKCore {
  private config: FabstirSDKCoreConfig;
  private provider?: ethers.BrowserProvider;
  private signer?: ethers.Signer;
  private contractManager?: ContractManager;
  private bridgeClient?: UnifiedBridgeClient;
  
  // Manager instances
  private authManager?: IAuthManager;
  private paymentManager?: IPaymentManager;
  private storageManager?: IStorageManager;
  private sessionManager?: ISessionManager;
  private hostManager?: IHostManager;
  private treasuryManager?: ITreasuryManager;
  
  private authenticated = false;
  
  constructor(config: FabstirSDKCoreConfig = {}) {
    this.config = this.validateConfig(config);
  }
  
  /**
   * Validate and normalize configuration
   */
  private validateConfig(config: FabstirSDKCoreConfig): FabstirSDKCoreConfig {
    // Use environment variables as defaults (in browser, these would be build-time injected)
    const defaultConfig: FabstirSDKCoreConfig = {
      mode: config.mode || 'production',
      rpcUrl: config.rpcUrl || process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA,
      chainId: config.chainId || 84532, // Base Sepolia
      
      contractAddresses: {
        jobMarketplace: config.contractAddresses?.jobMarketplace || process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE,
        nodeRegistry: config.contractAddresses?.nodeRegistry || process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY,
        proofSystem: config.contractAddresses?.proofSystem || process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM,
        hostEarnings: config.contractAddresses?.hostEarnings || process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS,
        fabToken: config.contractAddresses?.fabToken || process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN,
        usdcToken: config.contractAddresses?.usdcToken || process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN
      },
      
      s5Config: {
        portalUrl: config.s5Config?.portalUrl || process.env.NEXT_PUBLIC_S5_PORTAL_URL,
        ...config.s5Config
      },
      
      bridgeConfig: {
        url: config.bridgeConfig?.url || process.env.NEXT_PUBLIC_BRIDGE_URL || 'http://localhost:3000',
        autoConnect: config.bridgeConfig?.autoConnect ?? false
      },
      
      smartWallet: config.smartWallet
    };
    
    // Validate required fields
    if (!defaultConfig.contractAddresses?.jobMarketplace) {
      throw new SDKError(
        'JobMarketplace contract address not configured',
        'CONFIG_MISSING_CONTRACT'
      );
    }
    
    return { ...defaultConfig, ...config };
  }
  
  /**
   * Authenticate with wallet
   */
  async authenticate(method: 'metamask' | 'walletconnect' | 'privatekey' = 'metamask', options?: any): Promise<void> {
    try {
      if (method === 'metamask') {
        await this.authenticateWithMetaMask();
      } else if (method === 'walletconnect') {
        await this.authenticateWithWalletConnect(options);
      } else if (method === 'privatekey') {
        await this.authenticateWithPrivateKey(options.privateKey);
      } else {
        throw new SDKError('Unsupported authentication method', 'AUTH_METHOD_UNSUPPORTED');
      }
      
      this.authenticated = true;
      
      // Initialize contract manager
      this.contractManager = new ContractManager(
        this.provider!,
        this.signer!,
        this.config.contractAddresses!
      );
      
      // Initialize managers
      await this.initializeManagers();
      
    } catch (error: any) {
      throw new SDKError(
        'Authentication failed',
        'AUTH_FAILED',
        { error: error.message }
      );
    }
  }
  
  /**
   * Authenticate with MetaMask
   */
  private async authenticateWithMetaMask(): Promise<void> {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new SDKError('MetaMask not available', 'METAMASK_NOT_FOUND');
    }
    
    // Request accounts
    const accounts = await window.ethereum.request({ 
      method: 'eth_requestAccounts' 
    });
    
    if (!accounts || accounts.length === 0) {
      throw new SDKError('No accounts found', 'NO_ACCOUNTS');
    }
    
    // Create provider and signer
    this.provider = new ethers.BrowserProvider(window.ethereum);
    this.signer = await this.provider.getSigner();
    
    // Verify network
    const network = await this.provider.getNetwork();
    if (network.chainId !== BigInt(this.config.chainId!)) {
      // Try to switch network
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${this.config.chainId!.toString(16)}` }]
        });
      } catch (error) {
        throw new SDKError(
          `Wrong network. Please switch to chain ${this.config.chainId}`,
          'WRONG_NETWORK'
        );
      }
    }
  }
  
  /**
   * Authenticate with WalletConnect
   */
  private async authenticateWithWalletConnect(options?: any): Promise<void> {
    // WalletConnect implementation would go here
    // This requires additional dependencies that should be optional
    throw new SDKError('WalletConnect not yet implemented', 'NOT_IMPLEMENTED');
  }
  
  /**
   * Authenticate with private key (for testing)
   */
  private async authenticateWithPrivateKey(privateKey: string): Promise<void> {
    if (!privateKey) {
      throw new SDKError('Private key required', 'PRIVATE_KEY_REQUIRED');
    }
    
    if (!this.config.rpcUrl) {
      throw new SDKError('RPC URL required for private key auth', 'RPC_URL_REQUIRED');
    }
    
    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
  }
  
  /**
   * Initialize all managers
   */
  private async initializeManagers(): Promise<void> {
    // Create auth manager
    this.authManager = new AuthManager();
    await this.authManager.initialize({
      provider: this.provider!,
      signer: this.signer!,
      s5Config: this.config.s5Config
    });
    
    // Create other managers
    this.paymentManager = new PaymentManager(this.contractManager!);
    this.storageManager = new StorageManager(this.authManager);
    this.sessionManager = new SessionManager(this.contractManager!);
    this.hostManager = new HostManager(this.contractManager!);
    this.treasuryManager = new TreasuryManager(this.contractManager!);
    
    // Initialize bridge client if configured
    if (this.config.bridgeConfig?.url) {
      this.bridgeClient = new UnifiedBridgeClient(
        {
          bridgeUrl: this.config.bridgeConfig.url,
          autoConnect: this.config.bridgeConfig.autoConnect || false
        },
        this.contractManager
      );
      
      if (this.config.bridgeConfig.autoConnect) {
        try {
          await this.bridgeClient.connect();
        } catch (error) {
          console.warn('Failed to auto-connect to bridge:', error);
        }
      }
    }
  }
  
  /**
   * Connect to bridge server for P2P and proof features
   */
  async connectToBridge(url?: string): Promise<void> {
    const bridgeUrl = url || this.config.bridgeConfig?.url;
    
    if (!bridgeUrl) {
      throw new SDKError('Bridge URL not configured', 'BRIDGE_URL_MISSING');
    }
    
    if (!this.bridgeClient) {
      this.bridgeClient = new UnifiedBridgeClient(
        { bridgeUrl },
        this.contractManager
      );
    }
    
    await this.bridgeClient.connect();
  }
  
  /**
   * Get authentication manager
   */
  getAuthManager(): IAuthManager {
    this.ensureAuthenticated();
    return this.authManager!;
  }
  
  /**
   * Get payment manager
   */
  getPaymentManager(): IPaymentManager {
    this.ensureAuthenticated();
    return this.paymentManager!;
  }
  
  /**
   * Get storage manager
   */
  getStorageManager(): IStorageManager {
    this.ensureAuthenticated();
    return this.storageManager!;
  }
  
  /**
   * Get session manager
   */
  getSessionManager(): ISessionManager {
    this.ensureAuthenticated();
    return this.sessionManager!;
  }
  
  /**
   * Get host manager
   */
  getHostManager(): IHostManager {
    this.ensureAuthenticated();
    return this.hostManager!;
  }
  
  /**
   * Get treasury manager
   */
  getTreasuryManager(): ITreasuryManager {
    this.ensureAuthenticated();
    return this.treasuryManager!;
  }
  
  /**
   * Get bridge client for P2P and proof operations
   */
  getBridgeClient(): UnifiedBridgeClient | undefined {
    return this.bridgeClient;
  }
  
  /**
   * Check if P2P features are available
   */
  isP2PAvailable(): boolean {
    return this.bridgeClient?.isP2PAvailable() || false;
  }
  
  /**
   * Check if proof generation is available
   */
  isProofAvailable(): boolean {
    return this.bridgeClient?.isProofAvailable() || false;
  }
  
  /**
   * Get current provider
   */
  getProvider(): ethers.BrowserProvider | undefined {
    return this.provider;
  }
  
  /**
   * Get current signer
   */
  getSigner(): ethers.Signer | undefined {
    return this.signer;
  }
  
  /**
   * Get current account address
   */
  async getAddress(): Promise<string | undefined> {
    if (!this.signer) return undefined;
    return await this.signer.getAddress();
  }
  
  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.authenticated;
  }
  
  /**
   * Ensure SDK is authenticated
   */
  private ensureAuthenticated(): void {
    if (!this.authenticated) {
      throw new SDKError('SDK not authenticated', 'NOT_AUTHENTICATED');
    }
  }
  
  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    // Disconnect from bridge
    if (this.bridgeClient) {
      await this.bridgeClient.disconnect();
    }
    
    // Clear managers
    this.authManager = undefined;
    this.paymentManager = undefined;
    this.storageManager = undefined;
    this.sessionManager = undefined;
    this.hostManager = undefined;
    this.treasuryManager = undefined;
    
    // Clear auth state
    this.provider = undefined;
    this.signer = undefined;
    this.contractManager = undefined;
    this.authenticated = false;
  }
  
  /**
   * Get SDK version
   */
  getVersion(): string {
    return '1.0.0-browser';
  }
  
  /**
   * Get SDK environment
   */
  getEnvironment(): 'browser' | 'node' {
    return 'browser';
  }
}