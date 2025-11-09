/**
 * FabstirSDKCoreMock
 *
 * Mock implementation of FabstirSDKCore for UI development
 * Drop-in replacement that uses localStorage instead of blockchain/S5
 *
 * Usage:
 * ```typescript
 * import { FabstirSDKCoreMock as FabstirSDKCore } from '@fabstir/sdk-core-mock';
 *
 * const sdk = new FabstirSDKCore({
 *   userAddress: '0x1234...'
 * });
 *
 * await sdk.authenticate('password123');
 *
 * const sessionGroupManager = sdk.getSessionGroupManager();
 * const sessionManager = await sdk.getSessionManager();
 * ```
 */

import { SessionGroupManagerMock } from './managers/SessionGroupManager.mock';
import { SessionManagerMock } from './managers/SessionManager.mock';
import { VectorRAGManagerMock } from './managers/VectorRAGManager.mock';
import { HostManagerMock } from './managers/HostManager.mock';
import { PaymentManagerMock } from './managers/PaymentManager.mock';

export interface FabstirSDKCoreMockConfig {
  /**
   * User's Ethereum address (used for mock storage namespacing)
   * Default: '0x1234567890ABCDEF1234567890ABCDEF12345678'
   */
  userAddress?: string;

  /**
   * Chain ID (not used in mock, but kept for interface compatibility)
   */
  chainId?: number;

  /**
   * RPC URL (not used in mock, but kept for interface compatibility)
   */
  rpcUrl?: string;

  /**
   * Contract addresses (not used in mock, but kept for interface compatibility)
   */
  contractAddresses?: Record<string, string>;

  /**
   * Mode (not used in mock, but kept for interface compatibility)
   */
  mode?: 'production' | 'development';
}

export class FabstirSDKCoreMock {
  private config: FabstirSDKCoreMockConfig;
  private userAddress: string;
  private isAuthenticated: boolean = false;

  // Manager instances
  private sessionGroupManager: SessionGroupManagerMock;
  private sessionManager: SessionManagerMock;
  private vectorRAGManager: VectorRAGManagerMock;
  private hostManager: HostManagerMock;
  private paymentManager: PaymentManagerMock;

  constructor(config: FabstirSDKCoreMockConfig = {}) {
    this.config = config;
    this.userAddress = config.userAddress || '0x1234567890ABCDEF1234567890ABCDEF12345678';

    // Initialize all managers
    this.sessionGroupManager = new SessionGroupManagerMock(this.userAddress);
    this.sessionManager = new SessionManagerMock(this.userAddress);
    this.vectorRAGManager = new VectorRAGManagerMock(this.userAddress);
    this.hostManager = new HostManagerMock();
    this.paymentManager = new PaymentManagerMock(this.userAddress);

    console.log('[Mock SDK] Initialized for user:', this.userAddress);
  }

  /**
   * Authenticate with the SDK (auto-succeeds in mock)
   * @param authMethod - Any string (ignored in mock)
   * @param options - Auth options (ignored in mock)
   */
  async authenticate(authMethod: string, options?: any): Promise<void> {
    await this.delay(500);

    this.isAuthenticated = true;
    console.log('[Mock SDK] Authenticated successfully');
  }

  /**
   * Check if SDK is authenticated
   */
  isAuth(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Get the user's address
   */
  getUserAddress(): string {
    return this.userAddress;
  }

  /**
   * Get SessionGroupManager (Projects)
   */
  getSessionGroupManager(): SessionGroupManagerMock {
    this.ensureAuthenticated();
    return this.sessionGroupManager;
  }

  /**
   * Get SessionManager (LLM Sessions)
   */
  async getSessionManager(): Promise<SessionManagerMock> {
    this.ensureAuthenticated();
    await this.delay(100); // Simulate async initialization
    return this.sessionManager;
  }

  /**
   * Get VectorRAGManager (Vector Databases)
   */
  getVectorRAGManager(): VectorRAGManagerMock {
    this.ensureAuthenticated();
    return this.vectorRAGManager;
  }

  /**
   * Get HostManager (Host Discovery)
   */
  getHostManager(): HostManagerMock {
    this.ensureAuthenticated();
    return this.hostManager;
  }

  /**
   * Get PaymentManager (Deposits/Withdrawals)
   */
  getPaymentManager(): PaymentManagerMock {
    this.ensureAuthenticated();
    return this.paymentManager;
  }

  /**
   * Get host public key (mock implementation)
   */
  async getHostPublicKey(hostAddress: string, hostApiUrl?: string): Promise<string> {
    return this.hostManager.getHostPublicKey(hostAddress, hostApiUrl);
  }

  /**
   * Clear all mock data (useful for testing)
   */
  clearAllData(): void {
    if (typeof localStorage !== 'undefined') {
      const keysToDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('fabstir-mock-')) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => localStorage.removeItem(key));
      console.log(`[Mock SDK] Cleared ${keysToDelete.length} mock data items`);
    }
  }

  /**
   * Reset to initial state (clears data and re-initializes with fixtures)
   */
  async reset(): Promise<void> {
    this.clearAllData();

    // Re-initialize managers
    this.sessionGroupManager = new SessionGroupManagerMock(this.userAddress);
    this.sessionManager = new SessionManagerMock(this.userAddress);
    this.vectorRAGManager = new VectorRAGManagerMock(this.userAddress);
    this.hostManager = new HostManagerMock();
    this.paymentManager = new PaymentManagerMock(this.userAddress);

    console.log('[Mock SDK] Reset to initial state with fresh fixtures');
  }

  // Helper Methods

  private ensureAuthenticated(): void {
    if (!this.isAuthenticated) {
      throw new Error('[Mock SDK] Not authenticated. Call authenticate() first.');
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Default export for convenience
export default FabstirSDKCoreMock;
