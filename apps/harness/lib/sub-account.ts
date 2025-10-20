// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { getProvider } from './provider';

// Types
interface SubAccount {
  address: `0x${string}`;
  domain?: string;
}

interface AutoSpendConfig {
  token: `0x${string}`;
  spender: `0x${string}`;
  limit?: bigint;
}

// State
let currentSubAccount: SubAccount | null = null;

/**
 * Get or create a sub-account for the current origin
 */
export async function getOrCreateSubAccount(
  universalAccount: string
): Promise<SubAccount> {
  const provider = getProvider();
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  
  // First, try to get existing sub-accounts for this domain
  const response = await provider.request({
    method: 'wallet_getSubAccounts',
    params: [{
      account: universalAccount,
      domain: origin
    }]
  }) as { subAccounts?: SubAccount[] };
  
  let subAccount = response?.subAccounts?.[0];
  
  // If no sub-account exists, create one
  if (!subAccount) {
    const createResponse = await provider.request({
      method: 'wallet_addSubAccount',
      params: [{
        account: { type: 'create' },
        permissions: {
          autoSpend: true  // Enable auto-spend by default
        }
      }]
    }) as SubAccount;
    
    subAccount = createResponse;
  }
  
  // Store the sub-account
  currentSubAccount = subAccount;
  return subAccount;
}

/**
 * Get the current sub-account address
 */
export function getCurrentSubAccount(): SubAccount | null {
  return currentSubAccount;
}

/**
 * Get auto-spend configuration for USDC on Base Sepolia
 */
export function getAutoSpendConfig(): AutoSpendConfig {
  return {
    token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC on Base Sepolia
    spender: '0x0000000000000000000000000000000000000001', // Example spender
    limit: BigInt(100) * BigInt(10 ** 6) // 100 USDC
  };
}