/**
 * Staking operations module
 * Handles FAB token staking for host registration
 */

import { getSDK, getAuthenticatedAddress } from '../sdk/client';
import { getFABBalance } from '../balance/checker';
import { RegistrationError, ErrorCode } from './errors';
import { ethers } from 'ethers';

/**
 * Staking configuration
 */
export interface StakingConfig {
  amount: bigint;
  models: string[];
  apiUrl: string;
  metadata?: Record<string, any>;
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
  const sdk = getSDK();
  const contractAddress = sdk.config.contractAddresses.nodeRegistry ||
                          sdk.config.contractAddresses.hostRegistry ||
                          '';

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
    const fabTokenAddress = sdk.config.contractAddresses.fabToken;
    const spenderAddress = getStakingRequirements().contractAddress;

    // Use SDK PaymentManager instead of direct contract calls
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

    // Execute approval
    const paymentManager = sdk.getPaymentManager();
    const signer = sdk.getSigner();
    const fabTokenAddress = sdk.config.contractAddresses.fabToken;
    const spenderAddress = getStakingRequirements().contractAddress;

    const fabToken = new ethers.Contract(
      fabTokenAddress,
      [
        'function approve(address spender, uint256 amount) returns (bool)'
      ],
      signer
    );

    const tx = await fabToken.approve(spenderAddress, amount);
    const receipt = await tx.wait(options.confirmations || 2);

    return {
      success: true,
      transactionHash: receipt.transactionHash,
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

      const stake = hostInfo?.stake || hostInfo?.stakedAmount || 0n;
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
      const feeData = await provider.getFeeData();
      const gasPrice = config.gasPrice || feeData.gasPrice || ethers.parseUnits('20', 'gwei');

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

    // Register host with models and stake
    const tx = await hostManager.registerHostWithModels(
      config.models,
      config.apiUrl,
      {
        gasLimit: config.gasLimit,
        gasPrice: config.gasPrice
      }
    );

    const receipt = await tx.wait(3);

    return {
      success: true,
      transactionHash: receipt.transactionHash,
      stakedAmount: config.amount,
      blockNumber: receipt.blockNumber,
      gasUsed: BigInt(receipt.gasUsed.toString())
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
    if (hostInfo && hostInfo.active !== false) {
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

    // Execute withdrawal
    const tx = await hostManager.withdrawStake?.(withdrawAmount);
    const receipt = await tx.wait(3);

    return {
      success: true,
      transactionHash: receipt.transactionHash,
      withdrawnAmount
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