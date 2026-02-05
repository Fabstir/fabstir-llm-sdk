// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * ProofSigner - ECDSA Signature Generation for Proof Submission
 *
 * Security Audit Migration: submitProofOfWork now requires real ECDSA signatures
 * from the host to prevent unauthorized proof submissions.
 *
 * The contract verifies signatures as follows:
 *   dataHash = keccak256(abi.encodePacked(proofHash, prover, claimedTokens))
 *   ethSignedMessageHash = keccak256("\x19Ethereum Signed Message:\n32" + dataHash)
 *   recoveredSigner = ecrecover(ethSignedMessageHash, v, r, s)
 *   require(recoveredSigner == session.host)
 */

import { ethers } from 'ethers';

/**
 * Result of signing proof data for submission
 */
export interface SignedProofSubmission {
  /** bytes32 - keccak256 hash of the proof data */
  proofHash: string;
  /** bytes (65 bytes hex) - ECDSA signature (r + s + v) */
  signature: string;
}

/**
 * Sign proof data for submitProofOfWork
 *
 * @deprecated Since February 4, 2026 - Signatures no longer required for proof submission.
 * Authentication is now via msg.sender == session.host check on-chain.
 * This function is kept for backward compatibility but returns an empty signature.
 *
 * @param proofData - Raw proof data (Uint8Array or hex string) to hash
 * @param hostAddress - Host's address (no longer used for signing)
 * @param tokensClaimed - Number of tokens being claimed (no longer used for signing)
 * @param hostWallet - Host's wallet (no longer used for signing)
 * @returns SignedProofSubmission with proofHash and empty signature ('0x')
 *
 * @example
 * ```typescript
 * // Feb 2026: Signature no longer required
 * // Just call submitProofOfWork directly without signing
 * await marketplace.submitProofOfWork(
 *   sessionId,
 *   tokensClaimed,
 *   proofHash,
 *   proofCID,
 *   deltaCID
 * );
 * ```
 */
export async function signProofForSubmission(
  proofData: Uint8Array | string,
  hostAddress: string,
  tokensClaimed: bigint,
  hostWallet: ethers.Wallet
): Promise<SignedProofSubmission> {
  console.warn('[DEPRECATED] signProofForSubmission: Signatures no longer required since Feb 4, 2026. Authentication is via msg.sender == session.host check.');

  // Generate proof hash only - signature is no longer needed
  const proofHash = ethers.keccak256(
    typeof proofData === 'string' ? proofData : proofData
  );

  return {
    proofHash,
    signature: '0x' // Empty - no longer verified by contract
  };
}
