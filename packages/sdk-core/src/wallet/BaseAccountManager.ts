// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * BaseAccountManager - Manages Base Account Kit sub-accounts and spend permissions
 *
 * This module handles the complexity of:
 * - Creating and retrieving sub-accounts
 * - Configuring spend permissions for popup-free transactions
 * - Managing allowances and permission periods
 *
 * IMPORTANT: Requires BASE_CONTRACT_SPEND_PERMISSION_MANAGER to be set in .env.test
 * This is Base's Spend Permission Manager contract (Base protocol infrastructure, not Fabstir)
 */

import { ethers } from 'ethers';

/**
 * Get Base's Spend Permission Manager contract address from environment
 * @throws Error if BASE_CONTRACT_SPEND_PERMISSION_MANAGER is not set
 */
function getSpendPermissionManager(): string {
  const address = process.env.BASE_CONTRACT_SPEND_PERMISSION_MANAGER;
  if (!address) {
    throw new Error(
      'BASE_CONTRACT_SPEND_PERMISSION_MANAGER not set in environment. ' +
      'Please add this to .env.test with Base\'s Spend Permission Manager contract address.'
    );
  }
  return address;
}

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
 * CRITICAL: wallet_addSubAccount MUST be called each browser session to register
 * the CryptoKey. Per Base docs: "wallet_addSubAccount needs to be called in each
 * session before the Sub Account can be used. It will not trigger a new Sub Account
 * creation if one already exists."
 *
 * See: https://docs.base.org/base-account/improve-ux/sub-accounts
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

  // Check for existing sub-accounts (informational only)
  let hasExisting = false;
  try {
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

    hasExisting = (resp?.subAccounts?.length ?? 0) > 0;
    if (hasExisting) {
      console.log('[BaseAccountManager] Found existing sub-account, will re-register for this session');
    }
  } catch (e) {
    console.log('[BaseAccountManager] Could not check existing sub-accounts:', e);
  }

  try {
    // ALWAYS call wallet_addSubAccount to register CryptoKey for THIS session
    // Per Base docs: "wallet_addSubAccount needs to be called in each session"
    // "It will not trigger a new Sub Account creation if one already exists"
    console.log('[BaseAccountManager] Calling wallet_addSubAccount (required each session for CryptoKey)...');

    const maxAllowanceWei = ethers.parseUnits(maxAllowance, tokenDecimals);
    const period = 86400 * periodDays; // Convert days to seconds
    const start = Math.floor(Date.now() / 1000);
    const end = start + period;

    const result = (await provider.request({
      method: 'wallet_addSubAccount',
      params: [
        {
          account: { type: 'create' },
          spender: {
            address: getSpendPermissionManager() as `0x${string}`,
            token: tokenAddress as `0x${string}`,
            allowance: maxAllowanceWei.toString(),
            period,
            start,
            end,
          },
        },
      ],
    })) as { address: `0x${string}` };

    console.log('[BaseAccountManager] wallet_addSubAccount returned:', result.address);
    console.log('[BaseAccountManager] CryptoKey registered for popup-free transactions');

    return {
      address: result.address,
      isExisting: hasExisting,
    };
  } catch (error) {
    console.error('[BaseAccountManager] Failed to register sub-account:', error);
    throw new Error(`Failed to register sub-account: ${error}`);
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