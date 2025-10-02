/**
 * SDK Authentication Module
 * Handles authentication logic separate from SDK client
 */

import { FabstirSDKCore } from '@fabstir/sdk-core';
import { getPrivateKey } from './secrets';
import { setConnectionStatus, ConnectionStatus } from './status';
import { EventEmitter } from 'events';

export { initializeSDK, cleanupSDK } from './client';

/**
 * Authentication options
 */
export interface AuthOptions {
  method: 'privatekey' | 'env' | 'signer';
  privateKey?: string;
  signer?: any;
}

/**
 * Authentication state manager
 */
class AuthManager extends EventEmitter {
  private authenticated: boolean = false;
  private authMethod?: string;
  private walletAddress?: string;
  private sdk?: FabstirSDKCore;

  /**
   * Set SDK instance
   */
  setSDK(sdk: FabstirSDKCore): void {
    this.sdk = sdk;
  }

  /**
   * Authenticate with the SDK
   */
  async authenticate(options: AuthOptions): Promise<void> {
    if (!this.sdk) {
      throw new Error('SDK not initialized. Call initializeSDK() first.');
    }

    setConnectionStatus(ConnectionStatus.CONNECTING);

    try {
      let authParams: any;

      switch (options.method) {
        case 'privatekey':
          const privateKey = options.privateKey;
          if (!privateKey) {
            throw new Error('Private key required for privatekey authentication');
          }
          if (!this.isValidPrivateKey(privateKey)) {
            throw new Error('Invalid private key format');
          }
          authParams = { privateKey };
          break;

        case 'env':
          const envKey = process.env.FABSTIR_HOST_PRIVATE_KEY || process.env.TEST_HOST_1_PRIVATE_KEY;
          if (!envKey) {
            throw new Error('FABSTIR_HOST_PRIVATE_KEY not set in environment');
          }
          authParams = { privateKey: envKey };
          break;

        case 'signer':
          if (!options.signer) {
            throw new Error('Signer required for signer authentication');
          }
          authParams = { signer: options.signer };
          break;

        default:
          throw new Error(`Unsupported authentication method: ${options.method}`);
      }

      // Authenticate with SDK
      await this.sdk.authenticate(options.method === 'env' ? 'privatekey' : options.method, authParams);

      // Update auth state
      this.authenticated = this.sdk.isAuthenticated();
      this.authMethod = options.method;

      const signer = this.sdk.getSigner();
      if (signer) {
        this.walletAddress = await signer.getAddress();
      }

      setConnectionStatus(ConnectionStatus.CONNECTED);
      this.emit('authChange', true);

    } catch (error) {
      setConnectionStatus(ConnectionStatus.ERROR, error as Error);
      // Don't update auth state on failure - maintain previous state
      throw error;
    }
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.authenticated && this.sdk?.isAuthenticated() === true;
  }

  /**
   * Get authenticated address
   */
  getAuthenticatedAddress(): string | null {
    return this.isAuthenticated() ? this.walletAddress || null : null;
  }

  /**
   * Get authentication method
   */
  getAuthenticationMethod(): string | undefined {
    return this.authMethod;
  }

  /**
   * Clear authentication
   */
  async clearAuthentication(): Promise<void> {
    this.authenticated = false;
    this.authMethod = undefined;
    this.walletAddress = undefined;

    setConnectionStatus(ConnectionStatus.DISCONNECTED);
    this.emit('authChange', false);
  }

  /**
   * Subscribe to auth changes
   */
  subscribeToAuthChanges(callback: (authenticated: boolean) => void): () => void {
    this.on('authChange', callback);
    return () => this.off('authChange', callback);
  }

  /**
   * Validate private key format
   */
  private isValidPrivateKey(key: string): boolean {
    const cleanKey = key.startsWith('0x') ? key.slice(2) : key;
    return /^[a-fA-F0-9]{64}$/.test(cleanKey);
  }

  /**
   * Reset auth manager
   */
  reset(): void {
    this.authenticated = false;
    this.authMethod = undefined;
    this.walletAddress = undefined;
    this.sdk = undefined;
    this.removeAllListeners();
  }
}

// Singleton instance
let authManager: AuthManager | null = null;

/**
 * Get or create auth manager instance
 */
function getAuthManager(): AuthManager {
  if (!authManager) {
    authManager = new AuthManager();
  }
  return authManager;
}

/**
 * Set SDK instance for auth manager
 */
export function setAuthSDK(sdk: FabstirSDKCore): void {
  getAuthManager().setSDK(sdk);
}

/**
 * Authenticate with the SDK
 */
export async function authenticate(options: AuthOptions): Promise<void> {
  return getAuthManager().authenticate(options);
}

/**
 * Check if authenticated
 */
export function isAuthenticated(): boolean {
  return getAuthManager().isAuthenticated();
}

/**
 * Get authenticated address
 */
export function getAuthenticatedAddress(): string | null {
  return getAuthManager().getAuthenticatedAddress();
}

/**
 * Get authentication method
 */
export function getAuthenticationMethod(): string | undefined {
  return getAuthManager().getAuthenticationMethod();
}

/**
 * Clear authentication
 */
export async function clearAuthentication(): Promise<void> {
  return getAuthManager().clearAuthentication();
}

/**
 * Subscribe to auth changes
 */
export function subscribeToAuthChanges(callback: (authenticated: boolean) => void): () => void {
  return getAuthManager().subscribeToAuthChanges(callback);
}

/**
 * Reset auth manager
 */
export function resetAuth(): void {
  if (authManager) {
    authManager.reset();
    authManager = null;
  }
}