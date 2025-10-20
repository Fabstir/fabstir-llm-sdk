// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { AuthManager, BaseAccountProvider, MetaMaskProvider } from '@fabstir/llm-auth';
import type { SDKCredentials, AuthSession } from '@fabstir/llm-auth';

export interface AuthConfig {
  provider: 'base' | 'metamask';
  baseConfig?: {
    appName: string;
    appLogoUrl?: string;
    testnet?: boolean;
  };
}

export class FabstirAuthAdapter {
  private authManager: AuthManager;
  
  constructor() {
    this.authManager = new AuthManager();
  }
  
  async initialize(config: AuthConfig): Promise<void> {
    if (config.provider === 'base') {
      const provider = new BaseAccountProvider(config.baseConfig || {
        appName: 'Fabstir LLM',
        testnet: true
      });
      this.authManager.registerProvider(provider);
    } else if (config.provider === 'metamask') {
      const provider = new MetaMaskProvider();
      this.authManager.registerProvider(provider);
    }
  }
  
  async authenticate(username?: string): Promise<AuthSession> {
    const providers = this.authManager.getAvailableProviders();
    if (providers.length === 0) {
      throw new Error('No authentication provider initialized');
    }
    return this.authManager.authenticate(providers[0], username);
  }
  
  async getCredentials(): Promise<SDKCredentials> {
    if (!this.authManager.isAuthenticated()) {
      throw new Error('Not authenticated');
    }
    return this.authManager.exportForSDK();
  }
  
  isAuthenticated(): boolean {
    return this.authManager.isAuthenticated();
  }
  
  async logout(): Promise<void> {
    return this.authManager.logout();
  }
}
