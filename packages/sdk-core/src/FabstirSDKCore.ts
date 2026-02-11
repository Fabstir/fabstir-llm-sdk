// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * FabstirSDKCore - Browser-compatible SDK for Fabstir LLM Marketplace
 *
 * This is the main entry point for browser applications.
 * All functionality is browser-safe with zero Node.js dependencies.
 */

import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import {
  IAuthManager,
  IPaymentManager,
  IStorageManager,
  ISessionManager,
  IHostManager,
  ITreasuryManager
} from './interfaces';
import { IVectorRAGManager } from './managers/interfaces/IVectorRAGManager';
import { IWalletProvider } from './interfaces/IWalletProvider';
import { AuthManager } from './managers/AuthManager';
import { PaymentManager } from './managers/PaymentManager';
import { PaymentManager as PaymentManagerMultiChain } from './managers/PaymentManagerMultiChain';
import { StorageManager } from './managers/StorageManager';
import { SessionManager } from './managers/SessionManager';
import {
  validateRpcUrl,
  validateRequiredAddresses,
  validateOptionalAddress
} from './utils/validation';
import { HostManager } from './managers/HostManager';
import { ModelManager } from './managers/ModelManager';
import { TreasuryManager } from './managers/TreasuryManager';
import { ClientManager } from './managers/ClientManager';
import { EncryptionManager } from './managers/EncryptionManager';
import { VectorRAGManager } from './managers/VectorRAGManager';
import { SessionGroupManager } from './managers/SessionGroupManager';
import { SessionGroupStorage } from './storage/SessionGroupStorage';
import { DEFAULT_RAG_CONFIG } from './rag/config';
import { ContractManager, ContractAddresses } from './contracts/ContractManager';
import { UnifiedBridgeClient } from './services/UnifiedBridgeClient';
import { HostSelectionService } from './services/HostSelectionService';
import { SDKConfig, SDKError } from './types';
import { getOrGenerateS5Seed, hasCachedSeed, cacheSeed, deriveEntropyFromSignature, entropyToS5Phrase, SEED_DOMAIN_SEPARATOR, generateS5SeedFromPrivateKey, generateS5SeedFromAddress } from './utils/s5-seed-derivation';
import { ChainRegistry } from './config/ChainRegistry';
import { ChainId, ChainConfig } from './types/chain.types';
import { UnsupportedChainError } from './errors/ChainErrors';
import { ensureSubAccount, createSubAccountSigner, SubAccountOptions } from './wallet';

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
    // Backend API URL for secure registration (beta.32+ RECOMMENDED for browser apps)
    // Master token stays server-side, client only sends signatures
    // Example: '/api/s5' or 'https://api.example.com/s5'
    authApiUrl?: string;
    // Master token for S5 portal registration (beta.31+)
    // SECURITY WARNING: Only use for server-side apps or testing
    // For browser apps, use authApiUrl instead to keep token server-side
    masterToken?: string;
    // Optional: Pre-cached S5 seed phrase for cross-tab consistency
    // When provided, this seed is used for BOTH S5 identity AND encryption keys
    // This ensures consistent encryption/decryption across all browser tabs
    // If not provided, seed is derived from wallet signature (requires sign popup)
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

  // Host-only mode: Skip S5/Storage/Session initialization (for host CLI operations)
  // When true, only HostManager, ModelManager, and PaymentManager are initialized
  hostOnly?: boolean;
}

export class FabstirSDKCore extends EventEmitter {
  private config: FabstirSDKCoreConfig;
  private provider?: ethers.BrowserProvider | ethers.JsonRpcProvider;
  private signer?: ethers.Signer;
  private contractManager?: ContractManager;
  private bridgeClient?: UnifiedBridgeClient;
  private walletProvider?: IWalletProvider;
  private currentChainId: number;
  
  // Manager instances
  private authManager?: IAuthManager;
  private paymentManager?: IPaymentManager;
  private storageManager?: IStorageManager;
  private sessionManager?: ISessionManager;
  private hostManager?: IHostManager;
  private modelManager?: ModelManager;
  private clientManager?: ClientManager;
  private treasuryManager?: ITreasuryManager;
  private encryptionManager?: EncryptionManager;
  private vectorRAGManager?: IVectorRAGManager;
  private sessionGroupManager?: SessionGroupManager;
  
  private authenticated = false;
  private s5Seed?: string;
  private userAddress?: string;
  private initialized = false;

  constructor(config: FabstirSDKCoreConfig = {}) {
    super();
    this.currentChainId = config.chainId || ChainId.BASE_SEPOLIA;

    // Validate chain ID is supported
    if (!ChainRegistry.isChainSupported(this.currentChainId)) {
      throw new UnsupportedChainError(this.currentChainId, ChainRegistry.getSupportedChains());
    }

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

      smartWallet: config.smartWallet,

      // Host-only mode: Skip S5/Storage/Session initialization
      hostOnly: config.hostOnly
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
  async authenticate(method: 'metamask' | 'privatekey' | 'signer' = 'metamask', options?: any): Promise<void> {
    try {
      if (method === 'metamask') {
        await this.authenticateWithMetaMask();
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

      // Initialize contract manager
      this.contractManager = new ContractManager(
        this.provider!,
        this.config.contractAddresses! as ContractAddresses
      );
      await this.contractManager.setSigner(this.signer!);
      
      // Initialize managers
      await this.initializeManagers();
      
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
   * Authenticate with the initialized wallet provider
   */
  async authenticateWithWallet(): Promise<void> {
    if (!this.walletProvider) {
      throw new SDKError('No wallet provider initialized', 'WALLET_NOT_INITIALIZED');
    }

    if (!this.walletProvider.isConnected()) {
      throw new SDKError('Wallet not connected', 'WALLET_NOT_CONNECTED');
    }

    const address = await this.walletProvider.getAddress();
    this.userAddress = address;

    // VoidSigner cannot sign transactions - it's read-only
    // This is a critical issue that must be fixed
    const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    this.provider = provider;

    // CRITICAL: VoidSigner cannot sign transactions
    // Production code must use a real signer
    throw new SDKError(
      'Cannot create signer from wallet provider. Use authenticateWithPrivateKey or authenticateWithMetaMask for transaction signing',
      'SIGNER_NOT_AVAILABLE'
    );

    this.authenticated = true;

    // Initialize contract manager
    this.contractManager = new ContractManager(
      this.provider,
      this.config.contractAddresses! as ContractAddresses
    );
    await this.contractManager.setSigner(this.signer);

    // Initialize managers
    await this.initializeManagers();
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
    
    // Generate or retrieve S5 seed deterministically (skip in hostOnly mode)
    if (this.config.hostOnly !== true) {
      try {
        // PRIORITY 1: Use provided seedPhrase if available (for cross-tab consistency)
        if (this.config.s5Config?.seedPhrase) {
          console.log('[SDK] Using provided s5Config.seedPhrase for S5 identity');
          this.s5Seed = this.config.s5Config.seedPhrase;
        } else {
          // PRIORITY 2: Check cache first
          const hasCached = hasCachedSeed(this.userAddress);
          if (hasCached) {
            const { getCachedSeed } = await import('./utils/s5-seed-derivation');
            this.s5Seed = getCachedSeed(this.userAddress)!;
            console.log('[SDK] Using cached S5 seed');
          } else {
            // PRIORITY 3: Derive from ADDRESS (not signature) for determinism
            // This survives browser clear since address is always the same
            this.s5Seed = await generateS5SeedFromAddress(this.userAddress, this.config.chainId!);
            console.log('[SDK] Generated S5 seed from wallet address (deterministic, no signature needed)');

            // Cache for faster future lookups
            cacheSeed(this.userAddress, this.s5Seed);
          }
        }
      } catch (error: any) {
        console.warn('[S5 Seed] Failed to generate deterministic seed:', error);

        // No fallbacks in production - seed must be explicitly provided
        throw new SDKError(
          `Failed to generate S5 seed: ${error.message}`,
          'SEED_GENERATION_FAILED'
        );
      }
    } else {
      console.log('[SDK] Host-only mode: Skipping S5 seed generation');
    }
  }


  /**
   * Authenticate with private key (for testing)
   *
   * NOTE: When using private key auth, S5 seed is derived DETERMINISTICALLY
   * from the private key itself, NOT from wallet signatures. This means:
   * - Same private key = Same S5 seed (always, across sessions/devices)
   * - Survives browser data clear
   * - No signature popups required
   */
  private async authenticateWithPrivateKey(privateKey: string): Promise<void> {
    if (!privateKey) {
      throw new SDKError('Private key required', 'PRIVATE_KEY_REQUIRED');
    }

    if (!this.config.rpcUrl) {
      throw new SDKError('RPC URL required for private key auth', 'RPC_URL_REQUIRED');
    }

    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);

    // Create wallet without provider first (for offline signing)
    const wallet = new ethers.Wallet(privateKey);

    this.signer = wallet.connect(this.provider);

    this.userAddress = await this.signer.getAddress();

    // Generate S5 seed DETERMINISTICALLY from private key (skip in hostOnly mode)
    // This is more reliable than signature-based derivation because:
    // 1. 100% deterministic - same key always produces same seed
    // 2. Survives browser data clear
    // 3. Works across devices
    if (this.config.hostOnly !== true) {
      try {
        // PRIORITY 1: Use provided seedPhrase if available (for cross-tab consistency)
        if (this.config.s5Config?.seedPhrase) {
          console.log('[SDK] Using provided s5Config.seedPhrase for S5 identity');
          this.s5Seed = this.config.s5Config.seedPhrase;
        } else {
          // PRIORITY 2: Derive S5 seed deterministically from private key
          // This is the KEY FIX for the "data loss after browser clear" bug
          console.log('[SDK] Deriving S5 seed deterministically from private key...');
          this.s5Seed = await generateS5SeedFromPrivateKey(privateKey);

          // Cache it for consistency with other auth methods
          cacheSeed(this.userAddress, this.s5Seed);
          console.log('[SDK] S5 seed derived and cached (deterministic from private key)');
        }
      } catch (error: any) {
        console.error('[S5 Seed] Failed to derive seed from private key:', error);

        // No fallbacks in production - seed must be explicitly provided
        throw new SDKError(
          `Failed to derive S5 seed from private key: ${error.message}`,
          'SEED_GENERATION_FAILED'
        );
      }
    } else {
      console.log('[SDK] Host-only mode: Skipping S5 seed generation');
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
    
    this.userAddress = await this.signer.getAddress();

    // Generate or retrieve S5 seed deterministically (skip in hostOnly mode)
    if (this.config.hostOnly !== true) {
      try {
        // PRIORITY 1: Use provided seedPhrase if available (for cross-tab consistency)
        if (this.config.s5Config?.seedPhrase) {
          console.log('[SDK] Using provided s5Config.seedPhrase for S5 identity');
          this.s5Seed = this.config.s5Config.seedPhrase;
        } else {
          // PRIORITY 2: Check cache first
          const hasCached = hasCachedSeed(this.userAddress);
          if (hasCached) {
            const { getCachedSeed } = await import('./utils/s5-seed-derivation');
            this.s5Seed = getCachedSeed(this.userAddress)!;
            console.log('[SDK] Using cached S5 seed');
          } else {
            // PRIORITY 3: Derive from ADDRESS (not signature) for determinism
            // Works with ANY signer type: MetaMask, Base Account Kit, WalletConnect, etc.
            this.s5Seed = await generateS5SeedFromAddress(this.userAddress, this.config.chainId!);
            console.log('[SDK] Generated S5 seed from wallet address (deterministic, no signature needed)');

            // Cache for faster future lookups
            cacheSeed(this.userAddress, this.s5Seed);
          }
        }
      } catch (error: any) {
        console.error('[S5 Seed] Failed to generate deterministic seed:', error);

        // No fallbacks in production - seed must be explicitly provided
        throw new SDKError(
          `Failed to generate S5 seed: ${error.message}`,
          'SEED_GENERATION_FAILED'
        );
      }
    } else {
      console.log('[SDK] Host-only mode: Skipping S5 seed generation');
    }
  }

  /**
   * Authenticate with Base Account Kit for popup-free transactions
   *
   * This method:
   * 1. Creates or retrieves a sub-account with spend permissions
   * 2. Creates a custom signer that uses wallet_sendCalls
   * 3. Authenticates the SDK with this signer
   * 4. Caches S5 seed to avoid signature popups
   *
   * @param options Configuration options
   * @returns Sub-account address and whether it was newly created
   */
  async authenticateWithBaseAccount(options: {
    provider: any;           // Base Account Kit provider
    primaryAccount: string;  // Primary smart wallet address
    chainId?: number;        // Override chain ID (defaults to config)
    tokenAddress?: string;   // Token for spend permissions (defaults to USDC)
    tokenDecimals?: number;  // Token decimals (defaults to 6)
    maxAllowance?: string;   // Max allowance in token units (defaults to "1000000")
    periodDays?: number;     // Permission period in days (defaults to 365)
  }): Promise<{
    subAccount: string;
    isNewlyCreated: boolean;
  }> {
    const {
      provider,
      primaryAccount,
      chainId = this.config.chainId!,
      tokenAddress = this.config.contractAddresses?.usdcToken,
      tokenDecimals = 6,
      maxAllowance = '1000000',
      periodDays = 365,
    } = options;

    if (!tokenAddress) {
      throw new SDKError(
        'Token address required for Base Account authentication. Provide tokenAddress or configure contractAddresses.usdcToken',
        'TOKEN_ADDRESS_MISSING'
      );
    }


    // 1. Ensure sub-account exists with spend permissions
    const subAccountResult = await ensureSubAccount(provider, primaryAccount, {
      tokenAddress,
      tokenDecimals,
      maxAllowance,
      periodDays,
    });


    // 2. Pre-cache S5 seed for sub-account derived from PRIMARY account address
    // This ensures each user has their own deterministic S5 identity (data sovereignty)
    // Using address-based derivation: same passkey → same smart wallet → same address → same seed
    // No signature required - works across sessions, browsers, and devices
    const subAccountLower = subAccountResult.address.toLowerCase();
    console.log('[BaseAccount Auth] Sub-account address:', subAccountLower);
    console.log('[BaseAccount Auth] Primary account address:', primaryAccount.toLowerCase());
    if (!hasCachedSeed(subAccountLower)) {
      console.log('[BaseAccount Auth] No cached seed found, deriving from primary account address...');

      // Use shared address-based derivation function for consistency
      // Derive from PRIMARY account address (not sub-account) for data sovereignty
      const seedPhrase = await generateS5SeedFromAddress(primaryAccount, chainId);

      // Cache for sub-account address (used for future lookups)
      cacheSeed(subAccountLower, seedPhrase);
      console.log('[BaseAccount Auth] S5 seed derived and cached for sub-account');
    }

    // 3. Create custom signer that uses wallet_sendCalls
    const customSigner = createSubAccountSigner({
      provider,
      subAccount: subAccountResult.address,
      primaryAccount,
      chainId,
    });


    // 4. Authenticate SDK with the custom signer
    await this.authenticate('signer', { signer: customSigner });


    // 5. Approve JobMarketplace to spend USDC from sub-account
    // This is required for createSessionJob to work
    if (this.config.contractAddresses?.jobMarketplace) {
      try {
        const ethersProvider = new ethers.BrowserProvider(provider);
        const usdcContract = new ethers.Contract(
          tokenAddress,
          ['function approve(address spender, uint256 amount) returns (bool)'],
          customSigner
        );

        // Approve a large amount (effectively unlimited)
        const approvalAmount = ethers.parseUnits(maxAllowance, tokenDecimals);
        const approveTx = await usdcContract.approve(
          this.config.contractAddresses.jobMarketplace,
          approvalAmount
        );
        await approveTx.wait(1);
      } catch (error) {
        console.warn('[BaseAccount Auth] Failed to approve JobMarketplace:', error);
        // Don't throw - approval might already exist or can be done later
      }
    }


    return {
      subAccount: subAccountResult.address,
      isNewlyCreated: !subAccountResult.isExisting,
    };
  }

  /**
   * Initialize all managers
   */
  private async initializeManagers(): Promise<void> {
    // Create auth manager with authenticated data
    this.authManager = new AuthManager(this.signer, this.provider, this.userAddress, this.s5Seed);

    // Create other managers
    // Use PaymentManagerMultiChain for deposit/withdrawal support
    this.paymentManager = new PaymentManagerMultiChain(undefined, this.currentChainId);

    // Host-only mode: Skip S5/Storage/Session/Encryption (for host CLI operations)
    const hostOnly = this.config.hostOnly === true;

    if (!hostOnly) {
      // StorageManager constructor takes s5PortalUrl and auth config
      const s5PortalUrl = this.config.s5Config?.portalUrl;
      const s5AuthApiUrl = this.config.s5Config?.authApiUrl;
      const s5MasterToken = this.config.s5Config?.masterToken;

      // Prefer authApiUrl (secure) over masterToken (exposed)
      if (s5AuthApiUrl) {
        this.storageManager = new StorageManager(
          s5PortalUrl || StorageManager.DEFAULT_S5_PORTAL,
          s5AuthApiUrl,
          true  // isAuthApiUrl = true
        );
      } else {
        this.storageManager = new StorageManager(
          s5PortalUrl || StorageManager.DEFAULT_S5_PORTAL,
          s5MasterToken,
          false  // isAuthApiUrl = false (using masterToken)
        );
      }

    }

    // VectorRAGManager needs userAddress, seedPhrase, config, and sessionManager
    // These will be set after authentication, so we defer initialization

    this.treasuryManager = new TreasuryManager(this.contractManager!);

    // Note: HostManager and ModelManager will be created after authentication
    // when we have a signer available

    // Initialize managers that need a signer
    if (this.signer) {
      await (this.paymentManager as any).initialize(this.signer);

      if (!hostOnly) {
        // Initialize storage manager with S5 seed (optional — not required for inference)
        if (this.s5Seed && this.userAddress) {
          try {
            await this.storageManager!.initialize(this.s5Seed, this.userAddress);
          } catch (storageErr: any) {
            console.warn(`[SDK] StorageManager initialization failed (conversation persistence unavailable): ${storageErr.message}`);
            // Replace with no-op proxy so SessionManager works without storage
            const addr = this.userAddress;
            this.storageManager = new Proxy({} as any, {
              get(_target, prop) {
                if (prop === 'isInitialized') return () => true;
                if (prop === 'getHostSelectionMode') return async () => 'auto';
                if (prop === 'getUserSettings') return async () => ({});
                if (prop === 'getUserAddress') return () => addr;
                if (typeof prop === 'string') return async () => undefined;
                return undefined;
              }
            });
          }
        } else {
          throw new SDKError(
            'S5 seed and user address required for StorageManager initialization',
            'STORAGE_INIT_FAILED'
          );
        }

        // Create SessionManager after storage init (so it gets the proxy if storage failed)
        this.sessionManager = new SessionManager(this.paymentManager as any, this.storageManager);

        // Create EncryptionManager
        // PRIORITY: Use S5 seed for encryption key derivation (ensures cross-tab consistency)
        if (this.s5Seed) {
          const address = await this.signer.getAddress();
          this.encryptionManager = EncryptionManager.fromSeed(this.s5Seed, address);
        } else if (this.signer && 'privateKey' in this.signer) {
          // Fallback: For Wallet instances with direct privateKey access (testing)
          this.encryptionManager = new EncryptionManager(this.signer as ethers.Wallet);
        } else {
          throw new SDKError(
            'S5 seed required for encryption. Ensure wallet can sign messages for seed derivation.',
            'ENCRYPTION_SEED_REQUIRED'
          );
        }

        await (this.sessionManager as any).initialize();  // SessionManager doesn't take signer
      } else {
        console.log('[SDK] Host-only mode: Skipping S5/Storage/Session/Encryption initialization');
      }

      // Create and initialize ModelManager and HostManager now that we have a signer
      const modelRegistryAddress = this.config.contractAddresses?.modelRegistry;
      if (!modelRegistryAddress) {
        throw new SDKError('Model Registry address not configured', 'CONFIG_ERROR');
      }
      this.modelManager = new ModelManager(this.provider!, modelRegistryAddress);

      const nodeRegistryAddress = this.config.contractAddresses?.nodeRegistry;
      if (!nodeRegistryAddress) {
        throw new SDKError('Node Registry address not configured', 'CONFIG_ERROR');
      }
      const fabTokenAddress = this.config.contractAddresses?.fabToken;
      const hostEarningsAddress = this.config.contractAddresses?.hostEarnings;
      this.hostManager = new HostManager(
        this.signer,
        nodeRegistryAddress,
        this.modelManager,
        fabTokenAddress,
        hostEarningsAddress,
        this.contractManager
      );

      await (this.hostManager as any).initialize();

      // NEW: Enable price validation in SessionManager
      if (this.sessionManager) {
        (this.sessionManager as any).setHostManager(this.hostManager);
      }

      // NEW: Enable encryption in SessionManager (if EncryptionManager available)
      if (this.sessionManager && this.encryptionManager) {
        (this.sessionManager as any).setEncryptionManager(this.encryptionManager);
      }

      // NEW: Enable automatic host selection in SessionManager (Phase 5.1)
      if (this.sessionManager && this.hostManager) {
        const hostSelectionService = new HostSelectionService(this.hostManager as HostManager);
        (this.sessionManager as any).setHostSelectionService(hostSelectionService);
      }

      // Create ClientManager after ModelManager and HostManager are available
      this.clientManager = new ClientManager(
        this.modelManager,
        this.hostManager as HostManager,
        this.contractManager!
      );
      await this.clientManager.initialize(this.signer);

      await (this.treasuryManager as any).initialize(this.signer);

      // Initialize VectorRAGManager after authentication (needs userAddress and s5Seed)
      // Skip in hostOnly mode (no S5 storage available)
      if (!hostOnly && this.userAddress && this.s5Seed && this.sessionManager) {
        const ragConfig = {
          ...DEFAULT_RAG_CONFIG,
          s5Portal: this.config.s5Config?.portalUrl || DEFAULT_RAG_CONFIG.s5Portal
        };
        this.vectorRAGManager = new VectorRAGManager({
          userAddress: this.userAddress,
          seedPhrase: this.s5Seed,
          config: ragConfig,
          sessionManager: this.sessionManager as SessionManager,
          s5Client: this.storageManager!.getS5Client(),
          encryptionManager: this.encryptionManager!
        });

        // Initialize SessionGroupManager with S5 storage and retry/reconnect support (v1.4.26+)
        const sessionGroupStorage = new SessionGroupStorage(
          this.storageManager!.getS5Client(),
          this.s5Seed,
          this.userAddress,
          this.encryptionManager,
          this.storageManager  // Pass StorageManager for auto-retry/reconnect
        );

        this.sessionGroupManager = new SessionGroupManager(sessionGroupStorage);
      } else if (!hostOnly) {
        console.warn('VectorRAGManager initialization skipped: missing userAddress or s5Seed');
      }
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
   * Get vector RAG manager for document embeddings and semantic search
   */
  getVectorRAGManager(): IVectorRAGManager {
    this.ensureAuthenticated();
    return this.vectorRAGManager!;
  }

  /**
   * Get session group manager for organizing sessions
   */
  getSessionGroupManager(): SessionGroupManager {
    this.ensureAuthenticated();
    return this.sessionGroupManager!;
  }

  /**
   * Get host's public key for end-to-end encryption.
   *
   * This method:
   * 1. Checks cache first for performance
   * 2. Tries to get public key from host metadata (preferred)
   * 3. Falls back to signature-based recovery if metadata missing
   * 4. Caches the recovered key for future use
   *
   * @param hostAddress - Host's Ethereum address
   * @param hostApiUrl - Optional host API URL (for signature recovery fallback)
   * @returns Compressed secp256k1 public key (33 bytes hex, 66 characters)
   * @throws Error if public key cannot be obtained
   *
   * @example
   * ```typescript
   * // Get public key for encryption
   * const hostPubKey = await sdk.getHostPublicKey(hostAddress);
   *
   * // With explicit API URL for fallback
   * const hostPubKey = await sdk.getHostPublicKey(hostAddress, 'http://host:8080');
   * ```
   */
  async getHostPublicKey(hostAddress: string, hostApiUrl?: string): Promise<string> {
    const hostManager = this.getHostManager();
    return hostManager.getHostPublicKey(hostAddress, hostApiUrl);
  }

  /**
   * Save conversation with optional encryption (Phase 5.3)
   *
   * Convenience method that wraps StorageManager.saveConversation with encryption support.
   *
   * @param conversation - Conversation data to save
   * @param options - Optional encryption options
   * @param options.hostPubKey - Host's public key for encryption (required if encrypt=true)
   * @param options.encrypt - Whether to encrypt the conversation (default: false)
   * @returns Storage result with CID
   *
   * @example
   * ```typescript
   * // Save without encryption
   * const result = await sdk.saveConversation(conversation);
   *
   * // Save with encryption
   * const hostPubKey = await sdk.getHostPublicKey(hostAddress);
   * const result = await sdk.saveConversation(conversation, {
   *   hostPubKey,
   *   encrypt: true
   * });
   * ```
   */
  async saveConversation(
    conversation: any,
    options?: { hostPubKey?: string; encrypt?: boolean }
  ): Promise<any> {
    const storageManager = this.getStorageManager();

    if (options?.encrypt && options.hostPubKey) {
      // Use encrypted storage (Phase 5.1)
      return (storageManager as any).saveConversationEncrypted(conversation, options);
    } else {
      // Use plaintext storage (backward compatible)
      return storageManager.saveConversation(conversation);
    }
  }

  /**
   * Load conversation with automatic decryption (Phase 5.3)
   *
   * Convenience method that wraps StorageManager.loadConversation with automatic
   * decryption support. Tries encrypted first, falls back to plaintext.
   *
   * @param conversationId - Conversation ID to load
   * @returns Conversation data
   *
   * @example
   * ```typescript
   * const conversation = await sdk.loadConversation('conv-123');
   * ```
   */
  async loadConversation(conversationId: string): Promise<any> {
    const storageManager = this.getStorageManager();

    // Try loadConversationWithMetadata first (Phase 5.2) - handles both encrypted and plaintext
    try {
      const result = await (storageManager as any).loadConversationWithMetadata(conversationId);
      return result.conversation;
    } catch (error: any) {
      // Fall back to regular loadConversation for backward compatibility
      return storageManager.loadConversation(conversationId);
    }
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
   * Generate a cryptographically secure seed phrase
   */
  private async generateSecureSeed(): Promise<string> {
    // Generate 16 bytes of entropy (128 bits for 12-word mnemonic)
    const entropy = ethers.randomBytes(16);
    const mnemonic = ethers.Mnemonic.fromEntropy(entropy);
    return mnemonic.phrase;
  }

  /**
   * Validate seed phrase entropy and format
   */
  async validateSeed(): Promise<boolean> {
    if (!this.s5Seed) {
      throw new SDKError('No seed phrase set', 'SEED_MISSING');
    }

    // Check for known test seed
    const knownTestSeed = 'yield organic score bishop free juice atop village video element unless sneak care rock update';
    if (this.s5Seed === knownTestSeed) {
      if (this.config.mode === 'production') {
        throw new SDKError(
          'Test seed phrase not allowed in production mode',
          'WEAK_SEED'
        );
      }
      // Allow test seed in development without further validation
      return true;
    }

    // Validate seed format (12 or 24 words)
    const words = this.s5Seed.split(' ');
    if (words.length !== 12 && words.length !== 24) {
      throw new SDKError(
        'Invalid seed phrase format. Must be 12 or 24 words',
        'INVALID_SEED_FORMAT'
      );
    }

    // Check for weak entropy (all same words)
    const uniqueWords = new Set(words);
    if (uniqueWords.size < words.length * 0.5) {
      throw new SDKError(
        'Weak seed phrase detected. Too many repeated words',
        'WEAK_SEED'
      );
    }

    return true;
  }

  /**
   * Initialize SDK (for testing without wallet provider)
   */
  async initializeForTesting(): Promise<void> {
    if (this.initialized) return;

    // In production, require seed validation
    if (this.config.mode === 'production') {
      if (!this.s5Seed) {
        throw new SDKError(
          'S5 seed required in production mode. Call authenticate() first to derive seed from wallet.',
          'SEED_REQUIRED'
        );
      }

      await this.validateSeed();
    }

    this.initialized = true;
  }

  /**
   * Set S5 seed phrase
   */
  setS5Seed(seed: string): void {
    this.s5Seed = seed;
  }

  /**
   * Get S5 seed (for testing only)
   */
  getS5Seed(): string | undefined {
    return this.s5Seed;
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
    this.vectorRAGManager = undefined;
    
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
   * Initialize SDK with a wallet provider
   */
  async initialize(walletProvider: IWalletProvider): Promise<void> {
    this.walletProvider = walletProvider;

    // Connect wallet to current chain
    await walletProvider.connect(this.currentChainId);

    this.initialized = true;
  }

  /**
   * Check if SDK is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current chain ID
   */
  getCurrentChainId(): number {
    return this.currentChainId;
  }

  /**
   * Get current chain configuration
   */
  getCurrentChain(): ChainConfig {
    return ChainRegistry.getChain(this.currentChainId);
  }

  /**
   * Switch to a different chain
   */
  async switchChain(chainId: number): Promise<void> {
    // Don't switch if already on target chain
    if (this.currentChainId === chainId) {
      return;
    }

    // Validate chain is supported
    if (!ChainRegistry.isChainSupported(chainId)) {
      throw new UnsupportedChainError(chainId, ChainRegistry.getSupportedChains());
    }

    // Check if wallet provider supports chain switching
    if (this.walletProvider) {
      const capabilities = this.walletProvider.getCapabilities();
      if (!capabilities.supportsChainSwitching) {
        throw new Error('Wallet provider does not support chain switching');
      }

      // Switch wallet provider chain
      await this.walletProvider.switchChain(chainId);
    }

    const oldChainId = this.currentChainId;
    this.currentChainId = chainId;
    this.config.chainId = chainId;

    // Reinitialize managers with new chain if authenticated
    if (this.authenticated) {
      await this.reinitializeManagersForChain();
    }

    // Emit chain changed event
    this.emit('chainChanged', {
      oldChainId,
      newChainId: chainId
    });
  }

  /**
   * Reinitialize managers for new chain
   */
  private async reinitializeManagersForChain(): Promise<void> {
    // Get new contract addresses for the chain
    const chainConfig = ChainRegistry.getChain(this.currentChainId);

    // Update contract manager with new addresses
    if (this.contractManager && this.signer) {
      this.contractManager = new ContractManager(this.signer, {
        jobMarketplace: chainConfig.contracts.jobMarketplace,
        nodeRegistry: chainConfig.contracts.nodeRegistry,
        proofSystem: chainConfig.contracts.proofSystem,
        hostEarnings: chainConfig.contracts.hostEarnings,
        usdcToken: chainConfig.contracts.usdcToken,
        fabToken: chainConfig.contracts.fabToken
      });
    }

    // Reinitialize managers that depend on chain-specific contracts
    // They will use the updated contract manager
  }

  /**
   * Check if chain is supported
   */
  isChainSupported(chainId: number): boolean {
    return ChainRegistry.isChainSupported(chainId);
  }

  /**
   * Get list of supported chains
   */
  getSupportedChains(): number[] {
    return ChainRegistry.getSupportedChains();
  }

  /**
   * Get contract addresses for current chain
   */
  getContractAddresses(): any {
    const chainConfig = this.getCurrentChain();
    return chainConfig.contracts;
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