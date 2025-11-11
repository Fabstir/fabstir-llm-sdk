/**
 * SDK Initialization for UI4
 *
 * Provides a centralized SDK instance using the mock SDK for development.
 * This allows the UI to be developed and tested without blockchain connectivity.
 */

import { FabstirSDKCoreMock } from '@fabstir/sdk-core-mock';
import type {
  ISessionGroupManager,
  IVectorRAGManager,
  IHostManager,
  IPaymentManager,
  ISessionManager,
} from '@fabstir/sdk-core-mock';

export interface SDKManagers {
  sessionGroupManager: ISessionGroupManager;
  sessionManager: ISessionManager;
  vectorRAGManager: IVectorRAGManager;
  hostManager: IHostManager;
  paymentManager: IPaymentManager;
}

export class UI4SDK {
  private sdk: FabstirSDKCoreMock | null = null;
  private initialized = false;
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
   * Initialize SDK with wallet address
   */
  async initialize(walletAddress: string): Promise<void> {
    if (this.initialized && this.sdk) {
      return; // Already initialized
    }

    // Initialize mock SDK
    this.sdk = new FabstirSDKCoreMock({
      mode: 'development' as const,
      userAddress: walletAddress,
    });

    // Authenticate with mock wallet
    await this.sdk.authenticate('mock', { address: walletAddress });

    this.initialized = true;
    this.notify(); // Notify all hooks
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
export const ui4SDK = new UI4SDK();
