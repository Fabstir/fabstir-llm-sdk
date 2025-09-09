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
import TreasuryManager from './managers/TreasuryManager';
import { JobMarketplaceABI } from './contracts/abis';

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
  private treasuryManager?: TreasuryManager;
  
  constructor(config: SDKConfig = {}) {
    this.authManager = new AuthManager();
    
    // Require environment variables - no hardcoded addresses
    const jobMarketplace = config.contractAddresses?.jobMarketplace || process.env.CONTRACT_JOB_MARKETPLACE;
    const nodeRegistry = config.contractAddresses?.nodeRegistry || process.env.CONTRACT_NODE_REGISTRY;
    const fabToken = config.contractAddresses?.fabToken || process.env.CONTRACT_FAB_TOKEN;
    const usdcToken = config.contractAddresses?.usdcToken || process.env.CONTRACT_USDC_TOKEN;
    
    if (!jobMarketplace) {
      throw new Error('CONTRACT_JOB_MARKETPLACE not set in environment or config');
    }
    if (!nodeRegistry) {
      throw new Error('CONTRACT_NODE_REGISTRY not set in environment or config');
    }
    if (!fabToken) {
      throw new Error('CONTRACT_FAB_TOKEN not set in environment or config');
    }
    if (!usdcToken) {
      throw new Error('CONTRACT_USDC_TOKEN not set in environment or config');
    }
    
    this.config = {
      rpcUrl: config.rpcUrl || process.env.RPC_URL_BASE_SEPOLIA,
      s5PortalUrl: config.s5PortalUrl || config.s5Config?.portalUrl || process.env.S5_PORTAL_URL,
      contractAddresses: {
        jobMarketplace,
        nodeRegistry,
        fabToken,
        usdcToken
      },
      smartWallet: config.smartWallet,
      s5Config: config.s5Config,
      mode: config.mode
    };
    
    if (!this.config.rpcUrl) {
      throw new Error('RPC_URL_BASE_SEPOLIA not set in environment or config');
    }
    // Only require s5PortalUrl if s5Config.portalUrl is not provided
    if (!this.config.s5PortalUrl && !config.s5Config?.portalUrl) {
      throw new Error('S5_PORTAL_URL not set in environment or config');
    }
  }
  
  private initializeContracts() {
    if (!this.provider) return;
    
    // Initialize JobMarketplace contract with full ABI from file
    this.jobMarketplace = new ethers.Contract(
      this.config.contractAddresses!.jobMarketplace,
      JobMarketplaceABI,
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
   * Get the current signer (either EOA or smart wallet)
   */
  getSigner(): ethers.Signer | undefined {
    return this.signer;
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
      const nodeRegistryAddress = this.config.contractAddresses!.nodeRegistry;
      const fabTokenAddress = this.config.contractAddresses!.fabToken;
      
      this.hostManager = new HostManager(nodeRegistryAddress, fabTokenAddress);
      this.hostManager.setSigner(this.signer!);
    }
    
    return this.hostManager;
  }

  /**
   * Get treasury manager for treasury operations
   */
  getTreasuryManager(): TreasuryManager {
    if (!this.authManager.isAuthenticated()) {
      const error: SDKError = new Error('Must authenticate before accessing TreasuryManager') as SDKError;
      error.code = 'MANAGER_NOT_AUTHENTICATED';
      throw error;
    }
    
    if (!this.treasuryManager) {
      this.treasuryManager = new TreasuryManager(this.authManager);
    }
    
    return this.treasuryManager;
  }

  /**
   * Complete USDC payment flow from approval to completion
   * Convenience method that handles the entire flow
   */
  async completeUSDCFlow(params: {
    hostAddress: string;
    amount: string;
    pricePerToken?: number;
    duration?: number;
    proofInterval?: number;
    tokenAddress?: string;
  }): Promise<{
    jobId: string;
    sessionId: string;
    txHash: string;
    distribution?: any;
  }> {
    try {
      const paymentManager = this.getPaymentManager();
      
      // Use USDC token from environment if not provided
      const usdcAddress = params.tokenAddress || process.env.CONTRACT_USDC_TOKEN;
      if (!usdcAddress) {
        throw new Error('USDC token address not provided and CONTRACT_USDC_TOKEN not set');
      }
      
      // Directly use PaymentManager to create session
      const result = await paymentManager.createUSDCSessionJob(
        params.hostAddress,
        usdcAddress,
        params.amount,
        params.pricePerToken || 2000,
        params.duration || 86400,
        params.proofInterval || 100
      );
      
      // Wait for confirmation
      await paymentManager.verifySessionCreated(result.jobId);
      
      return {
        jobId: result.jobId,
        sessionId: `session-${result.jobId}`,
        txHash: result.txHash
      };
    } catch (error: any) {
      throw new Error(`Failed to complete USDC flow: ${error.message}`);
    }
  }

  /**
   * Get complete session summary including payment details
   */
  async getSessionSummary(jobId: string | number): Promise<{
    sessionDetails: any;
    paymentDistribution: any;
    balances?: any;
  }> {
    try {
      const paymentManager = this.getPaymentManager();
      const sessionManager = await this.getSessionManager();
      
      // Get session details from contract
      const sessionDetails = await paymentManager.getSessionStatus(jobId);
      
      // Get payment distribution
      const paymentDistribution = await sessionManager.getPaymentDistribution(jobId);
      
      // Optionally get current balances
      const addresses = {
        user: await this.signer!.getAddress(),
        host: sessionDetails.host,
        treasury: process.env.TEST_TREASURY_ACCOUNT || process.env.TREASURY_ACCOUNT || ''
      };
      
      let balances;
      try {
        balances = await paymentManager.checkBalances(addresses);
      } catch (error) {
        // Balances are optional
      }
      
      return {
        sessionDetails,
        paymentDistribution,
        balances
      };
    } catch (error: any) {
      throw new Error(`Failed to get session summary: ${error.message}`);
    }
  }

  /**
   * Perform host claim and withdrawal in one operation
   */
  async hostClaimAndWithdraw(jobId: string | number, tokenAddress?: string): Promise<{
    claimSuccess: boolean;
    withdrawalSuccess: boolean;
    amountWithdrawn?: string;
  }> {
    try {
      const hostManager = this.getHostManager();
      const usdcAddress = tokenAddress || process.env.CONTRACT_USDC_TOKEN;
      
      // First claim the payment
      let claimSuccess = false;
      try {
        await hostManager.claimSessionPayment(jobId);
        claimSuccess = true;
      } catch (error: any) {
        console.error(`Claim failed: ${error.message}`);
      }
      
      // Then withdraw accumulated earnings
      let withdrawalSuccess = false;
      let amountWithdrawn = '0';
      
      if (usdcAddress) {
        try {
          const earnings = await hostManager.checkAccumulatedEarnings(usdcAddress);
          if (earnings && earnings.gt(0)) {
            await hostManager.withdrawEarnings(usdcAddress);
            withdrawalSuccess = true;
            amountWithdrawn = ethers.utils.formatUnits(earnings, 6); // Assuming USDC
          }
        } catch (error: any) {
          console.error(`Withdrawal failed: ${error.message}`);
        }
      }
      
      return {
        claimSuccess,
        withdrawalSuccess,
        amountWithdrawn
      };
    } catch (error: any) {
      throw new Error(`Failed to claim and withdraw: ${error.message}`);
    }
  }

  /**
   * Perform treasury withdrawal
   */
  async treasuryWithdraw(tokenAddress?: string): Promise<{
    success: boolean;
    amountWithdrawn?: string;
  }> {
    try {
      const treasuryManager = this.getTreasuryManager();
      const usdcAddress = tokenAddress || process.env.CONTRACT_USDC_TOKEN;
      
      if (!usdcAddress) {
        throw new Error('Token address not provided and CONTRACT_USDC_TOKEN not set');
      }
      
      const balanceBefore = await treasuryManager.getTreasuryBalance(usdcAddress);
      const receipt = await treasuryManager.withdrawTreasuryFees(usdcAddress);
      
      return {
        success: receipt.status === 1,
        amountWithdrawn: ethers.utils.formatUnits(balanceBefore, 6) // Assuming USDC
      };
    } catch (error: any) {
      throw new Error(`Failed to withdraw treasury fees: ${error.message}`);
    }
  }
}