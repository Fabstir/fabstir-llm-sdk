// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

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

export {
  AASigner,
  type AASignerOptions,
  type SendUserOpCall,
  type SendUserOpResult,
  type SendUserOpFn,
} from './AASigner';

// ERC-4337 v0.7 gasless building blocks (headless self-funded delegate path)
export { createBundlerSendUserOp, ESTIMATION_DUMMY_SIG, type BundlerSendUserOpConfig } from './userop/createBundlerSendUserOp';
export { encodeExecute, encodeFactoryData, getInitCodeFor, getCounterfactualAddress } from './userop/SimpleAccountV07';
export { userOpHashV07, pack2x128, getInitCode, getPaymasterAndData, type UnpackedUserOpV07 } from './userop/userOpHashV07';