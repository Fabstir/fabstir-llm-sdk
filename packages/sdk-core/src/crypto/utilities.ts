/**
 * Core cryptographic utility functions.
 *
 * These utilities provide:
 * - Hex/bytes conversion
 * - Public key compression
 * - EVM address derivation (EIP-55)
 * - Signature message construction
 */

import * as secp from '@noble/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { sha256 } from '@noble/hashes/sha256';
import type { Hex } from './types';

const enc = new TextEncoder();

/**
 * Convert hex string to Uint8Array.
 * Handles both with and without 0x prefix.
 *
 * @param hex - Hex string (with or without 0x prefix)
 * @returns Byte array
 * @throws Error if hex length is odd
 */
export function hexToBytes(hex: Hex): Uint8Array {
  const h = (hex as string).replace(/^0x/i, '');
  if (h.length % 2) {
    throw new Error('Invalid hex length');
  }
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Convert Uint8Array to lowercase hex string (without 0x prefix).
 *
 * @param b - Byte array
 * @returns Hex string (lowercase, no 0x prefix)
 */
export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert public key to compressed format (33 bytes).
 *
 * Accepts both compressed (33 bytes) and uncompressed (65 bytes) keys.
 * If already compressed, returns as-is.
 *
 * @param pub - Public key (Uint8Array or hex string)
 * @returns Compressed public key (33 bytes, 0x02/0x03 prefix)
 */
export function toCompressedPub(pub: Uint8Array | string): Uint8Array {
  const bytes = typeof pub === 'string' ? hexToBytes(pub) : pub;

  // Already compressed
  if (bytes.length === 33 && (bytes[0] === 0x02 || bytes[0] === 0x03)) {
    return bytes;
  }

  // Convert via secp256k1 point
  const point = secp.ProjectivePoint.fromHex(bytes);
  return point.toRawBytes(true); // true = compressed
}

/**
 * Derive EVM address from secp256k1 public key.
 *
 * Algorithm (per Ethereum yellow paper):
 * 1. Convert pubkey to uncompressed format (65 bytes: 0x04 || X || Y)
 * 2. Compute keccak256(X || Y) (drop 0x04 prefix)
 * 3. Take last 20 bytes
 * 4. Apply EIP-55 checksum
 *
 * @param pubkey - Public key (compressed/uncompressed, Uint8Array or hex)
 * @returns Checksummed EVM address (EIP-55 format)
 */
export function pubkeyToAddress(pubkey: Uint8Array | Hex): string {
  // Convert to uncompressed 65-byte format
  const point = secp.ProjectivePoint.fromHex(
    typeof pubkey === 'string' ? hexToBytes(pubkey) : pubkey
  );
  const uncompressed = point.toRawBytes(false); // 65 bytes: 0x04 || X || Y

  // EVM address = keccak256(X || Y)[12:]
  const hash = keccak_256(uncompressed.slice(1)); // Drop 0x04 prefix
  const addrHex = '0x' + bytesToHex(hash.slice(-20));

  return toChecksumAddress(addrHex);
}

/**
 * Apply EIP-55 checksum to Ethereum address.
 *
 * EIP-55 uses mixed case as a checksum:
 * - Compute keccak256(lowercase_address)
 * - For each hex character, if hash[i] >= 8, capitalize it
 *
 * @param addr - Ethereum address (any case)
 * @returns Checksummed address (EIP-55)
 */
export function toChecksumAddress(addr: string): string {
  const hex = addr.toLowerCase().replace(/^0x/, '');
  const hash = bytesToHex(keccak_256(enc.encode(hex)));

  let result = '0x';
  for (let i = 0; i < hex.length; i++) {
    result += parseInt(hash[i], 16) >= 8 ? hex[i].toUpperCase() : hex[i];
  }

  return result;
}

/**
 * Construct message for ECDSA signature.
 *
 * The signed message binds all encryption context to prevent:
 * - Ephemeral key swapping (MITM)
 * - Context tampering
 * - Replay attacks
 *
 * Format: SHA256("E2EEv1|" || ephPub || "|" || recipientPub || "|" || salt || "|" || nonce || "|" || info [|| "|" || aad])
 *
 * @param ephPub - Ephemeral public key (compressed, 33 bytes)
 * @param recipientPub - Recipient's static public key (compressed, 33 bytes)
 * @param salt - HKDF salt (16 bytes)
 * @param nonce - XChaCha20 nonce (24 bytes)
 * @param info - HKDF info/domain separator (empty byte array for node v8.0.0 compatibility)
 * @param aad - Optional additional authenticated data
 * @returns SHA-256 hash (32 bytes) ready for ECDSA signing
 */
export function makeSigMessage(
  ephPub: Uint8Array,
  recipientPub: Uint8Array,
  salt: Uint8Array,
  nonce: Uint8Array,
  info: Uint8Array,
  aad?: Uint8Array
): Uint8Array {
  const parts = [
    enc.encode('E2EEv1|'),
    ephPub,
    enc.encode('|'),
    recipientPub,
    enc.encode('|'),
    salt,
    enc.encode('|'),
    nonce,
    enc.encode('|'),
    info,
  ];

  if (aad && aad.length) {
    parts.push(enc.encode('|'), aad);
  }

  // Concatenate all parts
  const totalLen = parts.reduce((n, p) => n + p.length, 0);
  const message = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    message.set(part, offset);
    offset += part.length;
  }

  // Return SHA-256 hash (ECDSA signs 32-byte digest)
  return sha256(message);
}
