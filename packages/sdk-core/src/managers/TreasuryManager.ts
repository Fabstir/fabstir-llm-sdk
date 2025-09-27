/**
 * Browser-compatible Treasury Manager
 * 
 * Handles treasury operations including fees, withdrawals, and admin functions
 */

import { ethers } from 'ethers';
import { ITreasuryManager } from '../interfaces';
import {
  SDKError,
  TreasuryInfo,
  TreasuryTransaction
} from '../types';
import { ContractManager } from '../contracts/ContractManager';

export class TreasuryManager implements ITreasuryManager {
  private contractManager: ContractManager;
  private signer?: ethers.Signer;
  private initialized = false;

  constructor(contractManager: ContractManager) {
    this.contractManager = contractManager;
  }

  /**
   * Initialize with signer
   */
  async initialize(signer: ethers.Signer): Promise<void> {
    this.signer = signer;
    await this.contractManager.setSigner(signer);
    this.initialized = true;
  }

  /**
   * Get treasury information
   */
  async getTreasuryInfo(): Promise<TreasuryInfo> {
    if (!this.initialized) {
      throw new SDKError('TreasuryManager not initialized', 'TREASURY_NOT_INITIALIZED');
    }

    try {
      const jobMarketplaceAddress = await this.contractManager.getContractAddress('jobMarketplace');
      const jobMarketplaceABI = await this.contractManager.getContractABI('jobMarketplace');
      const jobMarketplace = new ethers.Contract(
        jobMarketplaceAddress,
        jobMarketplaceABI,
        this.signer!
      );

      // Get treasury address and fee percentage from contract
      const treasuryAddress = await jobMarketplace.treasuryAddress();
      const feePercentage = await jobMarketplace.TREASURY_FEE_PERCENT();
      
      // Get balances for common tokens
      const usdcAddress = await this.contractManager.getContractAddress('usdcToken');
      const fabAddress = await this.contractManager.getContractAddress('fabToken');
      
      const usdcBalance = await this.getBalance(usdcAddress);
      const fabBalance = await this.getBalance(fabAddress);
      const ethBalance = await this.signer!.provider!.getBalance(treasuryAddress);

      return {
        address: treasuryAddress,
        feePercentage: Number(feePercentage),
        balances: {
          ETH: ethBalance,
          USDC: usdcBalance,
          FAB: fabBalance
        },
        totalFeesCollected: {
          ETH: BigInt(0), // Would need events to track properly
          USDC: BigInt(0),
          FAB: BigInt(0)
        }
      };
    } catch (error: any) {
      throw new SDKError(
        `Failed to get treasury info: ${error.message}`,
        'TREASURY_INFO_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Deposit to treasury
   */
  async deposit(tokenAddress: string, amount: bigint): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('TreasuryManager not initialized', 'TREASURY_NOT_INITIALIZED');
    }

    try {
      // For ETH deposits
      if (tokenAddress === ethers.ZeroAddress) {
        const treasuryInfo = await this.getTreasuryInfo();
        const tx = await this.signer.sendTransaction({
          to: treasuryInfo.address,
          value: amount
        });
        await tx.wait(3); // Wait for 3 confirmations
        return tx.hash;
      }

      // For token deposits
      const tokenABI = [
        'function transfer(address to, uint256 amount) returns (bool)'
      ];
      const token = new ethers.Contract(tokenAddress, tokenABI, this.signer);
      
      const treasuryInfo = await this.getTreasuryInfo();
      const tx = await token.transfer(treasuryInfo.address, amount);
      await tx.wait(3); // Wait for 3 confirmations

      return tx.hash;
    } catch (error: any) {
      throw new SDKError(
        `Failed to deposit to treasury: ${error.message}`,
        'TREASURY_DEPOSIT_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Withdraw from treasury (admin only)
   */
  async withdraw(
    tokenAddress: string,
    amount: bigint,
    recipient: string
  ): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('TreasuryManager not initialized', 'TREASURY_NOT_INITIALIZED');
    }

    try {
      const jobMarketplaceAddress = await this.contractManager.getContractAddress('jobMarketplace');
      const jobMarketplaceABI = await this.contractManager.getContractABI('jobMarketplace');
      const jobMarketplace = new ethers.Contract(
        jobMarketplaceAddress,
        jobMarketplaceABI,
        this.signer!
      );

      // Check if sender is admin
      const senderAddress = await this.signer.getAddress();
      const isAdmin = await this.isAdmin(senderAddress);
      
      if (!isAdmin) {
        throw new SDKError('Only treasury admin can withdraw', 'TREASURY_ADMIN_ONLY');
      }

      // Withdraw through contract
      // Note: withdrawTreasuryTokens sends to the treasury address configured in contract
      const tx = await jobMarketplace.withdrawTreasuryTokens(tokenAddress);
      await tx.wait(3); // Wait for 3 confirmations

      return tx.hash;
    } catch (error: any) {
      if (error instanceof SDKError) throw error;
      throw new SDKError(
        `Failed to withdraw from treasury: ${error.message}`,
        'TREASURY_WITHDRAW_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get treasury balance for a token
   */
  async getBalance(tokenAddress: string): Promise<bigint> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('TreasuryManager not initialized', 'TREASURY_NOT_INITIALIZED');
    }

    try {
      const treasuryInfo = await this.getTreasuryInfo();
      
      // For ETH balance
      if (tokenAddress === ethers.ZeroAddress) {
        return await this.signer.provider!.getBalance(treasuryInfo.address);
      }

      // For token balance
      const tokenABI = [
        'function balanceOf(address account) view returns (uint256)'
      ];
      const token = new ethers.Contract(
        tokenAddress,
        tokenABI,
        this.signer.provider
      );
      
      return await token.balanceOf(treasuryInfo.address);
    } catch (error: any) {
      throw new SDKError(
        `Failed to get treasury balance: ${error.message}`,
        'TREASURY_BALANCE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get fee percentage
   */
  async getFeePercentage(): Promise<number> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('TreasuryManager not initialized', 'TREASURY_NOT_INITIALIZED');
    }

    try {
      const jobMarketplaceAddress = await this.contractManager.getContractAddress('jobMarketplace');
      const jobMarketplaceABI = await this.contractManager.getContractABI('jobMarketplace');
      const jobMarketplace = new ethers.Contract(
        jobMarketplaceAddress,
        jobMarketplaceABI,
        this.signer.provider
      );

      const feePercentage = await jobMarketplace.platformFeePercentage();
      return Number(feePercentage);
    } catch (error: any) {
      throw new SDKError(
        `Failed to get fee percentage: ${error.message}`,
        'TREASURY_FEE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Set fee percentage (admin only)
   */
  async setFeePercentage(percentage: number): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('TreasuryManager not initialized', 'TREASURY_NOT_INITIALIZED');
    }

    if (percentage < 0 || percentage > 10000) {
      throw new SDKError('Fee percentage must be between 0 and 10000', 'INVALID_FEE_PERCENTAGE');
    }

    try {
      const jobMarketplaceAddress = await this.contractManager.getContractAddress('jobMarketplace');
      const jobMarketplaceABI = await this.contractManager.getContractABI('jobMarketplace');
      const jobMarketplace = new ethers.Contract(
        jobMarketplaceAddress,
        jobMarketplaceABI,
        this.signer!
      );

      const tx = await jobMarketplace.setPlatformFeePercentage(percentage);
      await tx.wait(3); // Wait for 3 confirmations

      return tx.hash;
    } catch (error: any) {
      throw new SDKError(
        `Failed to set fee percentage: ${error.message}`,
        'TREASURY_SET_FEE_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(
    limit: number = 100,
    offset: number = 0
  ): Promise<TreasuryTransaction[]> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('TreasuryManager not initialized', 'TREASURY_NOT_INITIALIZED');
    }

    try {
      // This would typically query events from the blockchain
      // For now, returning empty array as events require indexing
      console.warn('Transaction history requires event indexing service');
      return [];
    } catch (error: any) {
      throw new SDKError(
        `Failed to get transaction history: ${error.message}`,
        'TREASURY_HISTORY_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Calculate fee for amount
   */
  calculateFee(amount: bigint): bigint {
    // Assuming 2.5% fee (250 basis points out of 10000)
    const feePercentage = BigInt(250);
    return (amount * feePercentage) / BigInt(10000);
  }

  /**
   * Get total fees collected
   */
  async getTotalFeesCollected(tokenAddress: string): Promise<bigint> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('TreasuryManager not initialized', 'TREASURY_NOT_INITIALIZED');
    }

    try {
      // This would typically sum up fee events
      // For now, returning treasury balance as approximation
      return await this.getBalance(tokenAddress);
    } catch (error: any) {
      throw new SDKError(
        `Failed to get total fees collected: ${error.message}`,
        'TREASURY_FEES_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Check if address is treasury admin
   */
  async isAdmin(address: string): Promise<boolean> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('TreasuryManager not initialized', 'TREASURY_NOT_INITIALIZED');
    }

    try {
      const jobMarketplaceAddress = await this.contractManager.getContractAddress('jobMarketplace');
      const jobMarketplaceABI = await this.contractManager.getContractABI('jobMarketplace');
      const jobMarketplace = new ethers.Contract(
        jobMarketplaceAddress,
        jobMarketplaceABI,
        this.signer.provider
      );

      // Check if address is owner
      const owner = await jobMarketplace.owner();
      return address.toLowerCase() === owner.toLowerCase();
    } catch (error: any) {
      throw new SDKError(
        `Failed to check admin status: ${error.message}`,
        'TREASURY_ADMIN_CHECK_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Add admin (admin only)
   *
   * NOTE: The JobMarketplace contract uses single-owner architecture.
   * Multi-admin functionality is not supported by the current contract.
   * Only the contract owner has administrative privileges.
   */
  async addAdmin(address: string): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('TreasuryManager not initialized', 'TREASURY_NOT_INITIALIZED');
    }

    throw new SDKError(
      'Multi-admin not supported by contract. Only the contract owner has admin privileges',
      'CONTRACT_LIMITATION',
      {
        details: 'The JobMarketplace contract uses Ownable pattern with a single owner. ' +
                 'To change ownership, the contract would need to be upgraded to support ' +
                 'multi-admin functionality or use transferOwnership (if available).'
      }
    );
  }

  /**
   * Remove admin (admin only)
   *
   * NOTE: The JobMarketplace contract uses single-owner architecture.
   * The contract owner cannot be removed, only transferred (if supported).
   */
  async removeAdmin(address: string): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('TreasuryManager not initialized', 'TREASURY_NOT_INITIALIZED');
    }

    // Check if trying to remove the owner
    try {
      const jobMarketplaceAddress = await this.contractManager.getContractAddress('jobMarketplace');
      const jobMarketplaceABI = await this.contractManager.getContractABI('jobMarketplace');
      const jobMarketplace = new ethers.Contract(
        jobMarketplaceAddress,
        jobMarketplaceABI,
        this.signer.provider
      );

      const owner = await jobMarketplace.owner();
      if (address.toLowerCase() === owner.toLowerCase()) {
        throw new SDKError(
          'Multi-admin not supported by contract. The contract owner cannot be removed',
          'CONTRACT_LIMITATION',
          {
            details: 'The contract owner cannot be removed, only ownership can be ' +
                     'transferred using transferOwnership() if available in the contract.'
          }
        );
      }
    } catch (error: any) {
      if (error instanceof SDKError) throw error;
      // If we can't check owner, throw the general error
    }

    throw new SDKError(
      'Multi-admin not supported by contract. Only the contract owner has admin privileges',
      'CONTRACT_LIMITATION',
      {
        details: 'The JobMarketplace contract uses Ownable pattern with a single owner. ' +
                 'There are no other admins to remove.'
      }
    );
  }

  /**
   * Record fees for treasury
   */
  async recordFees(amount: bigint): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('TreasuryManager not initialized', 'TREASURY_NOT_INITIALIZED');
    }

    // Treasury fees are automatically recorded by the JobMarketplace contract
    // during session completion. This is not a user-callable function.
    throw new SDKError(
      'Treasury fees are automatically recorded by the contract during session completion',
      'NOT_USER_CALLABLE'
    );
  }

  /**
   * Withdraw fees from treasury
   */
  async withdrawFees(): Promise<string> {
    if (!this.initialized || !this.signer) {
      throw new SDKError('TreasuryManager not initialized', 'TREASURY_NOT_INITIALIZED');
    }

    try {
      // Get USDC address
      const usdcAddress = await this.contractManager.getContractAddress('usdcToken');
      
      // Check accumulated treasury tokens in the JobMarketplace contract
      const jobMarketplaceAddress = await this.contractManager.getContractAddress('jobMarketplace');
      const jobMarketplaceABI = await this.contractManager.getContractABI('jobMarketplace');
      const jobMarketplace = new ethers.Contract(
        jobMarketplaceAddress,
        jobMarketplaceABI,
        this.signer!
      );
      
      // Get accumulated treasury tokens
      const accumulatedAmount = await jobMarketplace.accumulatedTreasuryTokens(usdcAddress);
      
      if (accumulatedAmount === 0n) {
        throw new SDKError('No accumulated treasury funds to withdraw', 'NO_TREASURY_FUNDS');
      }
      
      // Withdraw treasury tokens (this sends to the configured treasury address)
      const tx = await jobMarketplace.withdrawTreasuryTokens(usdcAddress);
      await tx.wait(3); // Wait for 3 confirmations

      return tx.hash;
    } catch (error: any) {
      if (error instanceof SDKError) throw error;
      throw new SDKError(
        `Failed to withdraw treasury fees: ${error.message}`,
        'TREASURY_WITHDRAWAL_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}