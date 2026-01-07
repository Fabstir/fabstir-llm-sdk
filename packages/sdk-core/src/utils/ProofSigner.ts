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
 * @param proofData - Raw proof data (Uint8Array or hex string) to hash
 * @param hostAddress - Host's address (must match session.host on-chain)
 * @param tokensClaimed - Number of tokens being claimed for this proof
 * @param hostWallet - Host's wallet for signing (must be session.host)
 * @returns SignedProofSubmission with proofHash and 65-byte signature
 *
 * @example
 * ```typescript
 * const hostWallet = new ethers.Wallet(hostPrivateKey, provider);
 * const { proofHash, signature } = await signProofForSubmission(
 *   proofBytes,
 *   hostAddress,
 *   BigInt(100),
 *   hostWallet
 * );
 *
 * // Submit to contract
 * await marketplace.submitProofOfWork(
 *   sessionId,
 *   tokensClaimed,
 *   proofHash,
 *   signature,
 *   proofCID
 * );
 * ```
 */
export async function signProofForSubmission(
  proofData: Uint8Array | string,
  hostAddress: string,
  tokensClaimed: bigint,
  hostWallet: ethers.Wallet
): Promise<SignedProofSubmission> {
  // Step 1: Generate proof hash from proof data
  // If proofData is a string, treat it as hex bytes
  // If proofData is Uint8Array, hash it directly
  const proofHash = ethers.keccak256(
    typeof proofData === 'string' ? proofData : proofData
  );

  // Step 2: Create the data hash that will be signed
  // Format: keccak256(abi.encodePacked(proofHash, hostAddress, tokensClaimed))
  // This matches the contract's verification logic
  const dataHash = ethers.keccak256(
    ethers.solidityPacked(
      ['bytes32', 'address', 'uint256'],
      [proofHash, hostAddress, tokensClaimed]
    )
  );

  // Step 3: Sign the data hash using EIP-191 personal sign
  // This adds "\x19Ethereum Signed Message:\n32" prefix before signing
  // The contract uses ecrecover with the same prefix to recover signer
  const signature = await hostWallet.signMessage(ethers.getBytes(dataHash));

  return {
    proofHash,
    signature // 65 bytes: r (32) + s (32) + v (1)
  };
}
