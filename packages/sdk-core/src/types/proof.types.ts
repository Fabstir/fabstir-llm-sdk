// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Proof Type Definitions
 *
 * February 2026 Contract Update:
 * - signature is now optional (deprecated - auth via msg.sender)
 * - deltaCID added to both params and result
 */

/**
 * Parameters for submitting a proof of work
 *
 * @property sessionId - The session/job ID
 * @property tokensClaimed - Number of tokens being claimed for this proof
 * @property proofHash - bytes32 keccak256 hash of the proof data
 * @property signature - @deprecated Since Feb 4, 2026 - No longer required
 * @property proofCID - S5 CID pointing to the full proof data
 * @property deltaCID - Optional S5 CID for incremental/delta proof data
 */
export interface ProofSubmissionParams {
  sessionId: bigint;
  tokensClaimed: bigint;
  proofHash: string;
  /** @deprecated Since Feb 4, 2026 - Signatures no longer required for proof submission */
  signature?: string;
  proofCID: string;
  deltaCID?: string;
}

/**
 * Result from getProofSubmission() view function
 *
 * February 2026: Now returns 5 values including deltaCID
 *
 * @property proofHash - bytes32 hash of the submitted proof
 * @property tokensClaimed - Number of tokens claimed in this proof
 * @property timestamp - Block timestamp when proof was submitted
 * @property verified - true if ProofSystem validated the proof
 * @property deltaCID - S5 CID for incremental/delta proof data (may be empty)
 */
export interface ProofSubmissionResult {
  proofHash: string;
  tokensClaimed: bigint;
  timestamp: bigint;
  verified: boolean;
  deltaCID: string;
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
 *
 * Note: Original enum had Disputed (3), Abandoned (4), Cancelled (5) but
 * these were removed from the contract as part of the security audit.
 * Dispute resolution is handled off-chain via DAO with CID evidence.
 * See: temp/DISPUTE-RESOLUTION-ARCHITECTURE.md
 */
export enum SessionStatus {
  Active = 0,
  Completed = 1,
  TimedOut = 2
}
