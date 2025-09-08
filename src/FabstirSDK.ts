// src/FabstirSDK.ts
import { ethers } from 'ethers';
import { SDKConfig, SDKError } from './types';
import AuthManager, { AuthResult } from './managers/AuthManager';
import PaymentManager from './managers/PaymentManager';
import StorageManager from './managers/StorageManager';
import DiscoveryManager from './managers/DiscoveryManager';
import SessionManager from './managers/SessionManager';
import SmartWalletManager from './managers/SmartWalletManager';
import InferenceManager from './managers/InferenceManager';
import HostManager from './managers/HostManager';

export class FabstirSDK {
  public config: SDKConfig;
  public provider?: ethers.providers.JsonRpcProvider;
  public signer?: ethers.Signer;
  private authManager: AuthManager;
  private authResult?: AuthResult;
  private jobMarketplace?: ethers.Contract;
  private paymentManager?: PaymentManager;
  private storageManager?: StorageManager;
  private discoveryManager?: DiscoveryManager;
  private sessionManager?: SessionManager;
  private smartWalletManager?: SmartWalletManager;
  private inferenceManager?: InferenceManager;
  private hostManager?: HostManager;
  
  constructor(config: SDKConfig = {}) {
    this.authManager = new AuthManager();
    this.config = {
      rpcUrl: config.rpcUrl || process.env.RPC_URL_BASE_SEPOLIA || 
        'https://base-sepolia.g.alchemy.com/v2/demo',
      s5PortalUrl: config.s5PortalUrl || process.env.S5_PORTAL_URL || 
        'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p',
      contractAddresses: config.contractAddresses ? {
        ...config.contractAddresses,
        fabToken: config.contractAddresses.fabToken || process.env.CONTRACT_FAB_TOKEN ||
          '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
        usdcToken: config.contractAddresses.usdcToken || process.env.CONTRACT_USDC_TOKEN ||
          '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      } : {
        jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE || 
          '0xD937c594682Fe74E6e3d06239719805C04BE804A',
        nodeRegistry: process.env.CONTRACT_NODE_REGISTRY || 
          '0x87516C13Ea2f99de598665e14cab64E191A0f8c4',
        fabToken: process.env.CONTRACT_FAB_TOKEN ||
          '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
        usdcToken: process.env.CONTRACT_USDC_TOKEN ||
          '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      },
      smartWallet: config.smartWallet
    };
  }
  
  private initializeContracts() {
    if (!this.provider) return;
    
    // Initialize JobMarketplace contract
    const jobMarketplaceABI = [
      'function createSessionJob(address,uint256,uint256,uint256,uint256) payable returns (uint256)',
      'function createSessionJobWithToken(address,address,uint256,uint256,uint256,uint256) returns (uint256)',
      'function completeSessionJob(uint256) returns (bool)',
      'function getJob(uint256) view returns (tuple(address,address,uint256,uint256,uint256,uint256,uint256,uint256,string,bool))'
    ];
    
    this.jobMarketplace = new ethers.Contract(
      this.config.contractAddresses?.jobMarketplace || '',
      jobMarketplaceABI,
      this.provider
    );
  }
  
  
  async authenticate(privateKey: string): Promise<AuthResult> {
    if (!privateKey || privateKey.length === 0) {
      const error: SDKError = new Error('Private key is required') as SDKError;
      error.code = 'AUTH_INVALID_KEY';
      throw error;
    }
    
    try {
      this.authResult = await this.authManager.authenticate('private-key', {
        privateKey,
        rpcUrl: this.config.rpcUrl
      });
      
      this.signer = this.authResult.signer;
      this.provider = (this.signer as any).provider;
      
      // Initialize JobMarketplace contract after authentication
      this.initializeContracts();
      
      return this.authResult;
    } catch (err: any) {
      const error: SDKError = new Error(`Authentication failed: ${err.message}`) as SDKError;
      error.code = 'AUTH_FAILED';
      error.details = err;
      throw error;
    }
  }
  
  /**
   * Convenience method for authenticating with Base Account Kit smart wallet
   * Enables gasless transactions via paymaster and USDC-only operations
   */
  async authenticateWithSmartWallet(
    privateKey: string,
    options?: {
      sponsorDeployment?: boolean;
      autoDepositUSDC?: string;
    }
  ): Promise<AuthResult & { smartWalletAddress: string; eoaAddress: string; isDeployed: boolean }> {
    if (!privateKey || privateKey.length === 0) {
      const error: SDKError = new Error('Private key is required') as SDKError;
      error.code = 'AUTH_INVALID_KEY';
      throw error;
    }
    
    try {
      // Authenticate with smart wallet enabled
      this.authResult = await this.authManager.authenticate('private-key', {
        privateKey,
        rpcUrl: this.config.rpcUrl,
        useSmartWallet: true,
        sponsorDeployment: options?.sponsorDeployment ?? true, // Default to gasless
        paymasterUrl: this.config.smartWallet?.paymasterUrl
      });
      
      this.signer = this.authResult.signer;
      this.provider = (this.signer as any).provider;
      
      // Initialize JobMarketplace contract after authentication
      this.initializeContracts();
      
      // Get smart wallet manager from auth manager
      this.smartWalletManager = this.authManager.getSmartWalletManager();
      
      // Get smart wallet info
      const smartWalletAddress = this.smartWalletManager?.getSmartWalletAddress() || this.authResult.userAddress;
      const eoaAddress = this.smartWalletManager?.getEOAAddress() || this.authResult.eoaAddress || this.authResult.userAddress;
      const isDeployed = await this.smartWalletManager?.isDeployed() || false;
      
      // Auto-deposit USDC if requested
      if (options?.autoDepositUSDC && this.smartWalletManager) {
        await this.smartWalletManager.depositUSDC(options.autoDepositUSDC);
      }
      
      // Return enhanced result with smart wallet details
      return {
        ...this.authResult,
        smartWalletAddress,
        eoaAddress,
        isDeployed
      };
    } catch (err: any) {
      const error: SDKError = new Error(`Smart wallet authentication failed: ${err.message}`) as SDKError;
      error.code = 'AUTH_FAILED';
      error.details = err;
      throw error;
    }
  }
  
  // Manager methods
  getSessionManager(): SessionManager {
    if (!this.authResult || !this.signer) {
      throw new Error('Must authenticate before accessing SessionManager');
    }
    if (!this.sessionManager) {
      this.sessionManager = new SessionManager(
        this.jobMarketplace!,
        this.authManager,
        this.storageManager
      );
    }
    return this.sessionManager;
  }
  
  getPaymentManager(): PaymentManager {
    if (!this.authManager.isAuthenticated()) {
      const error: SDKError = new Error('Must authenticate before accessing PaymentManager') as SDKError;
      error.code = 'MANAGER_NOT_AUTHENTICATED';
      throw error;
    }
    
    if (!this.paymentManager) {
      if (!this.jobMarketplace) {
        throw new Error('Contracts not initialized. Call authenticate() first.');
      }
      this.paymentManager = new PaymentManager(this.jobMarketplace, this.authManager);
    }
    
    return this.paymentManager;
  }
  
  async getStorageManager(): Promise<StorageManager> {
    if (!this.authManager.isAuthenticated()) {
      const error: SDKError = new Error('Must authenticate before accessing StorageManager') as SDKError;
      error.code = 'MANAGER_NOT_AUTHENTICATED';
      throw error;
    }
    
    if (!this.storageManager) {
      this.storageManager = new StorageManager(this.config.s5PortalUrl);
      await this.storageManager.initialize(this.authManager);
    }
    
    return this.storageManager;
  }
  
  getDiscoveryManager(): DiscoveryManager {
    if (!this.authManager.isAuthenticated()) {
      const error: SDKError = new Error('Must authenticate before accessing DiscoveryManager') as SDKError;
      error.code = 'MANAGER_NOT_AUTHENTICATED';
      throw error;
    }
    
    if (!this.discoveryManager) {
      this.discoveryManager = new DiscoveryManager(this.authManager);
    }
    
    return this.discoveryManager;
  }
  
  async getSessionManager(): Promise<SessionManager> {
    if (!this.authManager.isAuthenticated()) {
      const error: SDKError = new Error('Must authenticate before using SessionManager') as SDKError;
      error.code = 'MANAGER_NOT_AUTHENTICATED';
      throw error;
    }
    
    if (!this.sessionManager) {
      // Ensure all required managers are initialized
      const paymentManager = this.getPaymentManager();
      const storageManager = await this.getStorageManager();
      const discoveryManager = this.getDiscoveryManager();
      
      this.sessionManager = new SessionManager(
        this.authManager,
        paymentManager,
        storageManager,
        discoveryManager
      );
    }
    
    return this.sessionManager;
  }

  async getInferenceManager(): Promise<InferenceManager> {
    if (!this.authManager.isAuthenticated()) {
      const error: SDKError = new Error('Must authenticate before using InferenceManager') as SDKError;
      error.code = 'MANAGER_NOT_AUTHENTICATED';
      throw error;
    }
    
    if (!this.inferenceManager) {
      // Get session manager to ensure it's initialized
      const sessionManager = await this.getSessionManager();
      
      // Create inference manager with discovery URL and S5 config from SDK config
      this.inferenceManager = new InferenceManager(
        this.authManager,
        sessionManager,
        this.config.discoveryUrl || 'http://localhost:3003',
        this.config.s5Config
      );
    }
    
    return this.inferenceManager;
  }
  
  /**
   * Get smart wallet manager for direct smart wallet operations
   * Only available after authenticating with smart wallet
   */
  getSmartWalletManager(): SmartWalletManager | undefined {
    return this.authManager.getSmartWalletManager();
  }
  
  /**
   * Check if currently using a smart wallet
   */
  isUsingSmartWallet(): boolean {
    return this.authManager.isUsingSmartWallet();
  }
  
  /**
   * Get host manager for host registration and staking operations
   */
  getHostManager(): HostManager {
    if (!this.authManager.isAuthenticated()) {
      const error: SDKError = new Error('Must authenticate before accessing HostManager') as SDKError;
      error.code = 'MANAGER_NOT_AUTHENTICATED';
      throw error;
    }
    
    if (!this.hostManager) {
      const nodeRegistryAddress = this.config.contractAddresses?.nodeRegistry || 
        process.env.CONTRACT_NODE_REGISTRY || 
        '0x039AB5d5e8D5426f9963140202F506A2Ce6988F9';
      const fabTokenAddress = this.config.contractAddresses?.fabToken || 
        process.env.CONTRACT_FAB_TOKEN || 
        '0xC78949004B4EB6dEf2D66e49Cd81231472612D62';
      
      this.hostManager = new HostManager(nodeRegistryAddress, fabTokenAddress);
      this.hostManager.setSigner(this.signer!);
    }
    
    return this.hostManager;
  }
}