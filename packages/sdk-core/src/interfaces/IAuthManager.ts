// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Authentication Manager Interface
 * Browser-compatible authentication operations
 */

import { ethers } from 'ethers';
import { AuthResult, AuthOptions, WalletProvider } from '../types';

export interface IAuthManager {
  /**
   * Authenticate with a wallet provider
   */
  authenticate(provider: WalletProvider, options?: AuthOptions): Promise<AuthResult>;
  
  /**
   * Get the current signer
   */
  getSigner(): ethers.Signer;
  
  /**
   * Get the S5 seed for storage
   */
  getS5Seed(): string;
  
  /**
   * Get the user's address
   */
  getUserAddress(): string;
  
  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean;
  
  /**
   * Disconnect and cleanup
   */
  disconnect(): void;
  
  /**
   * Listen for account changes
   */
  onAccountsChanged(callback: (accounts: string[]) => void): () => void;
  
  /**
   * Listen for chain changes
   */
  onChainChanged(callback: (chainId: string) => void): () => void;
}