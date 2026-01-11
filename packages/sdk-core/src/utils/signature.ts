// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Signature Verification Utilities for Delta-Based Checkpointing
 *
 * Provides EIP-191 signature verification for checkpoint data.
 * Used to verify that host nodes have signed checkpoint deltas and indexes.
 */

import { ethers } from 'ethers';

/**
 * Verify an EIP-191 signature against an expected signer address.
 *
 * This function verifies that a message was signed by the expected host address.
 * Used for checkpoint recovery to ensure deltas and indexes are authentic.
 *
 * @param signature - The EIP-191 signature (65 bytes hex string with 0x prefix)
 * @param message - The original message that was signed (string or Uint8Array)
 * @param expectedSigner - The expected signer address (with or without 0x prefix)
 * @returns true if signature is valid and matches expectedSigner, false otherwise
 * @throws Error if signature format is invalid
 *
 * @example
 * ```typescript
 * const isValid = verifyHostSignature(
 *   '0x1234...signature',
 *   JSON.stringify(checkpointData),
 *   hostAddress
 * );
 * if (!isValid) {
 *   throw new SDKError('Invalid checkpoint signature', 'INVALID_SIGNATURE');
 * }
 * ```
 */
export function verifyHostSignature(
  signature: string,
  message: string | Uint8Array,
  expectedSigner: string
): boolean {
  // Validate signature format
  if (!signature || signature.length === 0) {
    throw new Error('Signature cannot be empty');
  }

  // Normalize signature to have 0x prefix
  const normalizedSig = signature.startsWith('0x') ? signature : `0x${signature}`;

  // EIP-191 signatures should be 65 bytes (130 hex chars + 0x)
  if (normalizedSig.length !== 132) {
    throw new Error(`Invalid signature length: expected 132 characters (0x + 130 hex), got ${normalizedSig.length}`);
  }

  // Validate hex format
  if (!/^0x[a-fA-F0-9]{130}$/.test(normalizedSig)) {
    throw new Error('Invalid signature format: must be valid hex string');
  }

  // Normalize expected signer address
  const normalizedExpected = expectedSigner.startsWith('0x')
    ? expectedSigner.toLowerCase()
    : `0x${expectedSigner}`.toLowerCase();

  try {
    // Recover the signer address from the signature
    // ethers.verifyMessage handles EIP-191 prefix internally
    const recoveredAddress = ethers.verifyMessage(message, normalizedSig);

    // Compare addresses (case-insensitive)
    return recoveredAddress.toLowerCase() === normalizedExpected;
  } catch (error) {
    // If recovery fails, signature is invalid
    throw new Error(`Signature verification failed: ${(error as Error).message}`);
  }
}
