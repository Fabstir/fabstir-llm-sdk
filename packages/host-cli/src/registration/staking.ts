// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Staking operations module
 * Handles FAB token staking for host registration
 */

import { getSDK, getAuthenticatedAddress } from '../sdk/client';
import { getFABBalance } from '../balance/checker';
import { RegistrationError, ErrorCode } from './errors';
import { ethers } from 'ethers';
import { DEFAULT_PRICE_PER_TOKEN, DEFAULT_PRICE_PER_TOKEN_NUMBER, MAX_PRICE_PER_TOKEN } from '@fabstir/sdk-core';

/**
 * Staking configuration
 */
export interface StakingConfig {
  amount: bigint;
  models: string[];
  apiUrl: string;
  metadata?: Record<string, any>;
  minPricePerTokenNative: string;   // Native token pricing (ETH/BNB) in wei
  minPricePerTokenStable: string;   // Stablecoin pricing (USDC) in raw units
  gasLimit?: number;
  gasPrice?: bigint;
  estimateOnly?: boolean;
}

/**
 * Staking result
 */
export interface StakingResult {
  success: boolean;
  transactionHash: string;
  stakedAmount: bigint;
  blockNumber?: number;
  gasUsed?: bigint;
}

/**
 * Approval options
 */
export interface ApprovalOptions {
  confirmations?: number;
}

/**
 * Get staking requirements
 */
export function getStakingRequirements(): {
  minimumStake: bigint;
  contractAddress: string;
} {
  // Get contract address from environment variable
  const contractAddress = process.env.CONTRACT_NODE_REGISTRY || '';

  return {
    minimumStake: 1000000000000000000000n, // 1000 FAB
    contractAddress
  };
}

/**
 * Check current token allowance
 */
export async function checkAllowance(): Promise<bigint> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const address = getAuthenticatedAddress();
  if (!address) {
    throw new Error('No authenticated address');
  }

  try {
    const paymentManager = sdk.getPaymentManager();
    const fabTokenAddress = process.env.CONTRACT_FAB_TOKEN || '';
    const spenderAddress = getStakingRequirements().contractAddress;

    // Use SDK PaymentManager instead of direct contract calls
    // checkAllowance(owner, spender, tokenAddress)
    const allowance = await paymentManager.checkAllowance(
      address,
      spenderAddress,
      fabTokenAddress
    );

    return allowance;
  } catch (error: any) {
    throw new RegistrationError(
      `Failed to check allowance: ${error.message}`,
      ErrorCode.ALLOWANCE_CHECK_FAILED,
      { originalError: error }
    );
  }
}

/**
 * Approve FAB tokens for staking
 */
export async function approveTokens(
  amount: bigint,
  options: ApprovalOptions = {}
): Promise<{
  success: boolean;
  transactionHash: string;
  skipped?: boolean;
  message?: string;
  confirmations?: number;
  blockNumber?: number;
}> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const address = getAuthenticatedAddress();
  if (!address) {
    throw new Error('No authenticated address');
  }

  try {
    // Check current allowance
    const currentAllowance = await checkAllowance();

    if (currentAllowance >= amount) {
      return {
        success: true,
        transactionHash: '',
        skipped: true,
        message: 'Tokens already approved'
      };
    }

    // Check balance
    const balance = await getFABBalance();
    if (balance < amount) {
      throw new RegistrationError(
        `Insufficient FAB balance. Required: ${ethers.formatUnits(amount, 18)}, Available: ${ethers.formatUnits(balance, 18)}`,
        ErrorCode.INSUFFICIENT_BALANCE,
        { required: amount, available: balance }
      );
    }

    // Execute approval using SDK PaymentManager
    const paymentManager = sdk.getPaymentManager();
    const fabTokenAddress = process.env.CONTRACT_FAB_TOKEN || '';
    const spenderAddress = getStakingRequirements().contractAddress;

    // Use SDK method instead of direct contract calls
    // approveToken(spender, amount, tokenAddress)
    const receipt = await paymentManager.approveToken(
      spenderAddress,
      amount,
      fabTokenAddress
    );

    return {
      success: true,
      transactionHash: receipt.hash,
      confirmations: receipt.confirmations,
      blockNumber: receipt.blockNumber
    };
  } catch (error: any) {
    if (error instanceof RegistrationError) {
      throw error;
    }

    throw new RegistrationError(
      `Token approval failed: ${error.message}`,
      ErrorCode.APPROVAL_FAILED,
      { originalError: error }
    );
  }
}

/**
 * Check staked amount for a host
 */
export async function checkStakedAmount(): Promise<bigint> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const address = getAuthenticatedAddress();
  if (!address) {
    throw new Error('No authenticated address');
  }

  try {
    const hostManager = sdk.getHostManager();

    try {
      const hostInfo = await hostManager.getHostInfo?.(address) ||
                       await hostManager.getHostStatus?.(address);

      const stake = hostInfo?.stake || 0n;
      // Ensure we return a bigint
      if (typeof stake === 'string') {
        return BigInt(stake);
      }
      if (typeof stake === 'number') {
        return BigInt(stake);
      }
      return stake;
    } catch {
      // Host not registered
      return 0n;
    }
  } catch (error: any) {
    throw new RegistrationError(
      `Failed to check staked amount: ${error.message}`,
      ErrorCode.STATUS_CHECK_FAILED,
      { originalError: error }
    );
  }
}

/**
 * Stake FAB tokens and register as host
 */
export async function stakeTokens(config: StakingConfig): Promise<StakingResult> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const address = getAuthenticatedAddress();
  if (!address) {
    throw new Error('No authenticated address');
  }

  try {
    // Validate stake amount
    const requirements = getStakingRequirements();
    if (config.amount < requirements.minimumStake) {
      throw new RegistrationError(
        `Stake amount below minimum. Required: ${ethers.formatUnits(requirements.minimumStake, 18)} FAB`,
        ErrorCode.STAKE_TOO_LOW,
        { required: requirements.minimumStake, provided: config.amount }
      );
    }

    // Check balance
    const balance = await getFABBalance();
    if (balance < config.amount) {
      throw new RegistrationError(
        `Insufficient FAB balance for staking`,
        ErrorCode.INSUFFICIENT_BALANCE,
        { required: config.amount, available: balance }
      );
    }

    // Check if already staked
    const currentStake = await checkStakedAmount();
    if (currentStake > 0n) {
      // For estimate only mode, just warn instead of throwing
      if (!config.estimateOnly) {
        throw new RegistrationError(
          'Host already has staked tokens',
          ErrorCode.ALREADY_REGISTERED,
          { currentStake }
        );
      }
    }

    // If estimate only, return gas estimate
    if (config.estimateOnly) {
      const hostManager = sdk.getHostManager();
      // Estimate gas for registration
      const estimatedGas = BigInt(500000); // Typical gas for registration
      const provider = sdk.getProvider();
      if (!provider) {
        throw new Error('Provider not available');
      }
      const feeData = await provider.getFeeData();
      const gasPrice = config.gasPrice || feeData.gasPrice || ethers.parseUnits('0.001', 'gwei');

      return {
        success: false,
        transactionHash: '',
        stakedAmount: 0n,
        estimatedGas,
        estimatedCost: estimatedGas * gasPrice
      } as any;
    }

    // Execute registration with staking
    const hostManager = sdk.getHostManager();

    // Validate dual pricing fields (no fallbacks - fail fast)
    if (!config.minPricePerTokenNative || !config.minPricePerTokenStable) {
      throw new RegistrationError(
        `Missing required pricing fields: minPricePerTokenNative, minPricePerTokenStable`,
        ErrorCode.VALIDATION_FAILED,
        { native: config.minPricePerTokenNative, stable: config.minPricePerTokenStable }
      );
    }

    // Validate stable pricing range (10-100,000)
    const stablePriceNum = parseInt(config.minPricePerTokenStable);
    if (isNaN(stablePriceNum) || stablePriceNum < 10 || stablePriceNum > 100000) {
      throw new RegistrationError(
        `minPricePerTokenStable must be between 10 and 100000, got ${config.minPricePerTokenStable}`,
        ErrorCode.VALIDATION_FAILED,
        { stablePrice: config.minPricePerTokenStable }
      );
    }

    // Validate native pricing range (2,272,727,273 to 22,727,272,727,273 wei)
    const nativePriceBigInt = BigInt(config.minPricePerTokenNative);
    const minNativePrice = BigInt('2272727273');
    const maxNativePrice = BigInt('22727272727273');
    if (nativePriceBigInt < minNativePrice || nativePriceBigInt > maxNativePrice) {
      throw new RegistrationError(
        `minPricePerTokenNative must be between ${minNativePrice} and ${maxNativePrice} wei, got ${config.minPricePerTokenNative}`,
        ErrorCode.VALIDATION_FAILED,
        { nativePrice: config.minPricePerTokenNative }
      );
    }

    // Parse model strings to ModelSpec format
    // Supports "repo:file" or "repo/file" format, defaults to common HuggingFace repo
    const supportedModels = config.models.map(modelStr => {
      if (modelStr.includes(':')) {
        const [repo, file] = modelStr.split(':');
        return { repo, file };
      } else if (modelStr.includes('/')) {
        // If it's "org/repo/file", split appropriately
        const parts = modelStr.split('/');
        if (parts.length >= 3) {
          return {
            repo: `${parts[0]}/${parts[1]}`,
            file: parts.slice(2).join('/')
          };
        }
        // If just "repo/file"
        const [repo, file] = modelStr.split('/');
        return { repo, file };
      } else {
        // Default to common HuggingFace repo for backwards compatibility
        return {
          repo: 'TheBloke/tiny-vicuna-1B-GGUF',
          file: modelStr
        };
      }
    });

    // Construct HostMetadata from config
    const metadata = {
      hardware: {
        gpu: config.metadata?.hardware?.gpu || 'NVIDIA RTX 4090',
        vram: config.metadata?.hardware?.vram || 24,
        ram: config.metadata?.hardware?.ram || 64
      },
      capabilities: config.metadata?.capabilities || ['streaming'],
      location: config.metadata?.location || 'us-east-1',
      maxConcurrent: config.metadata?.maxConcurrent || 5,
      costPerToken: config.metadata?.costPerToken || 0.0001
    };

    // Register host with models using correct SDK signature (DUAL PRICING)
    console.log('[staking.ts] Calling registerHostWithModels with dual pricing:', {
      native: config.minPricePerTokenNative,
      stable: config.minPricePerTokenStable
    });
    const txHash = await hostManager.registerHostWithModels({
      metadata,
      apiUrl: config.apiUrl,
      supportedModels,
      minPricePerTokenNative: config.minPricePerTokenNative,  // Native pricing (ETH/BNB) in wei
      minPricePerTokenStable: config.minPricePerTokenStable   // Stable pricing (USDC) in raw units
    });

    // SDK already waits for transaction confirmation and returns hash
    return {
      success: true,
      transactionHash: txHash,
      stakedAmount: config.amount
    };
  } catch (error: any) {
    if (error instanceof RegistrationError) {
      throw error;
    }

    throw new RegistrationError(
      `Staking failed: ${error.message}`,
      ErrorCode.STAKING_FAILED,
      { originalError: error }
    );
  }
}

/**
 * Withdraw staked tokens (only if host is inactive)
 */
export async function withdrawStake(amount?: bigint): Promise<{
  success: boolean;
  transactionHash: string;
  withdrawnAmount: bigint;
}> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const address = getAuthenticatedAddress();
  if (!address) {
    throw new Error('No authenticated address');
  }

  try {
    const hostManager = sdk.getHostManager();

    // Check if host is active
    const hostInfo = await hostManager.getHostInfo?.(address) ||
                     await hostManager.getHostStatus?.(address);
    if (hostInfo && hostInfo.isActive !== false) {
      throw new RegistrationError(
        'Cannot withdraw stake while host is active',
        ErrorCode.WITHDRAWAL_NOT_ALLOWED,
        { reason: 'Host is active' }
      );
    }

    // Get current stake
    const currentStake = await checkStakedAmount();
    if (currentStake === 0n) {
      throw new RegistrationError(
        'No staked tokens to withdraw',
        ErrorCode.NO_STAKE_TO_WITHDRAW
      );
    }

    const withdrawAmount = amount || currentStake;

    // Execute withdrawal - SDK returns transaction hash after confirmation
    const txHash = await hostManager.withdrawStake(ethers.formatUnits(withdrawAmount, 18));

    return {
      success: true,
      transactionHash: txHash,
      withdrawnAmount: withdrawAmount
    };
  } catch (error: any) {
    if (error instanceof RegistrationError) {
      throw error;
    }

    throw new RegistrationError(
      `Withdrawal failed: ${error.message}`,
      ErrorCode.WITHDRAWAL_FAILED,
      { originalError: error }
    );
  }
}