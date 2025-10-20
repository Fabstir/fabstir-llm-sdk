// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Withdrawal command implementation
 * Handles earnings withdrawal for hosts and treasury
 */

import { Command } from 'commander';
import { getSDK, getAuthenticatedAddress } from '../sdk/client';
import { estimateWithdrawalGas, getGasPrice } from '../withdrawal/gas';
import { processWithdrawal, checkWithdrawableBalance } from '../withdrawal/manager';
import { addWithdrawalRecord } from '../withdrawal/history';
import { ethers } from 'ethers';
import chalk from 'chalk';
import inquirer from 'inquirer';

/**
 * Register the withdraw command with the CLI
 */
export function registerWithdrawCommand(program: Command): void {
  program
    .command('withdraw')
    .description('Withdraw accumulated earnings')
    .option('--amount <amount>', 'Amount to withdraw (in FAB or "all")', 'all')
    .option('--type <type>', 'Type of withdrawal (host or treasury)', 'host')
    .option('--force', 'Skip confirmation prompt')
    .action(async (options) => {
      try {
        await executeWithdraw({
          amount: options.amount,
          type: options.type,
          skipConfirmation: options.force
        });
      } catch (error: any) {
        console.error(chalk.red('❌ Error:'), error.message);
        process.exit(1);
      }
    });
}

/**
 * Withdrawal command options
 */
export interface WithdrawOptions {
  amount: string; // 'all', 'max', or specific amount in ETH
  type?: 'host' | 'treasury';
  skipConfirmation?: boolean;
  maxGasPrice?: string;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Withdrawal result
 */
export interface WithdrawalResult {
  success: boolean;
  available: bigint;
  requestedAmount: bigint;
  actualAmount?: bigint;
  gasEstimate: {
    gasLimit: bigint;
    gasPrice: bigint;
    totalCost: bigint;
  };
  receipt?: any;
  transactionHash?: string;
  error?: string;
  confirmed?: boolean;
  status?: 'pending' | 'confirmed' | 'failed';
  authorized?: boolean;
}

/**
 * Execute withdrawal command
 */
export async function executeWithdraw(options: WithdrawOptions): Promise<WithdrawalResult> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated. Please authenticate first.');
  }

  const address = getAuthenticatedAddress();
  if (!address) {
    throw new Error('No authenticated address');
  }

  try {
    // Determine withdrawal type (default to host)
    const type = options.type || 'host';

    // Check available balance
    const available = await checkWithdrawableBalance(type, address);

    if (available === 0n) {
      return {
        success: false,
        available: 0n,
        requestedAmount: 0n,
        gasEstimate: {
          gasLimit: BigInt(0),
          gasPrice: BigInt(0),
          totalCost: BigInt(0)
        },
        error: 'No earnings available for withdrawal'
      };
    }

    // Parse withdrawal amount
    let requestedAmount: bigint;
    if (options.amount === 'all' || options.amount === 'max') {
      requestedAmount = available;
    } else {
      try {
        requestedAmount = ethers.parseEther(options.amount);
      } catch {
        throw new Error(`Invalid amount format: ${options.amount}`);
      }
    }

    // Validate amount
    if (requestedAmount > available) {
      return {
        success: false,
        available,
        requestedAmount,
        gasEstimate: {
          gasLimit: BigInt(0),
          gasPrice: BigInt(0),
          totalCost: BigInt(0)
        },
        error: `Insufficient balance. Available: ${ethers.formatEther(available)} ETH`
      };
    }

    // Check minimum withdrawal amount (0.001 ETH)
    const minAmount = ethers.parseEther('0.001');
    if (requestedAmount < minAmount && requestedAmount !== available) {
      return {
        success: false,
        available,
        requestedAmount,
        gasEstimate: {
          gasLimit: BigInt(0),
          gasPrice: BigInt(0),
          totalCost: BigInt(0)
        },
        error: `Amount below minimum withdrawal of 0.001 ETH`
      };
    }

    // Estimate gas
    const gasEstimate = await estimateWithdrawalGas(type, requestedAmount, {
      priority: options.priority
    });

    // Show withdrawal details and get confirmation
    console.log(chalk.blue('\n╔════════════════════════════════════════════╗'));
    console.log(chalk.blue('║          WITHDRAWAL DETAILS                ║'));
    console.log(chalk.blue('╚════════════════════════════════════════════╝\n'));

    console.log(chalk.gray(`Type: ${type === 'host' ? 'Host Earnings' : 'Treasury Earnings'}`));
    console.log(chalk.gray(`Available: ${ethers.formatEther(available)} ETH`));
    console.log(chalk.yellow(`Withdrawing: ${ethers.formatEther(requestedAmount)} ETH`));
    console.log(chalk.gray(`Gas Estimate: ${ethers.formatEther(gasEstimate.totalCost)} ETH`));
    console.log(chalk.gray(`Net Amount: ${ethers.formatEther(requestedAmount - gasEstimate.totalCost)} ETH`));

    // Get confirmation unless skipped
    let confirmed = options.skipConfirmation;
    if (!confirmed) {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Do you want to proceed with this withdrawal?',
          default: false
        }
      ]);
      confirmed = answers.confirm;
    }

    if (!confirmed) {
      return {
        success: false,
        available,
        requestedAmount,
        gasEstimate,
        confirmed: false,
        error: 'Withdrawal cancelled by user'
      };
    }

    // Process withdrawal
    console.log(chalk.yellow('\n⏳ Processing withdrawal...'));

    const result = await processWithdrawal(type, requestedAmount, {
      gasLimit: gasEstimate.gasLimit,
      gasPrice: gasEstimate.gasPrice
    });

    if (result.success) {
      console.log(chalk.green('\n✓ Withdrawal successful!'));
      console.log(chalk.gray(`Transaction: ${result.transactionHash}`));
      console.log(chalk.gray(`Amount: ${ethers.formatEther(result.amount)} ETH`));
      console.log(chalk.gray(`Gas Used: ${result.gasUsed}`));

      // Record in history
      await addWithdrawalRecord({
        timestamp: new Date(),
        type,
        amount: result.amount,
        transactionHash: result.transactionHash!,
        status: 'confirmed',
        gasUsed: result.gasUsed,
        gasCost: result.gasUsed ? result.gasUsed * gasEstimate.gasPrice : 0n
      });

      return {
        success: true,
        available,
        requestedAmount,
        actualAmount: result.amount,
        gasEstimate,
        receipt: result.receipt,
        transactionHash: result.transactionHash,
        confirmed: true,
        status: 'confirmed'
      };
    } else {
      console.error(chalk.red('\n✗ Withdrawal failed'));
      console.error(chalk.red(result.error));

      return {
        success: false,
        available,
        requestedAmount,
        gasEstimate,
        error: result.error,
        status: 'failed'
      };
    }
  } catch (error: any) {
    console.error(chalk.red('Error processing withdrawal:'), error.message);
    throw error;
  }
}

/**
 * Withdraw host earnings
 */
export async function withdrawHostEarnings(amount?: bigint): Promise<WithdrawalResult> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const address = getAuthenticatedAddress();
  if (!address) {
    throw new Error('No authenticated address');
  }

  // Check available balance
  const available = await checkWithdrawableBalance('host', address);

  if (available === 0n) {
    return {
      success: false,
      available: 0n,
      requestedAmount: amount || 0n,
      gasEstimate: {
        gasLimit: 0n,
        gasPrice: 0n,
        totalCost: 0n
      },
      error: 'No earnings available for withdrawal'
    };
  }

  const withdrawAmount = amount || available;

  // Process withdrawal
  const result = await processWithdrawal('host', withdrawAmount);

  return {
    success: result.success,
    available,
    requestedAmount: withdrawAmount,
    actualAmount: result.amount,
    gasEstimate: {
      gasLimit: result.gasUsed || 0n,
      gasPrice: 0n,
      totalCost: 0n
    },
    receipt: result.receipt,
    transactionHash: result.transactionHash,
    error: result.error,
    status: result.success ? 'confirmed' : 'failed'
  };
}

/**
 * Withdraw treasury earnings (authorized addresses only)
 */
export async function withdrawTreasuryEarnings(amount?: bigint): Promise<WithdrawalResult> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const address = getAuthenticatedAddress();
  if (!address) {
    throw new Error('No authenticated address');
  }

  // Check if address is authorized for treasury withdrawal
  const treasuryManager = sdk.getTreasuryManager();
  const isAuthorized = await treasuryManager.isTreasuryAdmin?.(address) || false;

  if (!isAuthorized) {
    return {
      success: false,
      available: 0n,
      requestedAmount: amount || 0n,
      gasEstimate: {
        gasLimit: 0n,
        gasPrice: 0n,
        totalCost: 0n
      },
      authorized: false,
      error: 'Not authorized to withdraw treasury funds'
    };
  }

  // Check available balance
  const available = await checkWithdrawableBalance('treasury', address);

  if (available === 0n) {
    return {
      success: false,
      available: 0n,
      requestedAmount: amount || 0n,
      gasEstimate: {
        gasLimit: 0n,
        gasPrice: 0n,
        totalCost: 0n
      },
      authorized: true,
      error: 'No treasury earnings available'
    };
  }

  const withdrawAmount = amount || available;

  // Process withdrawal
  const result = await processWithdrawal('treasury', withdrawAmount);

  return {
    success: result.success,
    available,
    requestedAmount: withdrawAmount,
    actualAmount: result.amount,
    gasEstimate: {
      gasLimit: result.gasUsed || 0n,
      gasPrice: 0n,
      totalCost: 0n
    },
    receipt: result.receipt,
    transactionHash: result.transactionHash,
    authorized: true,
    error: result.error,
    status: result.success ? 'confirmed' : 'failed'
  };
}