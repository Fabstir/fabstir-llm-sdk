// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Base Account Kit integration for browser environments
 * Provides seamless wallet connection with sub-account support
 */

export interface BaseAccountConfig {
  appName: string;
  appChainIds: number[];
  enableAutoSpendPermissions?: boolean;
}

export interface SubAccount {
  address: `0x${string}`;
  domain: string;
}

export interface BaseAccountConnection {
  primaryAccount: `0x${string}`;
  subAccount?: `0x${string}`;
  provider: any;
  chainId: number;
}

/**
 * Helper class for Base Account Kit integration
 */
export class BaseAccountHelper {
  private config: BaseAccountConfig;
  private provider: any;
  private primaryAccount?: `0x${string}`;
  private subAccount?: `0x${string}`;

  constructor(config: BaseAccountConfig) {
    this.config = config;
  }

  /**
   * Initialize Base Account SDK
   */
  async initialize(): Promise<void> {
    // Check if Base Account SDK is available
    if (typeof window === 'undefined') {
      throw new Error('Base Account SDK requires browser environment');
    }

    // Import dynamically to avoid build issues
    const { createBaseAccountSDK } = await import('@base-org/account');
    
    const sdk = createBaseAccountSDK({
      appName: this.config.appName,
      appChainIds: this.config.appChainIds,
      subAccounts: {
        unstable_enableAutoSpendPermissions: 
          this.config.enableAutoSpendPermissions ?? false
      }
    });

    this.provider = sdk.getProvider();
    
    // Store provider globally for debugging
    if (typeof window !== 'undefined') {
      (window as any).__baseProvider = this.provider;
    }
  }

  /**
   * Connect to Base Account
   */
  async connect(): Promise<BaseAccountConnection> {
    if (!this.provider) {
      await this.initialize();
    }

    // Request account access
    const accounts = await this.provider.request({
      method: 'eth_requestAccounts',
      params: []
    }) as `0x${string}`[];

    if (accounts.length === 0) {
      throw new Error('No accounts available');
    }

    this.primaryAccount = accounts[0];

    // Get chain ID
    const chainId = await this.provider.request({
      method: 'eth_chainId',
      params: []
    }) as string;

    return {
      primaryAccount: this.primaryAccount,
      provider: this.provider,
      chainId: parseInt(chainId, 16)
    };
  }

  /**
   * Get or create sub-account with auto spend permissions
   */
  async ensureSubAccount(): Promise<`0x${string}`> {
    if (!this.primaryAccount) {
      throw new Error('Not connected. Call connect() first.');
    }

    // Check for existing sub-accounts
    try {
      const response = await this.provider.request({
        method: 'wallet_getSubAccounts',
        params: [{
          account: this.primaryAccount,
          domain: window.location.origin
        }]
      }) as { subAccounts?: SubAccount[] };

      if (response?.subAccounts?.length) {
        this.subAccount = response.subAccounts[0].address;
        return this.subAccount;
      }
    } catch (error) {
      console.log('No existing sub-accounts found');
    }

    // Create new sub-account
    try {
      const created = await this.provider.request({
        method: 'wallet_addSubAccount',
        params: [{
          account: { type: 'create' },
          domain: window.location.origin
        }]
      }) as { address: `0x${string}` };

      this.subAccount = created.address;
      return this.subAccount;
    } catch (error) {
      throw new Error(`Failed to create sub-account: ${error}`);
    }
  }

  /**
   * Execute batch calls using wallet_sendCalls
   */
  async sendCalls(
    calls: Array<{ to: `0x${string}`; data: `0x${string}`; value?: string }>,
    options?: { atomic?: boolean }
  ): Promise<string> {
    if (!this.primaryAccount) {
      throw new Error('Not connected');
    }

    const chainId = await this.provider.request({
      method: 'eth_chainId',
      params: []
    }) as string;

    const response = await this.provider.request({
      method: 'wallet_sendCalls',
      params: [{
        version: '2.0.0',
        chainId,
        from: this.primaryAccount,
        calls,
        capabilities: {
          atomic: { required: options?.atomic ?? false }
        }
      }]
    });

    // Handle different response formats
    return typeof response === 'string' 
      ? response 
      : (response as any).id;
  }

  /**
   * Get status of a batch call
   */
  async getCallsStatus(callId: string): Promise<{
    status: string;
    receipts?: any[];
  }> {
    const response = await this.provider.request({
      method: 'wallet_getCallsStatus',
      params: [callId]
    }) as { status: number | string; receipts?: any[] };

    // Normalize status
    let statusStr: string;
    if (typeof response.status === 'number') {
      statusStr = response.status >= 200 && response.status < 300 
        ? 'CONFIRMED' 
        : 'PENDING';
    } else {
      statusStr = response.status;
    }

    return {
      status: statusStr,
      receipts: response.receipts
    };
  }

  /**
   * Wait for batch call confirmation
   */
  async waitForCallsConfirmation(
    callId: string,
    maxAttempts: number = 30
  ): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const { status } = await this.getCallsStatus(callId);
      
      if (status === 'CONFIRMED' || status.startsWith('2')) {
        return;
      }
      
      if (status === 'FAILED' || status.startsWith('4') || status.startsWith('5')) {
        throw new Error(`Call failed with status: ${status}`);
      }
      
      // Wait 1 second before next attempt
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Call confirmation timeout');
  }

  /**
   * Get current accounts
   */
  getPrimaryAccount(): `0x${string}` | undefined {
    return this.primaryAccount;
  }

  getSubAccount(): `0x${string}` | undefined {
    return this.subAccount;
  }

  /**
   * Get provider for direct access
   */
  getProvider(): any {
    return this.provider;
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.primaryAccount = undefined;
    this.subAccount = undefined;
    this.provider = undefined;
    
    if (typeof window !== 'undefined') {
      delete (window as any).__baseProvider;
    }
  }
}