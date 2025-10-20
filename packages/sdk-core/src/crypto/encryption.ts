// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Ephemeral-static ECDH encryption with signature recovery.
 *
 * Provides:
 * - Forward secrecy (ephemeral keys)
 * - Sender authentication (ECDSA signature)
 * - Message integrity (XChaCha20-Poly1305 AEAD)
 * - Context binding (signature covers all parameters)
 */

import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hkdf } from '@noble/hashes/hkdf';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hexToBytes, bytesToHex, toCompressedPub, makeSigMessage } from './utilities';
import type { EphemeralCipherPayload, EncryptEphemeralOptions, DecryptEphemeralOptions } from './types';

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * HKDF key derivation (32 bytes output).
 *
 * @param keyMaterial - Input key material (shared secret, 32 bytes)
 * @param salt - Salt for HKDF (32 bytes of zeros for node v8.0.0 compatibility)
 * @param info - Context info (empty byte array for node v8.0.0 compatibility)
 * @returns Derived key (32 bytes)
 */
function hkdf32(keyMaterial: Uint8Array, salt: Uint8Array, info: Uint8Array): Uint8Array {
  return hkdf(sha256, keyMaterial, salt, info, 32);
}

/**
 * Encrypt plaintext for recipient using ephemeral-static ECDH.
 *
 * Algorithm:
 * 1. Generate fresh ephemeral keypair
 * 2. ECDH(ephemeral_priv, recipient_static_pub) → shared_secret
 * 3. HKDF(shared_secret, salt, info) → symmetric_key
 * 4. XChaCha20-Poly1305.encrypt(plaintext, key, nonce, aad)
 * 5. ECDSA.sign(context, sender_static_priv) → signature
 *
 * The signature binds all encryption context to prevent MITM attacks.
 *
 * @param recipientPubHex - Recipient's static public key (compressed hex)
 * @param senderStaticPrivHex - Sender's static private key (hex)
 * @param plaintext - Message to encrypt (string or bytes)
 * @param opts - Optional parameters (salt, nonce, aad, info)
 * @returns Encrypted payload with ephemeral key and signature
 */
export async function encryptForEphemeral(
  recipientPubHex: string,
  senderStaticPrivHex: string,
  plaintext: string | Uint8Array,
  opts: EncryptEphemeralOptions = {}
): Promise<EphemeralCipherPayload> {
  const alg = 'secp256k1-ecdh(ephemeral→static)+hkdf(sha256)+xchacha20-poly1305';
  // CRITICAL: Node v8.0.0 uses empty byte array for HKDF info parameter
  // Using non-empty info would derive a different key and cause AEAD authentication errors
  const info = opts.info ?? new Uint8Array(0);

  // 1. Generate ephemeral keypair
  const ephPriv = secp.utils.randomPrivateKey();
  const ephPubCompressed = secp.getPublicKey(ephPriv, true); // 33 bytes compressed

  // 2. Prepare identities
  const recipientPubCompressed = toCompressedPub(recipientPubHex);
  const senderStaticPrivBytes = hexToBytes(senderStaticPrivHex);

  // 3. ECDH: ephemeral_priv × recipient_static_pub → shared_secret
  const sharedPoint = secp.getSharedSecret(ephPriv, recipientPubCompressed, true);
  const sharedSecret = sharedPoint.slice(1); // Drop 0x02/0x03 prefix, use X coordinate (32 bytes)

  // 4. HKDF: shared_secret → symmetric_key
  // CRITICAL: Node v8.0.0 uses salt=None, which means 32 bytes of zeros in Rust's HKDF
  // Using a random salt would derive a different key than the node
  const salt = opts.salt ?? new Uint8Array(32); // 32 bytes of zeros (matches node's None salt)
  const key = hkdf32(sharedSecret, salt, info);

  // 5. AEAD encrypt
  const nonce = opts.nonce ?? crypto.getRandomValues(new Uint8Array(24)); // XChaCha20 uses 24-byte nonce
  const aad = opts.aad ?? new Uint8Array(0); // Empty byte array when not provided (node expects vec![], not None)
  const cipher = xchacha20poly1305(key, nonce, aad);
  const pt = typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext;
  const ct = cipher.encrypt(pt);

  // 6. Sign context (binds ephemeral key to sender identity)
  const msg = makeSigMessage(
    ephPubCompressed,
    recipientPubCompressed,
    salt,
    nonce,
    info,
    aad
  );
  const signature = await secp.signAsync(msg, senderStaticPrivBytes); // Returns RecoveredSignature
  const compactSig = hexToBytes(signature.toCompactHex()); // 64 bytes
  const recid = signature.recovery;

  // Create 65-byte signature: [r (32) + s (32) + recovery_id (1)]
  const sig65 = new Uint8Array(65);
  sig65.set(compactSig, 0); // Copy 64-byte compact signature
  sig65[64] = recid; // Append recovery ID as 65th byte
  const signatureHex = bytesToHex(sig65);

  // 7. Build payload
  const payload: EphemeralCipherPayload = {
    ephPubHex: bytesToHex(ephPubCompressed),
    saltHex: bytesToHex(salt),
    nonceHex: bytesToHex(nonce),
    ciphertextHex: bytesToHex(ct),
    signatureHex, // 65 bytes: [r (32) + s (32) + recovery_id (1)]
    recid, // Keep for backward compatibility (redundant with byte 65 of signature)
    alg,
    info: bytesToHex(info), // Store info as hex (empty string for node v8.0.0 compatibility)
    aadHex: aad ? bytesToHex(aad) : '', // Always include aadHex (empty string if no AAD)
  };

  // 8. Security hygiene: erase ephemeral private key
  ephPriv.fill(0);
  senderStaticPrivBytes.fill(0);

  return payload;
}

/**
 * Decrypt payload encrypted with ephemeral-static ECDH.
 *
 * Algorithm:
 * 1. Recover sender's static public key from signature
 * 2. Verify ECDSA signature over context
 * 3. ECDH(recipient_static_priv, ephemeral_pub) → shared_secret
 * 4. HKDF(shared_secret, salt, info) → symmetric_key
 * 5. XChaCha20-Poly1305.decrypt(ciphertext, key, nonce, aad)
 *
 * Throws if signature verification fails or ciphertext is tampered.
 *
 * @param myRecipientPrivHex - Recipient's static private key (hex)
 * @param recipientPubHex - Recipient's static public key (hex, for signature verification)
 * @param payload - Encrypted payload from encryptForEphemeral()
 * @param opts - Optional parameters (aad, info overrides)
 * @returns Decrypted plaintext (UTF-8 string)
 * @throws Error if signature verification fails or decryption fails
 */
export function decryptFromEphemeral(
  myRecipientPrivHex: string,
  recipientPubHex: string,
  payload: EphemeralCipherPayload,
  opts: DecryptEphemeralOptions = {}
): string {
  // Parse info from hex (empty string → empty byte array for node v8.0.0 compatibility)
  const info = opts.info ?? (payload.info && payload.info !== '' ? hexToBytes(payload.info) : new Uint8Array(0));

  // 1. Parse payload
  const ephPub = toCompressedPub(payload.ephPubHex);
  const salt = hexToBytes(payload.saltHex);
  const nonce = hexToBytes(payload.nonceHex);
  const ct = hexToBytes(payload.ciphertextHex);
  const recipientPubCompressed = toCompressedPub(recipientPubHex);
  // Empty string means empty byte array (not undefined/None)
  const aad = payload.aadHex !== '' ? hexToBytes(payload.aadHex) : new Uint8Array(0);

  // 2. Recover sender's static public key from signature
  const msg = makeSigMessage(ephPub, recipientPubCompressed, salt, nonce, info, aad);

  // Parse 65-byte signature: [r (32) + s (32) + recovery_id (1)]
  const sigBytes = hexToBytes(payload.signatureHex);
  if (sigBytes.length !== 65) {
    throw new Error(`Invalid signature length: expected 65 bytes, got ${sigBytes.length}`);
  }
  const compactSig = sigBytes.slice(0, 64); // First 64 bytes
  const recid = sigBytes[64]; // Last byte is recovery ID

  let senderIdPub: Uint8Array;
  try {
    const signature = secp.Signature.fromCompact(compactSig).addRecoveryBit(recid);
    senderIdPub = signature.recoverPublicKey(msg).toRawBytes(true); // compressed
  } catch (error) {
    throw new Error(`Signature recovery failed: ${error instanceof Error ? error.message : 'invalid signature'}`);
  }

  // 3. Verify signature
  const valid = secp.verify(compactSig, msg, senderIdPub);
  if (!valid) {
    throw new Error('Signature verification failed: message not from claimed sender');
  }

  // 4. ECDH: recipient_static_priv × ephemeral_pub → shared_secret
  const myRecipientPrivBytes = hexToBytes(myRecipientPrivHex);
  const sharedPoint = secp.getSharedSecret(myRecipientPrivBytes, ephPub, true);
  const sharedSecret = sharedPoint.slice(1); // Drop 0x02/0x03 prefix, use X coordinate

  // 5. HKDF: shared_secret → symmetric_key
  const key = hkdf32(sharedSecret, salt, info);

  // 6. AEAD decrypt
  const cipher = xchacha20poly1305(key, nonce, aad);
  const pt = cipher.decrypt(ct); // Throws if tag verification fails

  // 7. Security hygiene: erase private key
  myRecipientPrivBytes.fill(0);

  return dec.decode(pt);
}
