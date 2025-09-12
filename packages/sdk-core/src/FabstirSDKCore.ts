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
  private s5Seed?: string;
  private userAddress?: string;
  
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
        if (!options || !options.privateKey) {
          throw new SDKError('Private key required in options', 'PRIVATE_KEY_MISSING');
        }
        await this.authenticateWithPrivateKey(options.privateKey);
      } else {
        throw new SDKError('Unsupported authentication method', 'AUTH_METHOD_UNSUPPORTED');
      }
      
      this.authenticated = true;
      console.log('Authentication flag set to true');
      
      // Initialize contract manager
      console.log('Creating ContractManager...');
      this.contractManager = new ContractManager(
        this.provider!,
        this.config.contractAddresses!
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
    
    // Generate S5 seed deterministically from signature
    const SEED_MESSAGE = 'Generate S5 seed for Fabstir LLM SDK';
    const signature = await this.signer.signMessage(SEED_MESSAGE);
    
    // Use Web Crypto API to derive seed
    const encoder = new TextEncoder();
    const data = encoder.encode(signature);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // For now, use the seed phrase from config since generating a valid S5 seed phrase
    // from entropy requires using S5's custom wordlist and checksum algorithm
    // S5 uses a 15-word format with its own wordlist, not standard BIP39
    // TODO: Import S5's generatePhrase function to properly derive from entropy
    if (this.config.s5Config?.seedPhrase) {
      this.s5Seed = this.config.s5Config.seedPhrase;
      console.log('Using S5 seed phrase from config');
    } else {
      // Use a valid S5 test seed phrase as fallback
      // This is the seed phrase from .env.test
      this.s5Seed = 'yield organic score bishop free juice atop village video element unless sneak care rock update';
      console.log('Using default S5 seed phrase');
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
    
    // Generate S5 seed deterministically from signature
    console.log('Starting S5 seed generation...');
    const SEED_MESSAGE = 'Generate S5 seed for Fabstir LLM SDK';
    console.log('About to sign message for S5 seed...');
    
    let signature: string;
    try {
      signature = await this.signer.signMessage(SEED_MESSAGE);
      console.log('Message signed successfully');
    } catch (signError: any) {
      console.error('Error signing message:', signError);
      // For testing, just use a deterministic signature based on the private key
      // This avoids network calls
      const wallet = new ethers.Wallet(privateKey);
      signature = await wallet.signMessage(SEED_MESSAGE);
      console.log('Message signed successfully (offline)');
    }
    
    // Use Web Crypto API to derive seed
    const encoder = new TextEncoder();
    const data = encoder.encode(signature);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // For now, use the seed phrase from config since generating a valid S5 seed phrase
    // from entropy requires using S5's custom wordlist and checksum algorithm
    // S5 uses a 15-word format with its own wordlist, not standard BIP39
    // TODO: Import S5's generatePhrase function to properly derive from entropy
    if (this.config.s5Config?.seedPhrase) {
      this.s5Seed = this.config.s5Config.seedPhrase;
      console.log('Using S5 seed phrase from config');
    } else {
      // Use a valid S5 test seed phrase as fallback
      // This is the seed phrase from .env.test
      this.s5Seed = 'yield organic score bishop free juice atop village video element unless sneak care rock update';
      console.log('Using default S5 seed phrase');
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
    this.sessionManager = new SessionManager(this.paymentManager, this.storageManager);
    console.log('SessionManager created');
    
    console.log('Creating HostManager...');
    this.hostManager = new HostManager(this.contractManager!);
    console.log('HostManager created');
    
    console.log('Creating TreasuryManager...');
    this.treasuryManager = new TreasuryManager(this.contractManager!);
    console.log('TreasuryManager created');
    
    // Initialize managers that need a signer
    if (this.signer) {
      console.log('Initializing PaymentManager...');
      await this.paymentManager.initialize(this.signer);
      console.log('PaymentManager initialized');
      
      // Initialize storage manager with S5 seed (with timeout protection)
      if (this.s5Seed && this.userAddress) {
        try {
          console.log('Initializing StorageManager...');
          await this.storageManager.initialize(this.s5Seed, this.userAddress);
          console.log('StorageManager initialization attempted');
        } catch (error: any) {
          console.warn('StorageManager initialization error:', error.message);
          console.warn('Continuing without S5 storage');
        }
      } else {
        console.log('Skipping StorageManager initialization (no seed or address)');
      }
      
      console.log('Initializing SessionManager...');
      await this.sessionManager.initialize();  // SessionManager doesn't take signer
      console.log('SessionManager initialized');
      
      console.log('Initializing HostManager...');
      await this.hostManager.initialize(this.signer);
      console.log('HostManager initialized');
      
      console.log('Initializing TreasuryManager...');
      await this.treasuryManager.initialize(this.signer);
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