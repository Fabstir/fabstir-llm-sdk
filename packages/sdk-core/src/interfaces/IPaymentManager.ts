// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Payment Manager Interface
 * Browser-compatible payment operations
 */

import { Signer } from 'ethers';
import {
  JobCreationRequest,
  JobResult,
  PaymentOptions,
  TransactionResult,
  CreateDelegateAuthParams,
  DelegateAuthorizationResult,
  GetDelegateAuthParams,
  DelegateAuthorizationStatus,
  RevokeDelegateParams,
  RevokeDelegateResult,
} from '../types';

export interface IPaymentManager {
  /**
   * Create a job with payment
   */
  createJob(request: JobCreationRequest): Promise<JobResult>;
  
  /**
   * Create a session job with USDC
   */
  createSessionJob(
    model: string,
    provider: string,
    depositAmount: string,
    pricePerToken: number,
    proofInterval: number,
    duration: number
  ): Promise<{
    sessionId: bigint;
    jobId: bigint;
    txHash: string;
  }>;
  
  /**
   * Approve token spending
   */
  approveToken(
    tokenAddress: string,
    spenderAddress: string,
    amount: bigint
  ): Promise<TransactionResult>;
  
  /**
   * Check token allowance
   */
  checkAllowance(
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string
  ): Promise<bigint>;
  
  /**
   * Get token balance
   */
  getTokenBalance(
    tokenAddress: string,
    address: string
  ): Promise<bigint>;
  
  /**
   * Get ETH balance
   */
  getEthBalance(address: string): Promise<bigint>;
  
  /**
   * Send ETH
   */
  sendEth(
    to: string,
    amount: bigint
  ): Promise<TransactionResult>;
  
  /**
   * Send tokens
   */
  sendToken(
    tokenAddress: string,
    to: string,
    amount: bigint
  ): Promise<TransactionResult>;
  
  /**
   * Estimate gas for a transaction
   */
  estimateGas(
    to: string,
    data: string,
    value?: bigint
  ): Promise<bigint>;

  /**
   * Submit checkpoint proof
   */
  submitCheckpoint(
    jobId: bigint,
    tokensGenerated: number,
    proof: string
  ): Promise<string>;

  /**
   * Submit checkpoint proof as host (requires host signer)
   */
  submitCheckpointAsHost(
    jobId: bigint,
    tokensGenerated: number,
    proof: string,
    hostSigner: Signer
  ): Promise<string>;

  /**
   * Complete session job
   */
  completeSession(
    jobId: bigint,
    totalTokens: number,
    finalProof: string
  ): Promise<string>;

  // ===== Delegate authorization (delegate-pays) =====

  /** Authorize a delegate to spend the payer's USDC up to a cap (USDC-only). */
  createDelegateAuthorization(params: CreateDelegateAuthParams): Promise<DelegateAuthorizationResult>;

  /** Read delegate authorization status + live remaining allowance. */
  getDelegateAuthorization(params: GetDelegateAuthParams): Promise<DelegateAuthorizationStatus>;

  /** Revoke a delegate: deauthorize AND zero the allowance in one bundled call. */
  revokeDelegate(params: RevokeDelegateParams): Promise<RevokeDelegateResult>;

  /** Enter delegate-pays mode by recording the payer (owner) funding sessions. */
  setDelegatePayer(payer: string): void;

  /** The payer set in delegate-pays mode, or undefined when self-funded. */
  getDelegatePayer(): string | undefined;
}