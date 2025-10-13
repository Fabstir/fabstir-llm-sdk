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
 * @param keyMaterial - Input key material (shared secret)
 * @param salt - Salt for HKDF (16 bytes)
 * @param info - Context string (domain separator)
 * @returns Derived key (32 bytes)
 */
function hkdf32(keyMaterial: Uint8Array, salt: Uint8Array, info: string): Uint8Array {
  return hkdf(sha256, keyMaterial, salt, enc.encode(info), 32);
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
  const info = opts.info ?? 'e2ee:ecdh-secp256k1:xchacha20poly1305:v1';

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
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const key = hkdf32(sharedSecret, salt, info);

  // 5. AEAD encrypt
  const nonce = opts.nonce ?? crypto.getRandomValues(new Uint8Array(24)); // XChaCha20 uses 24-byte nonce
  const aad = opts.aad;
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
  const signatureHex = signature.toCompactHex();
  const recid = signature.recovery;

  // 7. Build payload
  const payload: EphemeralCipherPayload = {
    ephPubHex: bytesToHex(ephPubCompressed),
    saltHex: bytesToHex(salt),
    nonceHex: bytesToHex(nonce),
    ciphertextHex: bytesToHex(ct),
    signatureHex,
    recid,
    alg,
    info,
    ...(aad ? { aadHex: bytesToHex(aad) } : {}),
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
  const info = opts.info ?? payload.info ?? 'e2ee:ecdh-secp256k1:xchacha20poly1305:v1';

  // 1. Parse payload
  const ephPub = toCompressedPub(payload.ephPubHex);
  const salt = hexToBytes(payload.saltHex);
  const nonce = hexToBytes(payload.nonceHex);
  const ct = hexToBytes(payload.ciphertextHex);
  const recipientPubCompressed = toCompressedPub(recipientPubHex);
  const aad = payload.aadHex ? hexToBytes(payload.aadHex) : opts.aad;

  // 2. Recover sender's static public key from signature
  const msg = makeSigMessage(ephPub, recipientPubCompressed, salt, nonce, info, aad);

  let senderIdPub: Uint8Array;
  try {
    const signature = secp.Signature.fromCompact(payload.signatureHex).addRecoveryBit(payload.recid);
    senderIdPub = signature.recoverPublicKey(msg).toRawBytes(true); // compressed
  } catch (error) {
    throw new Error(`Signature recovery failed: ${error instanceof Error ? error.message : 'invalid signature'}`);
  }

  // 3. Verify signature
  const valid = secp.verify(payload.signatureHex, msg, senderIdPub);
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
