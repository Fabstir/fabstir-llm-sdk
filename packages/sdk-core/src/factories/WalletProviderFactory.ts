// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { IWalletProvider } from '../interfaces/IWalletProvider';
import { EOAProvider } from '../providers/EOAProvider';
import { SmartAccountProvider } from '../providers/SmartAccountProvider';
import { WalletProviderType, WalletProviderOptions } from '../types/wallet.types';

/**
 * Factory for creating wallet providers based on availability and preferences
 */
export class WalletProviderFactory {
  private static _baseAccountKitAvailable: boolean | undefined;

  static isBaseAccountKitAvailable(): boolean {
    if (this._baseAccountKitAvailable !== undefined) {
      return this._baseAccountKitAvailable;
    }
    try {
      if (typeof require !== 'undefined' && require.resolve) {
        require.resolve('@base-org/account');
        this._baseAccountKitAvailable = true;
      } else {
        this._baseAccountKitAvailable = true; // Assume available in browser
      }
    } catch {
      this._baseAccountKitAvailable = false;
    }
    return this._baseAccountKitAvailable;
  }

  static resetAvailabilityCache(): void {
    this._baseAccountKitAvailable = undefined;
  }

  static detectAvailableProviders(): WalletProviderType[] {
    const providers: WalletProviderType[] = [];

    if (typeof window !== 'undefined' && window.ethereum) {
      if (window.ethereum.isMetaMask) {
        providers.push(WalletProviderType.METAMASK);
      } else if (window.ethereum.isRainbow) {
        providers.push(WalletProviderType.RAINBOW);
      } else {
        providers.push(WalletProviderType.EOA);
      }
    }
    if (this.isBaseAccountKitAvailable()) {
      providers.push(WalletProviderType.BASE_ACCOUNT_KIT);
    }
    return providers;
  }

  static async createProvider(type: WalletProviderType, config?: any): Promise<IWalletProvider> {
    switch (type) {
      case WalletProviderType.METAMASK:
      case WalletProviderType.RAINBOW:
      case WalletProviderType.EOA:
        if (typeof window === 'undefined' || !window.ethereum) {
          throw new Error(`${this.getProviderName(type)} provider not available`);
        }
        return new EOAProvider();

      case WalletProviderType.BASE_ACCOUNT_KIT:
        try {
          return new SmartAccountProvider(config);
        } catch (error) {
          throw new Error('Base Account Kit provider not available');
        }

      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  static async getProvider(options?: WalletProviderOptions): Promise<IWalletProvider> {
    const available = this.detectAvailableProviders();
    if (available.length === 0) throw new Error('No wallet providers available');

    // If priority order specified, try in that order
    if (options?.priority) {
      for (const type of options.priority) {
        if (available.includes(type)) return this.createProvider(type, options?.config);
      }
    }

    // If preferGasless, try smart account first
    if (options?.preferGasless && available.includes(WalletProviderType.BASE_ACCOUNT_KIT)) {
      return this.createProvider(WalletProviderType.BASE_ACCOUNT_KIT, options?.config);
    }

    // Default priority: MetaMask > Rainbow > EOA > Base Account Kit
    const defaultPriority = [
      WalletProviderType.METAMASK,
      WalletProviderType.RAINBOW,
      WalletProviderType.EOA,
      WalletProviderType.BASE_ACCOUNT_KIT
    ];

    for (const type of defaultPriority) {
      if (available.includes(type)) return this.createProvider(type, options?.config);
    }

    throw new Error('No wallet providers available');
  }

  private static getProviderName(type: WalletProviderType): string {
    switch (type) {
      case WalletProviderType.METAMASK:
        return 'MetaMask';
      case WalletProviderType.RAINBOW:
        return 'Rainbow';
      case WalletProviderType.EOA:
        return 'EOA';
      case WalletProviderType.BASE_ACCOUNT_KIT:
        return 'Base Account Kit';
      default:
        return 'Unknown';
    }
  }
}