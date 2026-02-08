// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Error Types for V2 Direct Payment Delegation
 *
 * February 2026 Contract Update: Custom errors for delegation operations.
 */

/**
 * Delegation error constants matching contract custom errors
 */
export const DELEGATION_ERRORS = {
  /** Caller not authorized as delegate for payer */
  NOT_DELEGATE: 'NotDelegate',
  /** Direct delegation requires ERC-20 token (no ETH) */
  ERC20_ONLY: 'ERC20Only',
  /** Invalid delegation parameters */
  BAD_PARAMS: 'BadDelegateParams',
} as const;

/**
 * Parse delegation error from contract revert
 *
 * @param error - Error object from contract call
 * @returns Human-readable error message, or null if not a delegation error
 */
export function parseDelegationError(error: any): string | null {
  const message = error?.message || '';

  if (message.includes('NotDelegate')) {
    return 'Caller not authorized as delegate for payer';
  }
  if (message.includes('ERC20Only')) {
    return 'Direct delegation requires ERC-20 token (no ETH)';
  }
  if (message.includes('BadDelegateParams')) {
    return 'Invalid delegation parameters';
  }

  return null;
}
