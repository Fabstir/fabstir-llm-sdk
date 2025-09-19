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
import {
  validateRpcUrl,
  validateRequiredAddresses,
  validateOptionalAddress
} from './utils/validation';
import { HostManagerEnhanced } from './managers/HostManagerEnhanced';
import { ModelManager } from './managers/ModelManager';
import { TreasuryManager } from './managers/TreasuryManager';
import { ClientManager } from './managers/ClientManager';
import { ContractManager, ContractAddresses } from './contracts/ContractManager';
import { UnifiedBridgeClient } from './services/UnifiedBridgeClient';
import { SDKConfig, SDKError } from './types';
import { getOrGenerateS5Seed, hasCachedSeed } from './utils/s5-seed-derivation';

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
    modelRegistry?: string;
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
  private provider?: ethers.BrowserProvider | ethers.JsonRpcProvider;
  private signer?: ethers.Signer;
  private contractManager?: ContractManager;
  private bridgeClient?: UnifiedBridgeClient;
  
  // Manager instances
  private authManager?: IAuthManager;
  private paymentManager?: IPaymentManager;
  private storageManager?: IStorageManager;
  private sessionManager?: ISessionManager;
  private hostManager?: IHostManager;
  private modelManager?: ModelManager;
  private clientManager?: ClientManager;
  private treasuryManager?: ITreasuryManager;
  
  private authenticated = false;
  private s5Seed?: string;
  private userAddress?: string;
  
  constructor(config: FabstirSDKCoreConfig = {}) {
    this.config = this.validateConfig(config);
  }
  
  /**
   * Validate and normalize configuration
   */
  private validateConfig(config: FabstirSDKCoreConfig): FabstirSDKCoreConfig {
    // Validate RPC URL - NO fallback to environment variables
    validateRpcUrl(config.rpcUrl);

    // Build configuration without environment variable fallbacks
    const defaultConfig: FabstirSDKCoreConfig = {
      mode: config.mode || 'production',
      rpcUrl: config.rpcUrl, // Required, no fallback
      chainId: config.chainId || 84532, // Base Sepolia default

      contractAddresses: {
        // Required addresses - no fallbacks
        jobMarketplace: config.contractAddresses?.jobMarketplace,
        nodeRegistry: config.contractAddresses?.nodeRegistry,
        proofSystem: config.contractAddresses?.proofSystem,
        hostEarnings: config.contractAddresses?.hostEarnings,
        usdcToken: config.contractAddresses?.usdcToken,
        // Optional addresses
        fabToken: config.contractAddresses?.fabToken,
        modelRegistry: config.contractAddresses?.modelRegistry
      },

      s5Config: {
        portalUrl: config.s5Config?.portalUrl,
        ...config.s5Config
      },

      bridgeConfig: {
        url: config.bridgeConfig?.url || 'http://localhost:3000',
        autoConnect: config.bridgeConfig?.autoConnect ?? false
      },

      smartWallet: config.smartWallet
    };

    // Validate all required contract addresses
    validateRequiredAddresses(defaultConfig.contractAddresses as any);

    // Validate optional addresses if provided
    if (defaultConfig.contractAddresses?.fabToken) {
      validateOptionalAddress(defaultConfig.contractAddresses.fabToken, 'fabToken');
    }
    if (defaultConfig.contractAddresses?.modelRegistry) {
      validateOptionalAddress(defaultConfig.contractAddresses.modelRegistry, 'modelRegistry');
    }

    return defaultConfig;
  }
  
  /**
   * Authenticate with wallet
   */
  async authenticate(method: 'metamask' | 'walletconnect' | 'privatekey' | 'signer' = 'metamask', options?: any): Promise<void> {
    try {
      if (method === 'metamask') {
        await this.authenticateWithMetaMask();
      } else if (method === 'walletconnect') {
        await this.authenticateWithWalletConnect(options);
      } else if (method === 'privatekey') {
        if (!options || !options.privateKey) {
          throw new SDKError('Private key required in options', 'PRIVATE_KEY_MISSING');
        }
        await this.authenticateWithPrivateKey(options.privateKey);
      } else if (method === 'signer') {
        if (!options || !options.signer) {
          throw new SDKError('Signer required in options', 'SIGNER_MISSING');
        }
        await this.authenticateWithSigner(options.signer);
      } else {
        throw new SDKError('Unsupported authentication method', 'AUTH_METHOD_UNSUPPORTED');
      }
      
      this.authenticated = true;
      console.log('Authentication flag set to true');
      
      // Initialize contract manager
      console.log('Creating ContractManager...');
      this.contractManager = new ContractManager(
        this.provider!,
        this.config.contractAddresses! as ContractAddresses
      );
      console.log('Setting signer on ContractManager...');
      await this.contractManager.setSigner(this.signer!);
      console.log('ContractManager ready');
      
      // Initialize managers
      console.log('Initializing managers...');
      await this.initializeManagers();
      console.log('All managers initialized');
      
    } catch (error: any) {
      console.error('Authentication error details:', error);
      throw new SDKError(
        `Authentication failed: ${error.message}`,
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
    this.userAddress = await this.signer.getAddress();
    
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
    
    // Generate or retrieve S5 seed deterministically
    try {
      // Check if we have a cached seed for this wallet
      const hasCached = hasCachedSeed(this.userAddress);
      console.log(`[S5 Seed] Wallet ${this.userAddress} has cached seed: ${hasCached}`);
      
      // Get or generate the seed (will use cache if available)
      this.s5Seed = await getOrGenerateS5Seed(this.signer);
      
      if (!hasCached) {
        console.log('[S5 Seed] Generated new deterministic seed from wallet signature');
      } else {
        console.log('[S5 Seed] Retrieved cached seed (no popup required)');
      }
    } catch (error: any) {
      console.warn('[S5 Seed] Failed to generate deterministic seed:', error);
      
      // Fallback to config or default
      if (this.config.s5Config?.seedPhrase) {
        this.s5Seed = this.config.s5Config.seedPhrase;
        console.log('[S5 Seed] Using seed phrase from config as fallback');
      } else {
        // Use test seed phrase as last resort
        this.s5Seed = 'yield organic score bishop free juice atop village video element unless sneak care rock update';
        console.log('[S5 Seed] Using default test seed phrase as fallback');
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
    
    console.log('Creating JsonRpcProvider with URL:', this.config.rpcUrl);
    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    
    console.log('Creating wallet WITHOUT provider first (for signing)...');
    // Create wallet without provider first (for offline signing)
    const wallet = new ethers.Wallet(privateKey);
    
    console.log('Connecting wallet to provider...');
    this.signer = wallet.connect(this.provider);
    
    console.log('Getting signer address...');
    this.userAddress = await this.signer.getAddress();
    console.log('Got address:', this.userAddress);
    
    // Generate or retrieve S5 seed deterministically
    console.log('Starting S5 seed generation...');
    
    try {
      // Check if we have a cached seed for this wallet
      const hasCached = hasCachedSeed(this.userAddress);
      console.log(`[S5 Seed] Wallet ${this.userAddress} has cached seed: ${hasCached}`);
      
      // Get or generate the seed (will use cache if available)
      this.s5Seed = await getOrGenerateS5Seed(this.signer);
      
      if (!hasCached) {
        console.log('[S5 Seed] Generated new deterministic seed from wallet signature');
      } else {
        console.log('[S5 Seed] Retrieved cached seed (no popup required)');
      }
    } catch (error: any) {
      console.error('[S5 Seed] Failed to generate deterministic seed:', error);
      
      // Fallback to config or default
      if (this.config.s5Config?.seedPhrase) {
        this.s5Seed = this.config.s5Config.seedPhrase;
        console.log('[S5 Seed] Using seed phrase from config as fallback');
      } else {
        // Use test seed phrase as last resort
        this.s5Seed = 'yield organic score bishop free juice atop village video element unless sneak care rock update';
        console.log('[S5 Seed] Using default test seed phrase as fallback');
      }
    }
  }
  
  /**
   * Authenticate with an existing signer (for testing with external wallets)
   */
  private async authenticateWithSigner(signer: ethers.Signer): Promise<void> {
    if (!signer) {
      throw new SDKError('Signer required', 'SIGNER_REQUIRED');
    }
    
    this.signer = signer;
    
    // Get provider from signer if available
    if ('provider' in signer && signer.provider) {
      this.provider = signer.provider as ethers.BrowserProvider | ethers.JsonRpcProvider;
    } else if (this.config.rpcUrl) {
      // Create provider if not available
      this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    } else {
      throw new SDKError('Provider or RPC URL required', 'PROVIDER_REQUIRED');
    }
    
    console.log('Getting signer address...');
    this.userAddress = await this.signer.getAddress();
    console.log('Got address:', this.userAddress);
    
    // Generate or retrieve S5 seed deterministically
    console.log('Starting S5 seed generation...');
    
    try {
      // Check if we have a cached seed for this wallet
      const hasCached = hasCachedSeed(this.userAddress);
      console.log(`[S5 Seed] Wallet ${this.userAddress} has cached seed: ${hasCached}`);
      
      // Get or generate the seed (will use cache if available)
      this.s5Seed = await getOrGenerateS5Seed(this.signer);
      
      if (!hasCached) {
        console.log('[S5 Seed] Generated new deterministic seed from wallet signature');
      } else {
        console.log('[S5 Seed] Retrieved cached seed (no popup required)');
      }
    } catch (error: any) {
      console.error('[S5 Seed] Failed to generate deterministic seed:', error);
      
      // Fallback to config or default
      if (this.config.s5Config?.seedPhrase) {
        this.s5Seed = this.config.s5Config.seedPhrase;
        console.log('[S5 Seed] Using seed phrase from config as fallback');
      } else {
        // Use test seed phrase as last resort
        this.s5Seed = 'yield organic score bishop free juice atop village video element unless sneak care rock update';
        console.log('[S5 Seed] Using default test seed phrase as fallback');
      }
    }
  }
  
  /**
   * Initialize all managers
   */
  private async initializeManagers(): Promise<void> {
    console.log('Creating AuthManager...');
    // Create auth manager - AuthManager doesn't have initialize method
    this.authManager = new AuthManager();
    console.log('AuthManager created');
    
    // Create other managers
    console.log('Creating PaymentManager...');
    this.paymentManager = new PaymentManager(this.contractManager!);
    console.log('PaymentManager created');
    
    console.log('Creating StorageManager...');
    // StorageManager constructor takes s5PortalUrl - don't pass undefined
    const s5PortalUrl = this.config.s5Config?.portalUrl;
    this.storageManager = s5PortalUrl ? new StorageManager(s5PortalUrl) : new StorageManager();
    console.log('StorageManager created');
    
    console.log('Creating SessionManager...');
    this.sessionManager = new SessionManager(this.paymentManager as any, this.storageManager);
    console.log('SessionManager created');

    console.log('Creating TreasuryManager...');
    this.treasuryManager = new TreasuryManager(this.contractManager!);
    console.log('TreasuryManager created');

    // Note: HostManagerEnhanced and ModelManager will be created after authentication
    // when we have a signer available
    
    // Initialize managers that need a signer
    if (this.signer) {
      console.log('Initializing PaymentManager...');
      await (this.paymentManager as any).initialize(this.signer);
      console.log('PaymentManager initialized');
      
      // Initialize storage manager with S5 seed (with timeout protection)
      if (this.s5Seed && this.userAddress) {
        try {
          console.log('Initializing StorageManager...');
          await this.storageManager.initialize(this.s5Seed);
          console.log('StorageManager initialization attempted');
        } catch (error: any) {
          console.warn('StorageManager initialization error:', error.message);
          console.warn('Continuing without S5 storage');
        }
      } else {
        console.log('Skipping StorageManager initialization (no seed or address)');
      }
      
      console.log('Initializing SessionManager...');
      await (this.sessionManager as any).initialize();  // SessionManager doesn't take signer
      console.log('SessionManager initialized');

      // Create and initialize ModelManager and HostManagerEnhanced now that we have a signer
      console.log('Creating ModelManager...');
      const modelRegistryAddress = this.config.contractAddresses?.modelRegistry;
      if (!modelRegistryAddress) {
        throw new SDKError('Model Registry address not configured', 'CONFIG_ERROR');
      }
      this.modelManager = new ModelManager(this.provider!, modelRegistryAddress);
      console.log('ModelManager created');

      console.log('Creating HostManagerEnhanced...');
      const nodeRegistryAddress = this.config.contractAddresses?.nodeRegistry;
      if (!nodeRegistryAddress) {
        throw new SDKError('Node Registry address not configured', 'CONFIG_ERROR');
      }
      const fabTokenAddress = this.config.contractAddresses?.fabToken;
      const hostEarningsAddress = this.config.contractAddresses?.hostEarnings;
      console.log('FAB token address from config:', fabTokenAddress);
      this.hostManager = new HostManagerEnhanced(
        this.signer,
        nodeRegistryAddress,
        this.modelManager,
        fabTokenAddress,
        hostEarningsAddress,
        this.contractManager
      );
      console.log('HostManagerEnhanced created with FAB token:', fabTokenAddress);

      console.log('Initializing HostManagerEnhanced...');
      await (this.hostManager as any).initialize();
      console.log('HostManagerEnhanced initialized');

      // Create ClientManager after ModelManager and HostManagerEnhanced are available
      console.log('Creating ClientManager...');
      this.clientManager = new ClientManager(
        this.modelManager,
        this.hostManager as HostManagerEnhanced,
        this.contractManager!
      );
      console.log('Initializing ClientManager...');
      await this.clientManager.initialize(this.signer);
      console.log('ClientManager initialized');

      console.log('Initializing TreasuryManager...');
      await (this.treasuryManager as any).initialize(this.signer);
      console.log('TreasuryManager initialized');
    }
    
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
   * Get model manager
   */
  getModelManager(): ModelManager {
    this.ensureAuthenticated();
    if (!this.modelManager) {
      throw new SDKError('ModelManager not initialized', 'MANAGER_NOT_INITIALIZED');
    }
    return this.modelManager;
  }

  /**
   * Get client manager
   */
  getClientManager(): ClientManager {
    this.ensureAuthenticated();
    if (!this.clientManager) {
      throw new SDKError('ClientManager not initialized', 'MANAGER_NOT_INITIALIZED');
    }
    return this.clientManager;
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
  getProvider(): ethers.BrowserProvider | ethers.JsonRpcProvider | undefined {
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
    this.modelManager = undefined;
    this.clientManager = undefined;
    this.treasuryManager = undefined;
    
    // Clear auth state
    this.provider = undefined;
    this.signer = undefined;
    this.contractManager = undefined;
    this.authenticated = false;
  }
  
  /**
   * Get chain ID
   */
  getChainId(): number {
    return this.config.chainId || 84532;
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