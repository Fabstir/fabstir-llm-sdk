// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Signature Verification Utilities for Delta-Based Checkpointing
 *
 * Provides EIP-191 signature verification for checkpoint data.
 * Used to verify that host nodes have signed checkpoint deltas and indexes.
 */

import { ethers } from 'ethers';
import type { Message } from '../types';

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

/**
 * Recursively sort object keys for deterministic JSON stringification.
 */
function sortObjectKeys(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  if (typeof obj === 'object') {
    const sorted: any = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      sorted[key] = sortObjectKeys(obj[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Compute a deterministic keccak256 hash of checkpoint data.
 *
 * This function creates a hash that can be used to verify checkpoint integrity.
 * The hash is deterministic - same input always produces the same output.
 * Order of messages in the array matters (messages are not sorted).
 *
 * @param messages - Array of messages in the checkpoint
 * @param tokenCount - Total token count at this checkpoint
 * @returns keccak256 hash as hex string (0x prefix + 64 hex chars)
 *
 * @example
 * ```typescript
 * const hash = computeCheckpointHash(messages, 1000);
 * // hash: "0x1234...abcd" (66 characters)
 * ```
 */
export function computeCheckpointHash(messages: Message[], tokenCount: number): string {
  // Create a deterministic data structure
  // Messages are kept in order (order matters), but object keys are sorted
  const data = {
    messages: messages.map(msg => sortObjectKeys({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      metadata: msg.metadata
    })),
    tokenCount
  };

  // Sort top-level keys and stringify
  const sortedData = sortObjectKeys(data);
  const jsonString = JSON.stringify(sortedData);

  // Compute keccak256 hash
  return ethers.keccak256(ethers.toUtf8Bytes(jsonString));
}
