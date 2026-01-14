// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Proof Type Definitions - Security Audit Migration
 *
 * These types support the new submitProofOfWork signature that requires
 * ECDSA signatures from hosts for proof verification.
 */

/**
 * Parameters for submitting a proof of work
 *
 * @property sessionId - The session/job ID
 * @property tokensClaimed - Number of tokens being claimed for this proof
 * @property proofHash - bytes32 keccak256 hash of the proof data
 * @property signature - bytes ECDSA signature (65 bytes: r + s + v)
 * @property proofCID - S5 CID pointing to the full proof data
 */
export interface ProofSubmissionParams {
  sessionId: bigint;
  tokensClaimed: bigint;
  proofHash: string;
  signature: string;
  proofCID: string;
}

/**
 * Result from getProofSubmission() view function
 *
 * @property proofHash - bytes32 hash of the submitted proof
 * @property tokensClaimed - Number of tokens claimed in this proof
 * @property timestamp - Block timestamp when proof was submitted
 * @property verified - true if ProofSystem validated the proof, false for graceful degradation
 */
export interface ProofSubmissionResult {
  proofHash: string;
  tokensClaimed: bigint;
  timestamp: bigint;
  verified: boolean;
}

/**
 * User balance information from view functions
 *
 * @property withdrawable - Balance that can be withdrawn immediately
 * @property locked - Balance locked in active sessions
 * @property total - Total balance (withdrawable + locked)
 */
export interface UserBalanceInfo {
  withdrawable: bigint;
  locked: bigint;
  total: bigint;
}

/**
 * Session status enum matching contract values
 *
 * CRITICAL: Order must match contract enum exactly for ABI encoding
 */
export enum SessionStatus {
  Active = 0,
  Completed = 1,
  TimedOut = 2,
  Disputed = 3,
  Abandoned = 4,
  Cancelled = 5
}
