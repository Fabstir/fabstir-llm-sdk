/**
 * Mock Wallet for UI4 Development
 *
 * Provides a simple localStorage-based wallet simulation for testing
 * the UI without requiring blockchain connectivity.
 */

export interface WalletState {
  address: string | null;
  isConnected: boolean;
}

export class MockWallet {
  private static STORAGE_KEY = 'ui4-mock-wallet-address';
  private address: string | null = null;

  constructor() {
    // Restore connection from localStorage on initialization
    const stored = this.getStoredAddress();
    if (stored) {
      this.address = stored;
    }
  }

  /**
   * Connect wallet - generates a mock address and stores it
   */
  async connect(): Promise<string> {
    if (this.address) {
      return this.address;
    }

    // Generate deterministic mock address
    this.address = this.generateMockAddress();
    this.persistAddress(this.address);

    // Notify all listeners of state change
    this.notifyStateChange();

    return this.address;
  }

  /**
   * Disconnect wallet - clears stored address
   */
  disconnect(): void {
    this.address = null;
    this.clearStoredAddress();

    // Notify all listeners of state change
    this.notifyStateChange();
  }

  /**
   * Get current wallet address
   */
  getAddress(): string | null {
    return this.address;
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this.address !== null;
  }

  /**
   * Get wallet state
   */
  getState(): WalletState {
    return {
      address: this.address,
      isConnected: this.isConnected(),
    };
  }

  // Private helpers

  private generateMockAddress(): string {
    // Use fixed address that matches mock data owner
    return '0x1234567890ABCDEF1234567890ABCDEF12345678';
  }

  private getStoredAddress(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(MockWallet.STORAGE_KEY);
  }

  private persistAddress(address: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(MockWallet.STORAGE_KEY, address);
  }

  private clearStoredAddress(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(MockWallet.STORAGE_KEY);
  }

  private notifyStateChange(): void {
    if (typeof window === 'undefined') return;
    // Dispatch custom event to notify all useWallet hooks of state change
    window.dispatchEvent(
      new CustomEvent('wallet-state-changed', {
        detail: this.getState(),
      })
    );
  }
}

// Singleton instance for use throughout the app
export const mockWallet = new MockWallet();
