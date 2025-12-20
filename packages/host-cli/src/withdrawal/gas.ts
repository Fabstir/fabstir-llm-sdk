// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Gas estimation module
 * Handles gas price fetching and cost calculation for withdrawals
 */

import { getSDK } from '../sdk/client';
import { ethers } from 'ethers';

/**
 * Gas estimate structure
 */
export interface GasEstimate {
  gasLimit: bigint;
  gasPrice: bigint;
  totalCost: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  estimatedTime?: {
    blocks: number;
    seconds: number;
  };
  recommended?: {
    gasLimit: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  };
}

/**
 * Gas price options
 */
export interface GasPriceOptions {
  priority?: 'low' | 'normal' | 'high' | 'fast';
  includeEIP1559?: boolean;
}

/**
 * Gas cost breakdown
 */
export interface GasCost {
  wei: bigint;
  eth: string;
  formatted: string;
}

/**
 * Get current gas price
 */
export async function getGasPrice(options: GasPriceOptions = {}): Promise<any> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const provider = sdk.getProvider();
  if (!provider) {
    throw new Error('No provider available');
  }

  try {
    const feeData = await provider.getFeeData();

    if (options.includeEIP1559) {
      return {
        gasPrice: feeData.gasPrice,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
      };
    }

    let gasPrice = feeData.gasPrice || 30000000000n; // 30 gwei default

    // Adjust for priority
    switch (options.priority) {
      case 'low':
        gasPrice = (gasPrice * 80n) / 100n; // 80% of normal
        break;
      case 'high':
      case 'fast':
        gasPrice = (gasPrice * 150n) / 100n; // 150% of normal
        break;
      case 'normal':
      default:
        // Use standard gas price
        break;
    }

    return gasPrice;
  } catch (error) {
    console.debug('Error fetching gas price:', error);
    // Return default gas price
    return 30000000000n; // 30 gwei
  }
}

/**
 * Estimate gas for withdrawal
 */
export async function estimateWithdrawalGas(
  type: 'host' | 'treasury',
  amount: bigint,
  options: {
    buffer?: number;
    priority?: 'low' | 'normal' | 'high';
    optimize?: boolean;
  } = {}
): Promise<GasEstimate> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  // Handle zero amount
  if (amount === 0n) {
    return {
      gasLimit: 0n,
      gasPrice: 0n,
      totalCost: 0n
    };
  }

  try {
    const provider = sdk.getProvider();
    if (!provider) {
      throw new Error('No provider available');
    }

    // Estimate gas for the withdrawal
    // TODO: Implement proper gas estimation via contract
    // ITreasuryManager doesn't have estimateGas method
    const gasEstimate = type === 'host' ? 100000n : 120000n;

    // Apply buffer (default 20%)
    const buffer = options.buffer || 1.2;
    const gasLimit = BigInt(Math.floor(Number(gasEstimate) * buffer));

    // Get gas price based on priority
    const gasPriceData = await getGasPrice({
      priority: options.priority,
      includeEIP1559: true
    });

    const gasPrice = gasPriceData.gasPrice || gasPriceData;
    const totalCost = gasLimit * gasPrice;

    // Calculate estimated confirmation time
    const estimatedTime = getEstimatedConfirmationTime(gasPrice);

    const result: GasEstimate = {
      gasLimit,
      gasPrice,
      totalCost,
      estimatedTime
    };

    // Add EIP-1559 data if available
    if (gasPriceData.maxFeePerGas) {
      result.maxFeePerGas = gasPriceData.maxFeePerGas;
      result.maxPriorityFeePerGas = gasPriceData.maxPriorityFeePerGas;
    }

    // Add optimization recommendations
    if (options.optimize) {
      result.recommended = {
        gasLimit: gasLimit,
        maxFeePerGas: gasPriceData.maxFeePerGas || gasPrice,
        maxPriorityFeePerGas: gasPriceData.maxPriorityFeePerGas || (gasPrice * 10n) / 100n
      };
    }

    return result;
  } catch (error: any) {
    console.error('Error estimating gas:', error);

    // Return fallback values
    const fallbackGasLimit = 150000n;
    const fallbackGasPrice = 30000000000n; // 30 gwei

    return {
      gasLimit: fallbackGasLimit,
      gasPrice: fallbackGasPrice,
      totalCost: fallbackGasLimit * fallbackGasPrice,
      estimatedTime: {
        blocks: 2,
        seconds: 24
      }
    };
  }
}

/**
 * Calculate gas cost breakdown
 */
export function calculateGasCost(gasLimit: bigint, gasPrice: bigint): GasCost {
  const wei = gasLimit * gasPrice;
  const eth = ethers.formatEther(wei);
  const formatted = `${eth} ETH`;

  return {
    wei,
    eth,
    formatted
  };
}

/**
 * Get estimated confirmation time based on gas price
 */
function getEstimatedConfirmationTime(gasPrice: bigint): {
  blocks: number;
  seconds: number;
} {
  // Estimate based on gas price
  let blocks = 1;

  if (gasPrice < 10000000000n) { // < 10 gwei
    blocks = 5;
  } else if (gasPrice < 20000000000n) { // < 20 gwei
    blocks = 3;
  } else if (gasPrice < 50000000000n) { // < 50 gwei
    blocks = 2;
  }

  const seconds = blocks * 12; // ~12 seconds per block on Base

  return {
    blocks,
    seconds
  };
}

/**
 * Compare gas estimates for different priorities
 */
export async function compareGasEstimates(
  type: 'host' | 'treasury',
  amount: bigint
): Promise<{
  low: GasEstimate;
  normal: GasEstimate;
  high: GasEstimate;
}> {
  const [low, normal, high] = await Promise.all([
    estimateWithdrawalGas(type, amount, { priority: 'low' }),
    estimateWithdrawalGas(type, amount, { priority: 'normal' }),
    estimateWithdrawalGas(type, amount, { priority: 'high' })
  ]);

  return {
    low,
    normal,
    high
  };
}

/**
 * Format gas estimate for display
 */
export function formatGasEstimate(estimate: GasEstimate): string {
  const lines: string[] = [];

  lines.push(`Gas Limit: ${estimate.gasLimit.toString()}`);
  lines.push(`Gas Price: ${ethers.formatUnits(estimate.gasPrice, 'gwei')} gwei`);
  lines.push(`Total Cost: ${ethers.formatEther(estimate.totalCost)} ETH`);

  if (estimate.estimatedTime) {
    lines.push(`Estimated Time: ~${estimate.estimatedTime.seconds} seconds (${estimate.estimatedTime.blocks} blocks)`);
  }

  if (estimate.maxFeePerGas) {
    lines.push(`Max Fee: ${ethers.formatUnits(estimate.maxFeePerGas, 'gwei')} gwei`);
    lines.push(`Priority Fee: ${ethers.formatUnits(estimate.maxPriorityFeePerGas!, 'gwei')} gwei`);
  }

  return lines.join('\n');
}

/**
 * Check if gas price is reasonable
 */
export function isGasPriceReasonable(gasPrice: bigint): {
  reasonable: boolean;
  warning?: string;
} {
  // Warning thresholds
  const veryHigh = 200000000000n; // 200 gwei
  const high = 100000000000n; // 100 gwei
  const veryLow = 1000000000n; // 1 gwei

  if (gasPrice > veryHigh) {
    return {
      reasonable: false,
      warning: 'Gas price is extremely high. Consider waiting for lower network congestion.'
    };
  }

  if (gasPrice > high) {
    return {
      reasonable: true,
      warning: 'Gas price is high. You may want to wait for lower fees.'
    };
  }

  if (gasPrice < veryLow) {
    return {
      reasonable: false,
      warning: 'Gas price is very low. Transaction may take a long time to confirm.'
    };
  }

  return {
    reasonable: true
  };
}