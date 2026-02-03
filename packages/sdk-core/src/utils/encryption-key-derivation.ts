// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Encryption Key Derivation from S5 Seed Phrase
 *
 * This module provides deterministic encryption key derivation from S5 seed phrases.
 * By deriving the EncryptionManager key from the same seed used for S5 identity,
 * we ensure consistent encryption/decryption across all browser tabs and sessions.
 *
 * Background:
 * - S5 identity is derived from seed phrase (deterministic)
 * - EncryptionManager was previously derived from signer (non-deterministic for passkeys)
 * - This caused cross-tab decryption failures for Base Account Kit users
 *
 * Solution:
 * - Derive EncryptionManager key from S5 seed phrase using domain-separated SHA-256
 * - Same seed phrase → same encryption key → cross-tab consistency
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '../crypto/utilities';

/**
 * Domain separator for encryption key derivation.
 * This ensures the encryption key is different from any other key derived from the seed.
 */
const DOMAIN_SEPARATOR = 'fabstir-encryption-key-from-s5-seed-v1';

/**
 * Derive deterministic encryption private key from S5 seed phrase.
 *
 * This ensures consistent EncryptionManager keys across all browser tabs/sessions
 * when the same S5 seed is used. The key derivation uses SHA-256 with a domain
 * separator to prevent key reuse across different contexts.
 *
 * @param seedPhrase - The S5 seed phrase (15 words)
 * @returns Private key hex string (no 0x prefix, 64 chars = 32 bytes)
 */
export function deriveEncryptionKeyFromSeed(seedPhrase: string): string {
  if (!seedPhrase || seedPhrase.trim().length === 0) {
    throw new Error('Seed phrase is required for encryption key derivation');
  }

  // Concatenate seed phrase with domain separator
  const input = seedPhrase + DOMAIN_SEPARATOR;

  // Hash to derive 32-byte private key
  const hash = sha256(new TextEncoder().encode(input));

  return bytesToHex(hash);
}
