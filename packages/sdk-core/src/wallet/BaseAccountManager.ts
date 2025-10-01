/**
 * BaseAccountManager - Manages Base Account Kit sub-accounts and spend permissions
 *
 * This module handles the complexity of:
 * - Creating and retrieving sub-accounts
 * - Configuring spend permissions for popup-free transactions
 * - Managing allowances and permission periods
 */

import { ethers } from 'ethers';

// Spend Permission Manager address on Base Sepolia
const SPEND_PERMISSION_MANAGER = '0xf85210B21cC50302F477BA56686d2019dC9b67Ad';

export interface SubAccountOptions {
  tokenAddress: string;
  tokenDecimals?: number;
  maxAllowance?: string; // In token units (e.g., "1000000" for 1M USDC)
  periodDays?: number;   // Permission validity period in days
}

export interface SubAccountResult {
  address: string;
  isExisting: boolean;
}

/**
 * Get or create a sub-account with spend permissions configured
 *
 * @param provider - Base Account Kit provider
 * @param primaryAccount - Primary smart wallet address
 * @param options - Sub-account configuration options
 * @returns Sub-account address and whether it was existing or newly created
 */
export async function ensureSubAccount(
  provider: any,
  primaryAccount: string,
  options: SubAccountOptions
): Promise<SubAccountResult> {
  const {
    tokenAddress,
    tokenDecimals = 6,
    maxAllowance = '1000000',
    periodDays = 365,
  } = options;

  console.log('[BaseAccountManager] Ensuring sub-account for:', primaryAccount);

  try {
    // 1) Check for existing sub-accounts for this origin
    console.log('[BaseAccountManager] Checking for existing sub-accounts...');
    const resp = (await provider.request({
      method: 'wallet_getSubAccounts',
      params: [
        {
          account: primaryAccount,
          domain: typeof window !== 'undefined' ? window.location.origin : 'fabstir-app',
        },
      ],
    })) as { subAccounts?: Array<{ address: `0x${string}` }> };

    if (resp?.subAccounts?.length) {
      const subAccount = resp.subAccounts[0]!.address;
      console.log('[BaseAccountManager] Found existing sub-account:', subAccount);
      return {
        address: subAccount,
        isExisting: true,
      };
    }

    console.log('[BaseAccountManager] No existing sub-accounts found');
  } catch (e) {
    console.error('[BaseAccountManager] Error checking sub-accounts:', e);
  }

  try {
    // 2) Create a new sub-account with spend permission configured
    console.log('[BaseAccountManager] Creating new sub-account with spend permission...');

    const maxAllowanceWei = ethers.parseUnits(maxAllowance, tokenDecimals);
    const period = 86400 * periodDays; // Convert days to seconds
    const start = Math.floor(Date.now() / 1000);
    const end = start + period;

    const created = (await provider.request({
      method: 'wallet_addSubAccount',
      params: [
        {
          account: { type: 'create' },
          spender: {
            address: SPEND_PERMISSION_MANAGER as `0x${string}`,
            token: tokenAddress as `0x${string}`,
            allowance: maxAllowanceWei.toString(),
            period,
            start,
            end,
          },
        },
      ],
    })) as { address: `0x${string}` };

    console.log('[BaseAccountManager] Created sub-account:', created.address);
    console.log('[BaseAccountManager] Spend permission configured for:', {
      token: tokenAddress,
      allowance: maxAllowance,
      periodDays,
    });

    return {
      address: created.address,
      isExisting: false,
    };
  } catch (error) {
    console.error('[BaseAccountManager] Failed to create sub-account:', error);
    throw new Error(`Failed to create sub-account: ${error}`);
  }
}

/**
 * Check if an account has a sub-account for the current origin
 *
 * @param provider - Base Account Kit provider
 * @param primaryAccount - Primary smart wallet address
 * @returns Sub-account address if exists, null otherwise
 */
export async function getExistingSubAccount(
  provider: any,
  primaryAccount: string
): Promise<string | null> {
  try {
    const resp = (await provider.request({
      method: 'wallet_getSubAccounts',
      params: [
        {
          account: primaryAccount,
          domain: typeof window !== 'undefined' ? window.location.origin : 'fabstir-app',
        },
      ],
    })) as { subAccounts?: Array<{ address: `0x${string}` }> };

    return resp?.subAccounts?.[0]?.address || null;
  } catch (e) {
    console.error('[BaseAccountManager] Error getting sub-account:', e);
    return null;
  }
}