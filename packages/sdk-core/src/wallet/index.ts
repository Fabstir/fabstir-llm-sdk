/**
 * Wallet Module - Base Account Kit integration for popup-free transactions
 *
 * This module provides utilities for:
 * - Managing sub-accounts with spend permissions
 * - Creating custom signers for popup-free transactions
 * - Simplifying Base Account Kit authentication
 */

export {
  ensureSubAccount,
  getExistingSubAccount,
  type SubAccountOptions,
  type SubAccountResult,
} from './BaseAccountManager';

export {
  createSubAccountSigner,
  type SubAccountSignerOptions,
} from './SubAccountSigner';