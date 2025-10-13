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
  /** ECDSA signature - compact form (64 bytes hex) */
  signatureHex: string;

  /** Recovery ID for public key recovery (0-3) */
  recid: number;

  // Metadata
  /** Algorithm identifier */
  alg: string;

  /** HKDF info/domain separator */
  info: string;

  /** Optional additional authenticated data (hex) */
  aadHex?: string;
}

/**
 * Options for encryption operations
 */
export interface EncryptEphemeralOptions {
  /** Additional authenticated data (not encrypted, but authenticated) */
  aad?: Uint8Array;

  /** HKDF info/domain separator (default: "e2ee:ecdh-secp256k1:xchacha20poly1305:v1") */
  info?: string;

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

  /** HKDF info/domain separator (defaults to payload.info) */
  info?: string;
}
