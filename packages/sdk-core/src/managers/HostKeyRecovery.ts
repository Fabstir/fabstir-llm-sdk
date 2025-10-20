// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Host Key Recovery Module
 *
 * Provides signature-based public key recovery as a fallback mechanism
 * for hosts that don't include their public key in metadata.
 *
 * Protocol:
 * 1. Client generates random challenge
 * 2. Client requests host to sign challenge
 * 3. Host signs: signature = ECDSA.sign(SHA256(challenge), host_private_key)
 * 4. Host returns { signature, recid }
 * 5. Client recovers pubkey and verifies address matches
 *
 * This ensures:
 * - Host proves ownership of their registered address
 * - Client can derive encryption public key
 * - No trust in host-provided key (cryptographically verified)
 */

import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hexToBytes, bytesToHex, pubkeyToAddress } from '../crypto/utilities';

/**
 * Verify host signature and recover their public key.
 *
 * This function:
 * - Recovers the public key from the ECDSA signature
 * - Verifies the signature is valid
 * - Derives the EVM address from the recovered public key
 * - Ensures the address matches the expected host address
 *
 * @param challenge - Random challenge bytes (32 bytes)
 * @param signatureHex - Host's ECDSA signature (hex string, 64 bytes)
 * @param recid - Recovery ID (0-3) for public key recovery
 * @param expectedAddress - Expected host EVM address (must match recovered address)
 * @returns Recovered compressed public key (33 bytes)
 * @throws Error if signature is invalid or address doesn't match
 */
export function verifyHostSignature(
  challenge: Uint8Array,
  signatureHex: string,
  recid: number,
  expectedAddress: string
): Uint8Array {
  // Host signs the SHA256 hash of the challenge
  const challengeHash = sha256(challenge);

  // Recover public key from signature using @noble/secp256k1 v2.x API
  let pubKey: Uint8Array;
  try {
    const signature = secp.Signature.fromCompact(signatureHex).addRecoveryBit(recid);
    pubKey = signature.recoverPublicKey(challengeHash).toRawBytes(true); // true = compressed (33 bytes)
  } catch (error) {
    throw new Error(`Failed to recover public key from signature: ${error instanceof Error ? error.message : 'invalid signature'}`);
  }

  // Verify signature is valid (defense in depth)
  const valid = secp.verify(signatureHex, challengeHash, pubKey);
  if (!valid) {
    throw new Error('Invalid host signature');
  }

  // Derive EVM address from recovered public key
  const recoveredAddress = pubkeyToAddress(pubKey);

  // Verify address matches expected host address (case-insensitive)
  if (recoveredAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(
      `Host address mismatch: expected ${expectedAddress}, got ${recoveredAddress}`
    );
  }

  return pubKey;
}

/**
 * Request host to sign a challenge and recover their public key.
 *
 * This function:
 * - Generates a random challenge
 * - Sends it to the host via HTTP POST
 * - Receives the signature and recovery ID
 * - Verifies the signature and recovers the public key
 *
 * @param hostApiUrl - Host's API URL (e.g., 'http://localhost:8080')
 * @param hostAddress - Expected host EVM address (for verification)
 * @returns Recovered compressed public key (hex string, 66 chars)
 * @throws Error if request fails or signature verification fails
 */
export async function requestHostPublicKey(
  hostApiUrl: string,
  hostAddress: string
): Promise<string> {
  // Generate random challenge (32 bytes = 256 bits)
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const challengeHex = bytesToHex(challenge);

  // Request signature from host
  const response = await fetch(`${hostApiUrl}/v1/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge: challengeHex })
  });

  if (!response.ok) {
    throw new Error(`Host key request failed: ${response.status} ${response.statusText}`);
  }

  const responseData = await response.json();
  const { signature, recid } = responseData;

  if (!signature || recid === undefined) {
    throw new Error('Invalid response from host: missing signature or recid');
  }

  // Verify and recover public key
  const pubKey = verifyHostSignature(challenge, signature, recid, hostAddress);

  return bytesToHex(pubKey);
}
