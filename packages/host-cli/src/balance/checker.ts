/**
 * Balance checking module for ETH and FAB tokens
 * Handles balance retrieval, formatting, and requirement checking
 */

import { getSDK, getAuthenticatedAddress } from '../sdk/client';
import { ethers } from 'ethers';

// Cache for balance values
const balanceCache = new Map<string, { value: bigint; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

/**
 * Get ETH balance for authenticated user
 */
export async function getETHBalance(forceRefresh = false): Promise<bigint> {
  const sdk = getSDK();
  if (!sdk || !sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const address = getAuthenticatedAddress();
  if (!address) {
    throw new Error('No authenticated address');
  }

  const cacheKey = `eth_${address}`;

  // Check cache
  if (!forceRefresh) {
    const cached = balanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.value;
    }
  }

  try {
    const provider = sdk.getProvider();
    if (!provider) {
      throw new Error('Provider not initialized');
    }
    const balance = await provider.getBalance(address);

    // ethers v6 returns bigint directly
    const balanceValue = BigInt(balance);

    // Update cache
    balanceCache.set(cacheKey, {
      value: balanceValue,
      timestamp: Date.now()
    });

    return balanceValue;
  } catch (error: any) {
    throw new Error(`Failed to get ETH balance: ${error.message}`);
  }
}

/**
 * Check if ETH balance meets minimum requirement
 */
export async function checkMinimumETH(requiredAmount = 15000000000000000n): Promise<{
  hasMinimum: boolean;
  balance: bigint;
  required: bigint;
  shortfall: bigint;
  errorMessage?: string;
}> {
  const balance = await getETHBalance();
  const hasMinimum = balance >= requiredAmount;
  const shortfall = hasMinimum ? 0n : requiredAmount - balance;

  const result = {
    hasMinimum,
    balance,
    required: requiredAmount,
    shortfall
  };

  if (!hasMinimum) {
    const requiredETH = ethers.formatEther(requiredAmount);
    const currentETH = ethers.formatEther(balance);
    (result as any).errorMessage = `Insufficient ETH balance. Required: ${requiredETH} ETH, Current: ${currentETH} ETH`;
  }

  return result;
}

/**
 * Format ETH balance for display
 */
export function formatETHBalance(wei: bigint, decimals = 18, useCommas = false): string {
  if (wei < 0n) {
    throw new Error('Invalid balance: cannot be negative');
  }

  const ethValue = ethers.formatEther(wei);
  let formatted = parseFloat(ethValue).toFixed(decimals);

  // Remove trailing zeros
  formatted = formatted.replace(/\.?0+$/, '');

  if (useCommas) {
    formatted = formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  return `${formatted} ETH`;
}

/**
 * Get FAB token balance for authenticated user
 */
export async function getFABBalance(forceRefresh = false): Promise<bigint> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const userAddress = getAuthenticatedAddress();
  if (!userAddress) {
    throw new Error('No authenticated address');
  }

  const cacheKey = `fab_${userAddress}`;

  // Check cache
  if (!forceRefresh) {
    const cached = balanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.value;
    }
  }

  try {
    const paymentManager = sdk.getPaymentManager();

    // Get FAB token address from config
    const contractAddresses = sdk.getContractAddresses();
    const fabTokenAddress = contractAddresses.fabToken;
    if (!fabTokenAddress) {
      throw new Error('FAB token address not configured');
    }

    const balance = await paymentManager.getTokenBalance(userAddress, fabTokenAddress);

    // getTokenBalance returns bigint directly
    const balanceValue = balance;

    // Update cache
    balanceCache.set(cacheKey, {
      value: balanceValue,
      timestamp: Date.now()
    });

    return balanceValue;
  } catch (error: any) {
    throw new Error(`Failed to get FAB balance: ${error.message}`);
  }
}

/**
 * Check if FAB balance meets minimum requirement
 */
export async function checkMinimumFAB(requiredAmount = 1000000000000000000000n): Promise<{
  hasMinimum: boolean;
  balance: bigint;
  required: bigint;
  shortfall: bigint;
  errorMessage?: string;
}> {
  const balance = await getFABBalance();
  const hasMinimum = balance >= requiredAmount;
  const shortfall = hasMinimum ? 0n : requiredAmount - balance;

  const result = {
    hasMinimum,
    balance,
    required: requiredAmount,
    shortfall
  };

  if (!hasMinimum) {
    const requiredFAB = ethers.formatUnits(requiredAmount, 18);
    const currentFAB = ethers.formatUnits(balance, 18);
    (result as any).errorMessage = `Insufficient FAB balance. ${parseFloat(requiredFAB)} FAB required, Current: ${currentFAB} FAB`;
  }

  return result;
}

/**
 * Format FAB balance for display
 */
export function formatFABBalance(wei: bigint, decimals = 18, useCommas = false): string {
  if (wei < 0n) {
    throw new Error('Invalid balance: cannot be negative');
  }

  const fabValue = ethers.formatUnits(wei, 18);
  let formatted = parseFloat(fabValue).toFixed(decimals);

  // Remove trailing zeros after decimal point
  if (formatted.includes('.')) {
    formatted = formatted.replace(/\.?0+$/, '');
  }

  if (useCommas) {
    // Add commas to integer part only
    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    formatted = parts.join('.');
  }

  return `${formatted} FAB`;
}

/**
 * Get staking status for host
 */
export async function getStakingStatus(): Promise<{
  isStaked: boolean;
  stakedAmount: bigint;
  requiredStake: bigint;
  message?: string;
}> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  try {
    const hostManager = sdk.getHostManager();
    const address = getAuthenticatedAddress();
    if (!address) {
      throw new Error('No authenticated address');
    }

    // Try to get host info to check if registered
    let hostInfo: any;
    try {
      hostInfo = await hostManager.getHostInfo?.(address);
    } catch {
      // Try alternative method
      hostInfo = await hostManager.getHostStatus?.(address);
    }

    const requiredStake = 1000000000000000000000n; // 1000 FAB
    const stakedAmount = hostInfo?.stake || hostInfo?.stakedAmount || 0n;
    const isStaked = stakedAmount >= requiredStake;

    const result = {
      isStaked,
      stakedAmount,
      requiredStake
    };

    if (!isStaked) {
      const required = ethers.formatUnits(requiredStake, 18);
      const current = ethers.formatUnits(stakedAmount, 18);
      (result as any).message = `Need to stake ${required} FAB. Currently staked: ${current} FAB`;
    }

    return result;
  } catch (error: any) {
    // Host not registered
    return {
      isStaked: false,
      stakedAmount: 0n,
      requiredStake: 1000000000000000000000n,
      message: 'Host not registered. Need to stake 1000 FAB to become a host.'
    };
  }
}