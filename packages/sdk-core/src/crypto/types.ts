// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Cryptographic type definitions for end-to-end encryption.
 *
 * This module defines types for ephemeral-static ECDH encryption
 * with ECDSA signature-based sender authentication.
 */

/**
 * Hex string type (with or without 0x prefix)
 */
export type Hex = `0x${string}` | string;

/**
 * Encrypted payload with ephemeral key and signature.
 *
 * This format enables:
 * - Forward secrecy (ephemeral keys)
 * - Sender authentication (ECDSA signature)
 * - Message integrity (Poly1305 AEAD tag)
 * - Context binding (signature covers all parameters)
 */
export interface EphemeralCipherPayload {
  // Encryption parameters
  /** Sender's ephemeral compressed public key (33 bytes hex) */
  ephPubHex: string;

  /** HKDF salt (16 bytes hex) */
  saltHex: string;

  /** XChaCha20 nonce (24 bytes hex) */
  nonceHex: string;

  /** Ciphertext with Poly1305 tag (variable length hex) */
  ciphertextHex: string;

  // Authentication
  /** ECDSA signature with recovery ID (65 bytes hex: r + s + recovery_id) */
  signatureHex: string;

  /** Recovery ID for public key recovery (0-3) - redundant with byte 65 of signature, kept for compatibility */
  recid: number;

  // Metadata
  /** Algorithm identifier */
  alg: string;

  /** HKDF info/domain separator (hex, empty string for node v8.0.0 compatibility) */
  info: string;

  /** Additional authenticated data (hex, empty string if not provided) */
  aadHex: string;
}

/**
 * Options for encryption operations
 */
export interface EncryptEphemeralOptions {
  /** Additional authenticated data (not encrypted, but authenticated) */
  aad?: Uint8Array;

  /** HKDF info/domain separator (default: empty byte array for node v8.0.0 compatibility) */
  info?: Uint8Array;

  /** HKDF salt (16 bytes, random if not provided) */
  salt?: Uint8Array;

  /** XChaCha20 nonce (24 bytes, random if not provided) */
  nonce?: Uint8Array;
}

/**
 * Options for decryption operations
 */
export interface DecryptEphemeralOptions {
  /** Additional authenticated data (must match encryption AAD) */
  aad?: Uint8Array;

  /** HKDF info/domain separator (defaults to payload.info, empty byte array for node v8.0.0) */
  info?: Uint8Array;
}
