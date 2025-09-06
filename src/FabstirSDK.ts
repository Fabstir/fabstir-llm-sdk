// src/FabstirSDK.ts
import { ethers } from 'ethers';
import { SDKConfig, SDKError } from './types';
import AuthManager, { AuthResult } from './managers/AuthManager';
import PaymentManager from './managers/PaymentManager';
import StorageManager from './managers/StorageManager';
import DiscoveryManager from './managers/DiscoveryManager';
import SessionManager from './managers/SessionManager';
import SmartWalletManager from './managers/SmartWalletManager';

export class FabstirSDK {
  public config: SDKConfig;
  public provider?: ethers.providers.JsonRpcProvider;
  public signer?: ethers.Signer;
  private authManager: AuthManager;
  private authResult?: AuthResult;
  private paymentManager?: PaymentManager;
  private storageManager?: StorageManager;
  private discoveryManager?: DiscoveryManager;
  private sessionManager?: SessionManager;
  private smartWalletManager?: SmartWalletManager;
  
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
  ): Promise<AuthResult> {
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
      
      // Get smart wallet manager from auth manager
      this.smartWalletManager = this.authManager.getSmartWalletManager();
      
      // Auto-deposit USDC if requested
      if (options?.autoDepositUSDC && this.smartWalletManager) {
        await this.smartWalletManager.depositUSDC(options.autoDepositUSDC);
      }
      
      return this.authResult;
    } catch (err: any) {
      const error: SDKError = new Error(`Smart wallet authentication failed: ${err.message}`) as SDKError;
      error.code = 'AUTH_FAILED';
      error.details = err;
      throw error;
    }
  }
  
  // Manager methods - return stubs for now
  getSessionManager(): any {
    return {}; // TODO: Implement SessionManager in later phase
  }
  
  getPaymentManager(): PaymentManager {
    if (!this.authManager.isAuthenticated()) {
      const error: SDKError = new Error('Must authenticate before accessing PaymentManager') as SDKError;
      error.code = 'MANAGER_NOT_AUTHENTICATED';
      throw error;
    }
    
    if (!this.paymentManager) {
      // Load JobMarketplace ABI
      const jobMarketplaceABI = [
        'function createSessionJob(address,uint256,uint256,uint256,uint256) payable returns (uint256)',
        'function createSessionJobWithToken(address,address,uint256,uint256,uint256,uint256) returns (uint256)',
        'function completeSessionJob(uint256) returns (bool)'
      ];
      
      const jobMarketplace = new ethers.Contract(
        this.config.contractAddresses?.jobMarketplace || '',
        jobMarketplaceABI,
        this.provider
      );
      
      this.paymentManager = new PaymentManager(jobMarketplace, this.authManager);
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
}