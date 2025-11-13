/**
 * SDK Initialization for UI5
 *
 * Provides a centralized SDK instance using the production SDK with real blockchain connectivity.
 * Integrates with Base Sepolia testnet and production LLM nodes.
 */

import { FabstirSDKCore } from '@fabstir/sdk-core';
import { ChainId } from '@fabstir/sdk-core/config';
import type { Signer } from 'ethers';
import type {
  ISessionGroupManager,
  IVectorRAGManager,
  IHostManager,
  IPaymentManager,
  ISessionManager,
  IAuthManager,
} from '@fabstir/sdk-core/interfaces';

export interface SDKManagers {
  sessionGroupManager: ISessionGroupManager;
  sessionManager: ISessionManager;
  vectorRAGManager: IVectorRAGManager;
  hostManager: IHostManager;
  paymentManager: IPaymentManager;
  authManager: IAuthManager;
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
      console.log('[UI5SDK] Already initialized');
      return;
    }

    // Check if initialization is in progress - wait for it to complete
    if (this.initializing) {
      console.log('[UI5SDK] Initialization already in progress, waiting...');
      // Wait for initialization to complete (poll every 100ms, timeout after 10 seconds)
      let waitTime = 0;
      while (this.initializing && waitTime < 10000) {
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
      console.log('[UI5SDK] Initializing SDK with production configuration...');

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
          enableStorage: process.env.NEXT_PUBLIC_S5_ENABLE_STORAGE === 'true',
        },
        encryptionConfig: {
          enabled: process.env.NEXT_PUBLIC_ENABLE_ENCRYPTION === 'true',
        },
      });

      // Authenticate with wallet
      const address = await signer.getAddress();
      console.log('[UI5SDK] Authenticating with address:', address);

      await this.sdk.authenticate('privatekey', {
        signer,  // Pass signer for real transactions
        address  // User address from wallet
      });

      this.initialized = true;
      this.notify(); // Notify all hooks
      console.log('[UI5SDK] SDK initialized successfully');
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

    const sessionManager = await this.sdk.getSessionManager();

    return {
      sessionGroupManager: this.sdk.getSessionGroupManager(),
      sessionManager,
      vectorRAGManager: this.sdk.getVectorRAGManager(),
      hostManager: this.sdk.getHostManager(),
      paymentManager: this.sdk.getPaymentManager(),
      authManager: this.sdk.getAuthManager(),
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
