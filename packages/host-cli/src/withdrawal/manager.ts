// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Withdrawal manager module
 * Handles the core logic for processing withdrawals
 */

import { getSDK, getAuthenticatedAddress } from '../sdk/client';
import { ethers } from 'ethers';

/**
 * Withdrawal options
 */
export interface WithdrawalOptions {
  gasLimit?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

/**
 * Withdrawal result
 */
export interface WithdrawalProcessResult {
  success: boolean;
  amount: bigint;
  transactionHash?: string;
  receipt?: ethers.TransactionReceipt;
  gasUsed?: bigint;
  error?: string;
}

/**
 * Check withdrawable balance for host or treasury
 */
export async function checkWithdrawableBalance(
  type: 'host' | 'treasury',
  address: string
): Promise<bigint> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  try {
    // TODO: Implement proper balance checking via HostEarnings contract
    // ITreasuryManager uses getBalance(tokenAddress) not getHostEarnings/getTreasuryBalance
    if (type === 'host') {
      // Host earnings balance - stub until HostEarnings contract integration
      return 0n;
    } else {
      // Treasury balance - stub until proper token address is configured
      return 0n;
    }
  } catch (error) {
    console.debug('Error checking withdrawable balance:', error);
    return 0n;
  }
}

/**
 * Process a withdrawal transaction
 */
export async function processWithdrawal(
  type: 'host' | 'treasury',
  amount: bigint,
  options: WithdrawalOptions = {}
): Promise<WithdrawalProcessResult> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const address = getAuthenticatedAddress();
  if (!address) {
    throw new Error('No authenticated address');
  }

  try {
    const treasuryManager = sdk.getTreasuryManager();

    // Check balance
    const available = await checkWithdrawableBalance(type, address);
    if (amount > available) {
      return {
        success: false,
        amount: 0n,
        error: `Insufficient balance. Available: ${ethers.formatEther(available)} ETH`
      };
    }

    // Prepare transaction options
    const txOptions: any = {};
    if (options.gasLimit) {
      txOptions.gasLimit = options.gasLimit;
    }
    if (options.gasPrice) {
      txOptions.gasPrice = options.gasPrice;
    }
    if (options.maxFeePerGas && options.maxPriorityFeePerGas) {
      txOptions.maxFeePerGas = options.maxFeePerGas;
      txOptions.maxPriorityFeePerGas = options.maxPriorityFeePerGas;
    }

    // Execute withdrawal
    // TODO: Implement proper withdrawal via ITreasuryManager.withdraw(tokenAddress, amount, recipient)
    // The current interface doesn't match host CLI expectations
    return {
      success: false,
      amount: 0n,
      error: 'Withdrawal not yet implemented - ITreasuryManager interface mismatch'
    };

    /* Original code - commented until proper integration
    let tx: ethers.TransactionResponse;

    if (type === 'host') {
      tx = await treasuryManager.withdrawHostEarnings?.(amount, txOptions);
    } else {
      tx = await treasuryManager.withdrawTreasury?.(amount, txOptions);
    }

    if (!tx) {
      return {
        success: false,
        amount: 0n,
        error: 'Failed to create withdrawal transaction'
      };
    }

    // Wait for confirmation
    console.log('Waiting for transaction confirmation...');
    const receipt = await tx.wait(1);

    if (!receipt || receipt.status !== 1) {
      return {
        success: false,
        amount: 0n,
        transactionHash: tx.hash,
        receipt,
        error: 'Transaction failed'
      };
    }

    return {
      success: true,
      amount,
      transactionHash: tx.hash,
      receipt,
      gasUsed: receipt.gasUsed
    };
    */
  } catch (error: any) {
    console.error('Error processing withdrawal:', error);

    // Parse error message
    let errorMessage = 'Withdrawal failed';
    if (error.message) {
      if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for gas';
      } else if (error.message.includes('user rejected')) {
        errorMessage = 'Transaction rejected by user';
      } else if (error.message.includes('nonce')) {
        errorMessage = 'Transaction nonce error';
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      amount: 0n,
      error: errorMessage
    };
  }
}

/**
 * Estimate withdrawal transaction
 */
export async function estimateWithdrawal(
  type: 'host' | 'treasury',
  amount: bigint
): Promise<{
  gasLimit: bigint;
  estimatedCost: bigint;
}> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  try {
    const provider = sdk.getProvider();

    if (!provider) {
      throw new Error('No provider available');
    }

    // Estimate gas for the withdrawal
    // TODO: Implement proper gas estimation via contract
    // ITreasuryManager doesn't have estimateGas method
    const gasEstimate = 100000n; // Default estimate

    // Get current gas price
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || 30000000000n; // 30 gwei default

    // Add 20% buffer to gas estimate
    const gasLimit = (gasEstimate * 120n) / 100n;
    const estimatedCost = gasLimit * gasPrice;

    return {
      gasLimit,
      estimatedCost
    };
  } catch (error) {
    console.debug('Error estimating withdrawal:', error);

    // Return default values
    return {
      gasLimit: 150000n,
      estimatedCost: 4500000000000000n // 0.0045 ETH
    };
  }
}

/**
 * Check if address can withdraw treasury funds
 */
export async function canWithdrawTreasury(address: string): Promise<boolean> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    return false;
  }

  try {
    const treasuryManager = sdk.getTreasuryManager();
    return await treasuryManager.isAdmin(address);
  } catch {
    return false;
  }
}

/**
 * Get withdrawal limits
 */
export async function getWithdrawalLimits(): Promise<{
  minAmount: bigint;
  maxAmount: bigint;
  dailyLimit: bigint;
  remainingDaily: bigint;
}> {
  // These would typically come from the contract
  // For now, return sensible defaults
  return {
    minAmount: ethers.parseEther('0.001'), // 0.001 ETH minimum
    maxAmount: ethers.parseEther('100'), // 100 ETH maximum per transaction
    dailyLimit: ethers.parseEther('500'), // 500 ETH daily limit
    remainingDaily: ethers.parseEther('500') // Full limit available
  };
}

/**
 * Get pending withdrawals
 */
export async function getPendingWithdrawals(address: string): Promise<any[]> {
  // This would query pending withdrawal requests from the contract
  // For now, return empty array
  return [];
}

/**
 * Cancel pending withdrawal
 */
export async function cancelWithdrawal(withdrawalId: string): Promise<boolean> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  try {
    // This would cancel a pending withdrawal request
    // Implementation depends on contract design
    console.log(`Cancelling withdrawal ${withdrawalId}`);
    return true;
  } catch (error) {
    console.error('Error cancelling withdrawal:', error);
    return false;
  }
}

/**
 * Get estimated time for withdrawal processing
 */
export function getEstimatedWithdrawalTime(gasPrice: bigint): {
  blocks: number;
  seconds: number;
  formatted: string;
} {
  // Estimate based on gas price
  // Higher gas price = faster confirmation

  let blocks = 1;
  if (gasPrice < 20000000000n) { // < 20 gwei
    blocks = 3;
  } else if (gasPrice < 50000000000n) { // < 50 gwei
    blocks = 2;
  }

  const seconds = blocks * 12; // ~12 seconds per block on Base
  const formatted = seconds < 60 ? `~${seconds} seconds` : `~${Math.ceil(seconds / 60)} minutes`;

  return {
    blocks,
    seconds,
    formatted
  };
}