// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Treasury Manager Interface
 * Browser-compatible treasury operations
 */

import { TreasuryInfo, TreasuryTransaction } from '../types';

export interface ITreasuryManager {
  /**
   * Get treasury information
   */
  getTreasuryInfo(): Promise<TreasuryInfo>;
  
  /**
   * Deposit to treasury
   */
  deposit(
    tokenAddress: string,
    amount: bigint
  ): Promise<string>;
  
  /**
   * Withdraw from treasury (admin only)
   */
  withdraw(
    tokenAddress: string,
    amount: bigint,
    recipient: string
  ): Promise<string>;
  
  /**
   * Get treasury balance for a token
   */
  getBalance(tokenAddress: string): Promise<bigint>;
  
  /**
   * Get fee percentage
   */
  getFeePercentage(): Promise<number>;
  
  /**
   * Set fee percentage (admin only)
   */
  setFeePercentage(percentage: number): Promise<string>;
  
  /**
   * Get transaction history
   */
  getTransactionHistory(
    limit?: number,
    offset?: number
  ): Promise<TreasuryTransaction[]>;
  
  /**
   * Calculate fee for amount
   */
  calculateFee(amount: bigint): bigint;
  
  /**
   * Get total fees collected
   */
  getTotalFeesCollected(tokenAddress: string): Promise<bigint>;
  
  /**
   * Check if address is treasury admin
   */
  isAdmin(address: string): Promise<boolean>;
  
  /**
   * Add admin (admin only)
   */
  addAdmin(address: string): Promise<string>;
  
  /**
   * Remove admin (admin only)
   */
  removeAdmin(address: string): Promise<string>;
}