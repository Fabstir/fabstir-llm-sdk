// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { ethers } from 'ethers';
import { JobMarketplaceABI } from '../contracts/abis';
import AuthManager from './AuthManager';

/**
 * TreasuryManager handles treasury-related operations for the marketplace
 * Including fee withdrawals and balance management
 */
export default class TreasuryManager {
  private jobMarketplace: ethers.Contract;
  private static readonly USDC_DECIMALS = 6;

  constructor(
    private authManager: AuthManager
  ) {
    // Use centralized ABI import
    const marketplaceAddress = process.env.CONTRACT_JOB_MARKETPLACE;
    
    if (!marketplaceAddress) {
      throw new Error('CONTRACT_JOB_MARKETPLACE environment variable is not set');
    }
    
    const signer = this.authManager.getSigner();
    this.jobMarketplace = new ethers.Contract(marketplaceAddress, JobMarketplaceABI, signer);
  }

  /**
   * Withdraw accumulated treasury fees for a specific token
   * @param tokenAddress The token address to withdraw (USDC or other ERC20)
   * @returns Transaction receipt
   */
  async withdrawTreasuryFees(tokenAddress: string): Promise<ethers.ContractReceipt> {
    try {
      const signer = this.authManager.getSigner();
      const contractWithSigner = this.jobMarketplace.connect(signer);
      
      // Call withdrawTreasuryTokens function
      const tx = await contractWithSigner.withdrawTreasuryTokens(tokenAddress, {
        gasLimit: 200000
      });
      
      const receipt = await tx.wait();
      
      if (receipt.status !== 1) {
        throw new Error('Treasury withdrawal transaction failed');
      }
      
      return receipt;
    } catch (error: any) {
      // Don't throw on "No funds to withdraw" - that's expected sometimes
      if (error.message.includes('No funds to withdraw')) {
        console.log('No treasury funds available to withdraw');
        return { status: 0 } as any;
      }
      throw new Error(`Failed to withdraw treasury fees: ${error.message}`);
    }
  }

  /**
   * Get the current treasury balance for a specific token in the marketplace
   * @param tokenAddress The token address to check balance for
   * @returns Treasury balance as BigNumber
   */
  async getTreasuryBalance(tokenAddress: string): Promise<ethers.BigNumber> {
    try {
      // The contract uses treasuryFees mapping to track accumulated fees
      return await this.jobMarketplace.treasuryFees(tokenAddress);
    } catch (error: any) {
      // If we can't read the balance, return 0
      console.log(`Could not read treasury balance: ${error.message}`);
      return ethers.BigNumber.from(0);
    }
  }

  /**
   * Get the treasury account address from environment
   * @returns Treasury account address
   */
  getTreasuryAccount(): string {
    const treasuryAccount = process.env.TEST_TREASURY_ACCOUNT || process.env.TREASURY_ACCOUNT;
    if (!treasuryAccount) {
      throw new Error('TREASURY_ACCOUNT environment variable is not set');
    }
    return treasuryAccount;
  }

  /**
   * Check if treasury has any withdrawable balance
   * @param tokenAddress The token address to check
   * @returns Boolean indicating if there are funds to withdraw
   */
  async hasWithdrawableBalance(tokenAddress: string): Promise<boolean> {
    try {
      const balance = await this.getTreasuryBalance(tokenAddress);
      return balance && balance.gt(0);
    } catch (error: any) {
      // If we can't check the balance, assume no funds
      return false;
    }
  }

  /**
   * Get formatted treasury balance for display
   * @param tokenAddress The token address to check
   * @returns Formatted balance string
   */
  async getFormattedTreasuryBalance(tokenAddress: string): Promise<string> {
    try {
      const balance = await this.getTreasuryBalance(tokenAddress);
      
      // Determine decimals based on token
      const usdcAddress = process.env.CONTRACT_USDC_TOKEN;
      const decimals = tokenAddress.toLowerCase() === usdcAddress?.toLowerCase() ? 
        TreasuryManager.USDC_DECIMALS : 18;
      
      return ethers.utils.formatUnits(balance, decimals);
    } catch (error: any) {
      throw new Error(`Failed to get formatted treasury balance: ${error.message}`);
    }
  }

  /**
   * Withdraw all available treasury tokens (USDC and potentially others)
   * @returns Object with withdrawal results for each token
   */
  async withdrawAllAvailableTokens(): Promise<{ [token: string]: ethers.ContractReceipt | null }> {
    const results: { [token: string]: ethers.ContractReceipt | null } = {};
    
    // Always try USDC first
    const usdcAddress = process.env.CONTRACT_USDC_TOKEN;
    if (usdcAddress) {
      try {
        const hasBalance = await this.hasWithdrawableBalance(usdcAddress);
        if (hasBalance) {
          results.usdc = await this.withdrawTreasuryFees(usdcAddress);
        } else {
          results.usdc = null;
        }
      } catch (error: any) {
        console.error(`Failed to withdraw USDC: ${error.message}`);
        results.usdc = null;
      }
    }
    
    return results;
  }
}