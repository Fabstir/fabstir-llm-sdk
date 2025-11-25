/**
 * SDK Initialization for UI5
 *
 * Provides a centralized SDK instance using the production SDK with real blockchain connectivity.
 * Integrates with Base Sepolia testnet and production LLM nodes.
 */

import { FabstirSDKCore, ChainId } from '@fabstir/sdk-core';
import type { Signer } from 'ethers';

// Import manager interfaces - these are type-only imports from SDK core
// Note: Not all manager interfaces may be exported yet from sdk-core
export interface ISessionGroupManager {
  // TODO: Get from @fabstir/sdk-core when exported
  [key: string]: any;
}
export interface IVectorRAGManager {
  // TODO: Get from @fabstir/sdk-core when exported
  [key: string]: any;
}
export interface IHostManager {
  [key: string]: any;
}
export interface IPaymentManager {
  [key: string]: any;
}
export interface ISessionManager {
  [key: string]: any;
}
export interface IAuthManager {
  [key: string]: any;
}

export interface SDKManagers {
  sessionGroupManager: ISessionGroupManager;
  sessionManager: ISessionManager;
  vectorRAGManager: IVectorRAGManager;
  hostManager: IHostManager;
  paymentManager: IPaymentManager;
  authManager: IAuthManager;
  storageManager: any;  // IStorageManager with s5Client property
}

export class UI5SDK {
  private sdk: FabstirSDKCore | null = null;
  private initialized = false;
  private initializing = false; // Lock to prevent concurrent initialization
  private listeners: Set<() => void> = new Set();

  /**
   * Subscribe to SDK initialization events
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of SDK state change
   */
  private notify() {
    this.listeners.forEach(listener => listener());
  }

  /**
   * Initialize SDK with wallet signer
   * @param signer - Ethers signer from wallet (MetaMask, Base Account Kit, etc.)
   */
  async initialize(signer: Signer): Promise<void> {
    // Check if already initialized
    if (this.initialized && this.sdk) {
      console.debug('[UI5SDK] Already initialized');
      return;
    }

    // Check if initialization is in progress - wait for it to complete
    if (this.initializing) {
      console.debug('[UI5SDK] Initialization already in progress, waiting...');
      // Wait for initialization to complete (poll every 100ms, timeout after 30 seconds)
      // Longer timeout needed for S5 storage initialization which can be slow
      let waitTime = 0;
      while (this.initializing && waitTime < 30000) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitTime += 100;
      }

      if (this.initializing) {
        console.error('[UI5SDK] Initialization timeout - forcing reset');
        this.initializing = false;
        throw new Error('SDK initialization timeout');
      } else {
        // Initialization completed by another instance
        return;
      }
    }

    // Set lock to prevent concurrent initialization
    this.initializing = true;

    try {
      // Check for test mode
      const isTestMode = typeof window !== 'undefined' && (window as any).__TEST_WALLET__;
      if (isTestMode) {
        console.debug('[UI5SDK] 🧪 Test mode detected - using test wallet');
      }

      console.debug('[UI5SDK] Initializing SDK with production configuration...');

      // Validate environment variables
      if (!process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA) {
        throw new Error('Missing NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA in environment');
      }
      if (!process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE) {
        throw new Error('Missing contract addresses in environment');
      }

      // Initialize SDK with production configuration
      this.sdk = new FabstirSDKCore({
        mode: 'production' as const,
        chainId: ChainId.BASE_SEPOLIA,
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA,
        contractAddresses: {
          jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!,
          nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY!,
          proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM!,
          hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS!,
          modelRegistry: process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY!,
          usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
          fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN!,
        },
        s5Config: {
          portalUrl: process.env.NEXT_PUBLIC_S5_PORTAL_URL || 'https://s5.cx',
          seedPhrase: process.env.NEXT_PUBLIC_S5_SEED_PHRASE,
        },
        encryptionConfig: {
          enabled: process.env.NEXT_PUBLIC_ENABLE_ENCRYPTION === 'true',
        },
      } as any);

      // Authenticate with wallet signer
      const address = await signer.getAddress();
      const testMode = typeof window !== 'undefined' && (window as any).__TEST_WALLET__;
      console.debug(`[UI5SDK] Authenticating with address: ${address}${testMode ? ' (TEST MODE)' : ''}`);

      console.debug('[UI5SDK] Step 1: About to authenticate...');
      await this.sdk.authenticate('signer', {
        signer  // Pass signer for real transactions
      });
      console.debug('[UI5SDK] Step 1: ✅ Authentication complete');

      // Initialize VectorRAGManager to load existing databases from S5
      console.debug('[UI5SDK] Step 2: About to get VectorRAGManager...');
      const vectorRAGManager = this.sdk.getVectorRAGManager();
      console.debug('[UI5SDK] Step 2: ✅ VectorRAGManager obtained:', !!vectorRAGManager);

      console.debug('[UI5SDK] Step 3: About to call vectorRAGManager.initialize()...');
      await (vectorRAGManager as any).initialize();
      console.debug('[UI5SDK] Step 3: ✅ VectorRAGManager initialized');

      this.initialized = true;
      this.notify(); // Notify all hooks
      console.debug('[UI5SDK] ✅✅✅ SDK initialized successfully');
    } catch (error) {
      console.error('[UI5SDK] Initialization failed:', error);
      this.sdk = null;
      this.initialized = false;
      throw error;
    } finally {
      // Release lock
      this.initializing = false;
    }
  }

  /**
   * Get all managers
   */
  async getManagers(): Promise<SDKManagers> {
    if (!this.sdk || !this.initialized) {
      throw new Error('SDK not initialized. Call initialize() first.');
    }

    return {
      sessionGroupManager: this.sdk.getSessionGroupManager(),
      sessionManager: this.sdk.getSessionManager(),
      vectorRAGManager: this.sdk.getVectorRAGManager(),
      hostManager: this.sdk.getHostManager(),
      paymentManager: this.sdk.getPaymentManager(),
      authManager: this.sdk.getAuthManager(),
      storageManager: this.sdk.getStorageManager(),
    };
  }

  /**
   * Get Session Group Manager
   */
  getSessionGroupManager(): ISessionGroupManager {
    if (!this.sdk || !this.initialized) {
      throw new Error('SDK not initialized. Call initialize() first.');
    }
    return this.sdk.getSessionGroupManager();
  }

  /**
   * Get Session Manager
   */
  async getSessionManager(): Promise<ISessionManager> {
    if (!this.sdk || !this.initialized) {
      throw new Error('SDK not initialized. Call initialize() first.');
    }
    return await this.sdk.getSessionManager();
  }

  /**
   * Get Vector RAG Manager
   */
  getVectorRAGManager(): IVectorRAGManager {
    if (!this.sdk || !this.initialized) {
      throw new Error('SDK not initialized. Call initialize() first.');
    }
    return this.sdk.getVectorRAGManager();
  }

  /**
   * Get Host Manager
   */
  getHostManager(): IHostManager {
    if (!this.sdk || !this.initialized) {
      throw new Error('SDK not initialized. Call initialize() first.');
    }
    return this.sdk.getHostManager();
  }

  /**
   * Get Payment Manager
   */
  getPaymentManager(): IPaymentManager {
    if (!this.sdk || !this.initialized) {
      throw new Error('SDK not initialized. Call initialize() first.');
    }
    return this.sdk.getPaymentManager();
  }

  /**
   * Get Auth Manager
   */
  getAuthManager(): IAuthManager {
    if (!this.sdk || !this.initialized) {
      throw new Error('SDK not initialized. Call initialize() first.');
    }
    return this.sdk.getAuthManager();
  }

  /**
   * Check if SDK is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Disconnect and cleanup SDK
   */
  disconnect(): void {
    this.sdk = null;
    this.initialized = false;
    this.notify(); // Notify all hooks
  }
}

// Singleton instance
export const ui5SDK = new UI5SDK();
