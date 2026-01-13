// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Checkpoint Encryption Utilities (Phase 8)
 *
 * Provides decryption for encrypted checkpoint deltas.
 * Node encrypts deltas with user's recovery public key.
 * SDK decrypts during recovery using user's private key.
 *
 * Crypto primitives:
 * - ECDH on secp256k1 for key exchange
 * - HKDF-SHA256 for key derivation
 * - XChaCha20-Poly1305 for authenticated encryption
 */

import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hkdf } from '@noble/hashes/hkdf';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hexToBytes, bytesToHex } from '../crypto/utilities';
import type { CheckpointDelta, EncryptedCheckpointDelta } from '../types';

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * HKDF info string for checkpoint encryption.
 * MUST match NODE_CHECKPOINT_SPEC.md exactly.
 */
const CHECKPOINT_HKDF_INFO = 'checkpoint-delta-encryption-v1';

/**
 * Check if a delta is encrypted or plaintext.
 *
 * Encrypted deltas have `encrypted: true` field.
 * Plaintext deltas have no `encrypted` field or `encrypted: false`.
 *
 * @param delta - The delta object to check
 * @returns true if encrypted, false if plaintext
 */
export function isEncryptedDelta(delta: any): delta is EncryptedCheckpointDelta {
  if (!delta || typeof delta !== 'object') {
    return false;
  }
  return delta.encrypted === true;
}

/**
 * Derive the encryption key for checkpoint decryption.
 *
 * Algorithm:
 * 1. ECDH: user_private × ephemeral_public = shared_point
 * 2. Extract shared secret: sha256(shared_point.x)
 * 3. HKDF: derive 32-byte key with info="checkpoint-delta-encryption-v1"
 *
 * @param userPrivateKeyHex - User's recovery private key (hex without 0x)
 * @param ephemeralPubKeyHex - Host's ephemeral public key (0x-prefixed hex)
 * @returns 32-byte encryption key
 */
export function deriveCheckpointEncryptionKey(
  userPrivateKeyHex: string,
  ephemeralPubKeyHex: string
): Uint8Array {
  // Parse keys
  const userPrivate = hexToBytes(userPrivateKeyHex.replace(/^0x/, ''));
  const ephemeralPub = hexToBytes(ephemeralPubKeyHex.replace(/^0x/, ''));

  // ECDH: user_private × ephemeral_public = shared_point
  const sharedPoint = secp.getSharedSecret(userPrivate, ephemeralPub, true);

  // Extract x-coordinate (drop the 02/03 prefix)
  const xCoord = sharedPoint.slice(1);

  // SHA256 hash of x-coordinate to get shared secret
  const sharedSecret = sha256(xCoord);

  // HKDF key derivation (matches NODE_CHECKPOINT_SPEC.md)
  // salt = undefined (None in Python = 32 zeros in HKDF)
  // info = "checkpoint-delta-encryption-v1"
  const encryptionKey = hkdf(
    sha256,
    sharedSecret,
    undefined, // salt = None
    enc.encode(CHECKPOINT_HKDF_INFO),
    32
  );

  // Security hygiene: erase private key bytes
  userPrivate.fill(0);

  return encryptionKey;
}

/**
 * Decrypt an encrypted checkpoint delta.
 *
 * Algorithm:
 * 1. Derive encryption key via ECDH + HKDF
 * 2. Decrypt ciphertext with XChaCha20-Poly1305
 * 3. Parse JSON to get CheckpointDelta
 *
 * @param encrypted - The encrypted checkpoint delta
 * @param userPrivateKeyHex - User's recovery private key (hex without 0x)
 * @returns Decrypted CheckpointDelta
 * @throws Error if decryption fails (wrong key, tampered, invalid)
 */
export function decryptCheckpointDelta(
  encrypted: EncryptedCheckpointDelta,
  userPrivateKeyHex: string
): CheckpointDelta {
  // Validate encrypted delta structure
  if (!encrypted.encrypted || encrypted.version !== 1) {
    throw new Error('Invalid encrypted delta: expected encrypted=true, version=1');
  }

  if (!encrypted.ephemeralPublicKey || !encrypted.nonce || !encrypted.ciphertext) {
    throw new Error('Invalid encrypted delta: missing required fields');
  }

  // Derive encryption key
  const key = deriveCheckpointEncryptionKey(
    userPrivateKeyHex,
    encrypted.ephemeralPublicKey
  );

  // Parse nonce and ciphertext
  const nonce = hexToBytes(encrypted.nonce);
  const ciphertext = hexToBytes(encrypted.ciphertext);

  // Validate nonce length (24 bytes for XChaCha20)
  if (nonce.length !== 24) {
    throw new Error(`Invalid nonce length: expected 24, got ${nonce.length}`);
  }

  // Decrypt with XChaCha20-Poly1305
  let plaintext: Uint8Array;
  try {
    const cipher = xchacha20poly1305(key, nonce);
    plaintext = cipher.decrypt(ciphertext); // Throws if tag verification fails
  } catch (error: any) {
    throw new Error(
      `Decryption failed: ${error.message || 'AEAD authentication failed'}`
    );
  }

  // Parse JSON to get CheckpointDelta
  let delta: CheckpointDelta;
  try {
    const json = dec.decode(plaintext);
    delta = JSON.parse(json);
  } catch (error: any) {
    throw new Error(`Invalid delta JSON: ${error.message}`);
  }

  // Validate delta structure
  if (
    typeof delta.sessionId !== 'string' ||
    typeof delta.checkpointIndex !== 'number' ||
    typeof delta.proofHash !== 'string' ||
    typeof delta.startToken !== 'number' ||
    typeof delta.endToken !== 'number' ||
    !Array.isArray(delta.messages) ||
    typeof delta.hostSignature !== 'string'
  ) {
    throw new Error('Invalid decrypted delta: missing or invalid required fields');
  }

  return delta;
}

/**
 * Decrypt a checkpoint delta if encrypted, otherwise return as-is.
 *
 * This provides backward compatibility:
 * - Encrypted deltas (encrypted=true) are decrypted
 * - Plaintext deltas (no encrypted field) are returned as-is
 *
 * @param delta - Encrypted or plaintext delta
 * @param userPrivateKeyHex - User's recovery private key (optional for plaintext)
 * @returns Decrypted CheckpointDelta
 * @throws Error if encrypted and decryption fails
 * @throws Error if encrypted and no private key provided
 */
export function decryptDeltaIfNeeded(
  delta: EncryptedCheckpointDelta | CheckpointDelta,
  userPrivateKeyHex?: string
): CheckpointDelta {
  // Check if encrypted
  if (isEncryptedDelta(delta)) {
    if (!userPrivateKeyHex) {
      throw new Error('DECRYPTION_KEY_REQUIRED: User private key required for encrypted checkpoint');
    }
    return decryptCheckpointDelta(delta, userPrivateKeyHex);
  }

  // Plaintext - return as-is
  return delta as CheckpointDelta;
}
